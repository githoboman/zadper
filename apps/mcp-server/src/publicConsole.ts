import {
  extractAccountSignals,
  extractSignals,
  hashJson,
  scoreAccount,
  scoreSubject,
  verifyReportProof,
  type EvidenceRecord,
  type ReportProof
} from "@agent-pay/core";
import type { PaidReportResult } from "./apiClient.js";
import { ToolInputError } from "./errors.js";

const DEFAULT_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_CAPABILITIES = 1_000;
const HASH = /^[0-9a-f]{64}$/i;

type RecordDecisionInput = {
  datasetId: string;
  datasetRoot: string;
  reportHash: string;
  paymentReceiptHash: string;
  decision: "approved" | "needs_review" | "rejected";
};

type Capability = {
  input: RecordDecisionInput;
  expiresAt: number;
  state: "ready" | "pending";
};

export type PublicDecisionClaim = {
  paymentReceiptHash: string;
};

export class PublicDecisionCapabilities {
  private readonly capabilities = new Map<string, Capability>();
  private readonly now: () => number;

  constructor(
    private readonly options: {
      ttlMs?: number;
      maxCapabilities?: number;
      now?: () => number;
    } = {}
  ) {
    this.now = options.now ?? Date.now;
  }

  register(paidReport: PaidReportResult): RecordDecisionInput {
    const input = decisionInputForPaidReport(paidReport);
    this.prune();
    this.capabilities.set(input.paymentReceiptHash, {
      input,
      expiresAt: this.now() + (this.options.ttlMs ?? DEFAULT_TTL_MS),
      state: "ready"
    });
    while (this.capabilities.size > (this.options.maxCapabilities ?? DEFAULT_MAX_CAPABILITIES)) {
      const oldest = this.capabilities.keys().next().value as string | undefined;
      if (!oldest) break;
      this.capabilities.delete(oldest);
    }
    return input;
  }

  claim(value: unknown): PublicDecisionClaim {
    const input = requireDecisionInput(value);
    this.prune();
    const capability = this.capabilities.get(input.paymentReceiptHash);
    if (!capability || capability.state !== "ready" || !sameDecisionInput(capability.input, input)) {
      throw new ToolInputError(
        "Public browser recording requires the exact decision from a paid report settled in this session"
      );
    }
    capability.state = "pending";
    return { paymentReceiptHash: input.paymentReceiptHash };
  }

  complete(claim: PublicDecisionClaim): void {
    this.capabilities.delete(claim.paymentReceiptHash);
  }

  release(claim: PublicDecisionClaim): void {
    const capability = this.capabilities.get(claim.paymentReceiptHash);
    if (capability?.state === "pending") capability.state = "ready";
  }

  private prune(): void {
    const now = this.now();
    for (const [key, capability] of this.capabilities) {
      if (capability.expiresAt <= now) this.capabilities.delete(key);
    }
  }
}

export function decisionInputForPaidReport(paidReport: PaidReportResult): RecordDecisionInput {
  if (
    paidReport.payment?.scheme !== "x402" ||
    paidReport.payment.status !== "settled" ||
    paidReport.payment.confirmation?.executionState !== "executed"
  ) {
    throw new ToolInputError("Public browser recording requires an executed x402 settlement");
  }
  const datasetId = nonEmptyText(paidReport.datasetId, "paid report dataset id");
  const datasetRoot = hash(paidReport.datasetRoot, "paid report dataset root");
  const reportHash = hash(paidReport.reportHash, "paid report hash");
  const paymentReceiptHash = hash(paidReport.paymentReceiptHash, "paid report payment receipt hash");
  if (hashJson(paidReport.report) !== reportHash) {
    throw new ToolInputError("Paid report content does not match its report hash");
  }

  const evidence = requireEvidence(paidReport.evidence);
  for (const leaf of evidence) {
    if (
      leaf.datasetId !== datasetId ||
      hashJson(leaf.record) !== leaf.reportHash ||
      !verifyReportProof(leaf.record, leaf.proof, datasetRoot)
    ) {
      throw new ToolInputError("Paid report evidence does not match its committed dataset root");
    }
  }

  const records = evidence.map((leaf) => leaf.record);
  const account = records.some(
    (record) => typeof record.subject === "string" && record.subject.startsWith("account_")
  );
  const decision = account
    ? scoreAccount(extractAccountSignals(records)).decision
    : scoreSubject(extractSignals(records)).decision;

  return { datasetId, datasetRoot, reportHash, paymentReceiptHash, decision };
}

function requireEvidence(value: unknown): ReportProof[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    throw new ToolInputError("Paid report must contain a bounded evidence set");
  }
  for (const candidate of value) {
    const leaf = candidate as Partial<ReportProof>;
    if (
      !leaf ||
      typeof leaf !== "object" ||
      typeof leaf.datasetId !== "string" ||
      !HASH.test(leaf.reportHash ?? "") ||
      !isEvidenceRecord(leaf.record) ||
      !Array.isArray(leaf.proof)
    ) {
      throw new ToolInputError("Paid report contains malformed evidence");
    }
  }
  return value as ReportProof[];
}

function isEvidenceRecord(value: unknown): value is EvidenceRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireDecisionInput(value: unknown): RecordDecisionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolInputError("record_decision input must be an object");
  }
  const input = value as Partial<RecordDecisionInput>;
  const decision = input.decision;
  if (decision !== "approved" && decision !== "needs_review" && decision !== "rejected") {
    throw new ToolInputError("record_decision decision is invalid");
  }
  return {
    datasetId: nonEmptyText(input.datasetId, "record_decision datasetId"),
    datasetRoot: hash(input.datasetRoot, "record_decision datasetRoot"),
    reportHash: hash(input.reportHash, "record_decision reportHash"),
    paymentReceiptHash: hash(input.paymentReceiptHash, "record_decision paymentReceiptHash"),
    decision
  };
}

function sameDecisionInput(left: RecordDecisionInput, right: RecordDecisionInput): boolean {
  return (
    left.datasetId === right.datasetId &&
    left.datasetRoot === right.datasetRoot &&
    left.reportHash === right.reportHash &&
    left.paymentReceiptHash === right.paymentReceiptHash &&
    left.decision === right.decision
  );
}

function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH.test(value)) {
    throw new ToolInputError(`${label} must be 64 hexadecimal characters`);
  }
  return value.toLowerCase();
}

function nonEmptyText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolInputError(`${label} must be a non-empty string`);
  }
  return value.trim();
}
