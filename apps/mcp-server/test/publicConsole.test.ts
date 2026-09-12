import { buildDataset, type EvidenceRecord } from "@agent-pay/core";
import { describe, expect, it } from "vitest";
import type { PaidReportResult } from "../src/apiClient.js";
import {
  decisionInputForPaidReport,
  PublicDecisionCapabilities
} from "../src/publicConsole.js";

describe("PublicDecisionCapabilities", () => {
  it("binds one browser registry write to a verified paid report and server-side decision", () => {
    const paidReport = clearPaidReport();
    const capabilities = new PublicDecisionCapabilities();
    const input = capabilities.register(paidReport);

    expect(input.decision).toBe("approved");
    expect(() => capabilities.claim({ ...input, decision: "rejected" })).toThrow(/exact decision/i);

    const claim = capabilities.claim(input);
    expect(() => capabilities.claim(input)).toThrow(/exact decision/i);
    capabilities.release(claim);
    const retry = capabilities.claim(input);
    capabilities.complete(retry);
    expect(() => capabilities.claim(input)).toThrow(/exact decision/i);
  });

  it("rejects paid evidence that does not match the committed root", () => {
    const paidReport = clearPaidReport();
    paidReport.evidence[0] = {
      ...paidReport.evidence[0],
      record: {
        ...paidReport.evidence[0].record,
        facts: { ...paidReport.evidence[0].record.facts, topHolderPct: 99 }
      }
    };

    expect(() => decisionInputForPaidReport(paidReport)).toThrow(/committed dataset root/i);
  });

  it("expires capabilities before they can spend registry gas", () => {
    let now = 1_000;
    const capabilities = new PublicDecisionCapabilities({ ttlMs: 100, now: () => now });
    const input = capabilities.register(clearPaidReport());
    now = 1_101;

    expect(() => capabilities.claim(input)).toThrow(/exact decision/i);
  });
});

function clearPaidReport(): PaidReportResult {
  const records: EvidenceRecord[] = [
    evidence("authority", "token_authority", { publicMintEntrypoint: false }),
    evidence("holders", "token_holders", { holderCount: 12, topHolderPct: 42 }),
    evidence("age", "token_age", { contractAgeBlocks: 5_000 })
  ];
  const dataset = buildDataset("dataset-live", records);
  const report = dataset.reports[0];
  return {
    datasetId: dataset.datasetId,
    datasetRoot: dataset.root,
    evidenceNetwork: "botchain-mainnet",
    reportId: report.record.id,
    report: report.record,
    reportHash: report.reportHash,
    proof: report.proof,
    evidence: dataset.reports,
    paymentReceiptHash: "a".repeat(64),
    payment: {
      scheme: "x402",
      status: "settled",
      transactionHash: "b".repeat(64),
      amount: "10000",
      amountDisplay: "0.00001",
      asset: "c".repeat(64),
      assetSymbol: "WCSPR",
      assetDecimals: 9,
      network: "botchain:botchain-test",
      confirmation: {
        rpcUrl: "https://node.testnet.botchain.network/rpc",
        method: "info_get_transaction",
        apiVersion: "2.0.0",
        executionState: "executed",
        blockHash: "d".repeat(64),
        attempts: 1,
        observedAt: "2026-07-24T00:00:00.000Z"
      },
      facilitatorHash: "e".repeat(64)
    }
  };
}

function evidence(
  id: string,
  subject: string,
  facts: EvidenceRecord["facts"]
): EvidenceRecord {
  return {
    id,
    product: "Bot Chain evidence",
    network: "botchain-mainnet",
    subject,
    observedAt: "2026-07-24T00:00:00.000Z",
    sourceUrl: "https://node.mainnet.botchain.network/rpc",
    facts,
    rawHash: id.padEnd(64, "0")
  };
}
