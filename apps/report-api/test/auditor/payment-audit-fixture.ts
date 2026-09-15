import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeAddress, hashMessage, SigningKey } from "ethers";
import type { Express } from "express";
import request from "supertest";
import {
  artifactHash,
  authorizationDigest,
  operatorActionMessage,
  operatorPolicyHash,
  providerDecisionHash,
  type AuthorizationIntent,
  type OperatorPolicy,
  type PaymentAssetEvidence,
  type ProviderDecision
} from "@agent-pay/core";
import { createReportApp } from "../../src/app.js";
import { AuditorAuth, hashBearerToken } from "../../src/auditor/auth.js";
import { createAuditorRouter } from "../../src/auditor/routes.js";
import { PaymentAuditService, type ReceiptAnchorScheduler } from "../../src/auditor/service.js";
import { openSqliteRepository, type SqliteAuditorRepository } from "../../src/auditor/sqliteRepository.js";

export const ORIGIN = "https://agentpay.example";
export const NOW = "2026-07-09T16:13:00.000Z";
export const TRANSACTION_HASH = "2458f77bcd56ae960c02d0dfba616c63f3008c7ee7e87bcfd861c4da87e774b4";
export const ASSET = "0x" + "9".repeat(40); // EVM contract address
export const PAYEE = "0x" + "8".repeat(40); // EVM payee address
const PAYER_PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_value, index) => index + 1);
const OPERATOR_PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_value, index) => (index + 1) * 2);
export const PAYER = computeAddress("0x" + Buffer.from(PAYER_PRIVATE_KEY).toString("hex")).toLowerCase();
export const OPERATOR = computeAddress("0x" + Buffer.from(OPERATOR_PRIVATE_KEY).toString("hex")).toLowerCase();
export const AGENT_TOKEN = "agent-payment-auditor-token-000000000000000000";
export const OPERATOR_SESSION_TOKEN = "operator-payment-session-token-000000000000000";
export const FINALIZED_TRANSACTION_RESULT = (JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../packages/agent-pay-core/test/fixtures/tab402-transaction.json", import.meta.url)),
    "utf8"
  )
) as { result: unknown }).result;

export type PaymentAuditContext = {
  app: Express;
  repository: SqliteAuditorRepository;
  setTransactionResult(value: unknown | Error): void;
};

export type PaymentAuditContextOptions = {
  payerPublicKey?: string;
  providerOrigin?: string;
  providerResourcePathPrefix?: string;
};

export function createPaymentAuditContext(
  initialResult: unknown | Error = FINALIZED_TRANSACTION_RESULT,
  anchorPublisher?: ReceiptAnchorScheduler,
  options: PaymentAuditContextOptions = {}
): PaymentAuditContext {
  const payerPublicKey = options.payerPublicKey ?? PAYER;
  const repository = openSqliteRepository(":memory:", { now: () => new Date(NOW) });
  repository.savePolicy(signedPolicy(payerPublicKey));
  repository.saveProviderDecision(signedProviderDecision({
    origin: options.providerOrigin ?? "https://tab402.fly.dev",
    resourcePathPrefix: options.providerResourcePathPrefix ?? "/v1/speak"
  }));
  repository.saveAgentToken({
    id: "agent-token-payment-audit",
    operatorPublicKey: OPERATOR,
    agentName: "checkout-agent",
    tokenHash: hashBearerToken(AGENT_TOKEN),
    scopes: ["checks:write", "settlements:write", "observations:write", "receipts:read"],
    allowedPayerPublicKeys: [payerPublicKey],
    revision: 1,
    actionHash: "1".repeat(64),
    signature: `01${"2".repeat(128)}`,
    createdAt: NOW,
    expiresAt: null,
    revokedAt: null
  });
  repository.saveSession({
    id: "operator-session-payment-audit",
    operatorPublicKey: OPERATOR,
    tokenHash: hashBearerToken(OPERATOR_SESSION_TOKEN),
    origin: ORIGIN,
    createdAt: NOW,
    expiresAt: "2026-07-09T17:13:00.000Z",
    revokedAt: null
  });

  let transactionResult = initialResult;
  const rpc = {
    rpcUrl: "https://node.testnet.botchain.network/rpc",
    async loadPaymentAssetEvidence(): Promise<PaymentAssetEvidence> {
      return paymentEvidence();
    },
    async getTransaction(): Promise<unknown> {
      if (transactionResult instanceof Error) throw transactionResult;
      return structuredClone(transactionResult);
    }
  };
  const auth = new AuditorAuth({ repository, publicOrigin: ORIGIN, now: () => new Date(NOW) });
  const service = new PaymentAuditService({
    repository,
    evidenceLoader: rpc,
    settlementLoader: rpc,
    anchorPublisher,
    now: () => new Date(NOW)
  });
  const app = createReportApp({ auditorRouter: createAuditorRouter({ repository, auth, service }) });
  return {
    app,
    repository,
    setTransactionResult(value) {
      transactionResult = value;
    }
  };
}

export async function createPayCheck(app: Express): Promise<string> {
  const response = await request(app)
    .post("/v1/checks")
    .set("Authorization", `Bearer ${AGENT_TOKEN}`)
    .set("Idempotency-Key", "tab402-payment-check")
    .send(checkBody());
  if (response.status !== 201) {
    throw new Error(`Expected 201 Created but got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  if (response.body.check.decision.verdict !== "pay") {
    throw new Error(`Payment fixture did not produce PAY: ${JSON.stringify(response.body.check.decision.reasons)}`);
  }
  return response.body.check.id as string;
}

export function pendingTransactionResult(): unknown {
  const pending = structuredClone(FINALIZED_TRANSACTION_RESULT) as {
    execution_info: unknown;
  };
  pending.execution_info = null;
  return pending;
}

export function mismatchedTransactionResult(): unknown {
  const changed = structuredClone(FINALIZED_TRANSACTION_RESULT) as {
    transaction: {
      Version1: {
        payload: {
          fields: { args: { Named: Array<[string, { parsed: unknown }]> } };
        };
      };
    };
  };
  const amount = changed.transaction.Version1.payload.fields.args.Named.find(([name]) => name === "amount");
  if (!amount) throw new Error("Captured transaction is missing amount");
  amount[1].parsed = "100000001";
  return changed;
}

function checkBody() {
  const authorizationWithoutDigest = {
    payerPublicKey: PAYER,
    from: PAYER,
    to: PAYEE,
    amount: "100000000",
    validAfter: "1783613540",
    validBefore: "1783614440",
    nonce: "c611162ab90e14f33f6593f83674d4438285999b9f68fa33bcd8d69ea784b333",
    network: "botchain:testnet" as const,
    asset: ASSET,
    tokenName: "Bot Chain X402 Token",
    tokenVersion: "1"
  };
  const authorization: AuthorizationIntent = {
    ...authorizationWithoutDigest,
    digest: authorizationDigest(authorizationWithoutDigest)
  };
  return {
    request: {
      method: "POST",
      url: "https://tab402.fly.dev/v1/speak",
      bodyHash: "0".repeat(64),
      bodyBytes: 36,
      capturedAt: NOW,
      adapterVersion: "agent-pay-client/0.1.0"
    },
    paymentRequired: {
      x402Version: 2,
      resource: {
        url: "http://tab402.fly.dev/v1/speak",
        description: "Text-to-speech",
        mimeType: "audio/mpeg"
      },
      accepts: [{
        scheme: "exact",
        network: "botchain:testnet",
        asset: ASSET,
        amount: "100000000",
        payTo: PAYEE,
        maxTimeoutSeconds: 900,
        extra: { name: "Bot Chain X402 Token", version: "1", decimals: "9", symbol: "X402" }
      }]
    },
    authorization
  };
}

function paymentEvidence(): PaymentAssetEvidence {
  const content = {
    network: "botchain:testnet" as const,
    address: ASSET,
    packageExists: true,
    activeContractHash: "4".repeat(64),
    authorizationEntrypoint: true,
    name: "Bot Chain X402 Token",
    symbol: "X402",
    decimals: 9,
    mintBurnEnabled: false,
    publicMintEntrypoint: false,
    holderConcentrationPct: 20,
    contractAgeBlocks: 10_000,
    apiVersion: "2.0.0",
    observedBlockHash: "7".repeat(64),
    observedBlockHeight: 8_449_100,
    observedAt: NOW,
    missing: [],
    sourceErrors: []
  };
  return { ...content, evidenceHash: artifactHash(content) };
}

function signedPolicy(payerPublicKey: string): OperatorPolicy {
  const policy: OperatorPolicy = {
    policyId: "policy-payment-audit",
    operatorPublicKey: OPERATOR,
    revision: 1,
    issuedAt: NOW,
    effectiveAt: NOW,
    allowedNetworks: ["botchain:testnet"],
    allowedPayerPublicKeys: [payerPublicKey],
    assetDailyCaps: { [ASSET]: "1000000000" },
    maximumAuthorizationWindowSeconds: 900,
    maximumConcurrentReservations: 5,
    deniedOrigins: [],
    deniedPayees: [],
    deniedAssets: [],
    evidenceMaxAgeSeconds: 3600,
    reviewOnInvestmentAdvisories: false,
    allowPinnedResourceSchemeMismatch: true,
    signatureMessage: "",
    signature: "",
    policyHash: ""
  };
  policy.policyHash = operatorPolicyHash(policy);
  Object.assign(policy, signArtifact("policy_revision", policy.policyHash, policy.revision));
  return policy;
}

function signedProviderDecision(input: { origin: string; resourcePathPrefix: string }): ProviderDecision {
  const decision: ProviderDecision = {
    decisionId: "provider-payment-audit",
    kind: "pin",
    operatorPublicKey: OPERATOR,
    revision: 1,
    origin: input.origin,
    payee: PAYEE,
    asset: ASSET,
    network: "botchain:testnet",
    resourcePathPrefix: input.resourcePathPrefix,
    perCallCeiling: "100000000",
    expiresAt: "2026-07-10T16:13:00.000Z",
    promptedByCheckId: "check-review",
    signatureMessage: "",
    signature: "",
    decisionHash: ""
  };
  decision.decisionHash = providerDecisionHash(decision);
  Object.assign(decision, signArtifact("provider_decision", decision.decisionHash, decision.revision));
  return decision;
}

function signArtifact(kind: "policy_revision" | "provider_decision", artifactHashValue: string, revision: number) {
  const signatureMessage = operatorActionMessage({
    kind: "agentpay_auth_challenge",
    version: 1,
    domain: "agentpay.example",
    origin: ORIGIN,
    network: "botchain:testnet",
    challengeId: `challenge-${kind}`,
    operatorPublicKey: OPERATOR,
    purpose: "operator_action",
    nonce: kind === "policy_revision" ? "a".repeat(64) : "b".repeat(64),
    issuedAt: NOW,
    expiresAt: "2026-07-09T16:18:00.000Z",
    requestedAction: { kind, artifactHash: artifactHashValue, revision }
  });
  const signingKey = new SigningKey("0x" + Buffer.from(OPERATOR_PRIVATE_KEY).toString("hex"));
  const signature = signingKey.sign(hashMessage(signatureMessage)).serialized;
  return {
    signatureMessage,
    signature
  };
}
