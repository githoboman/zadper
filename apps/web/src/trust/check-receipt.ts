import type { Verdict } from "../api";

export type ZadperCheckReceipt = {
  product: "Zadper Check Receipt";
  aspect: Verdict["aspect"];
  decision: Verdict["decision"];
  subject: {
    kind: string;
    id: string;
    fingerprint: string;
  };
  evidence: {
    datasetRoot: string;
    policyHash: string;
  };
  payment: {
    scheme: "x402";
    receiptHash: string;
    settlementTxHash: string;
  };
  botchainRecord: {
    decisionTxHash: string;
    explorerUrl: string;
  };
};

export function buildCheckReceipt(verdict: Verdict): ZadperCheckReceipt {
  return {
    product: "Zadper Check Receipt",
    aspect: verdict.aspect,
    decision: verdict.decision,
    subject: {
      kind: verdict.subject.kind,
      id: verdict.subject.raw,
      fingerprint: verdict.subject.address
    },
    evidence: {
      datasetRoot: verdict.datasetRoot,
      policyHash: verdict.policyHash
    },
    payment: {
      scheme: "x402",
      receiptHash: verdict.paymentReceiptHash,
      settlementTxHash: verdict.settlementTxHash
    },
    botchainRecord: {
      decisionTxHash: verdict.decisionTxHash,
      explorerUrl: verdict.explorerUrl
    }
  };
}

export function serializeCheckReceipt(receipt: ZadperCheckReceipt): string {
  return JSON.stringify(receipt, null, 2);
}

export function botchainTransactionUrl(hash: string): string {
  return `https://testnet.cspr.live/transaction/${hash}`;
}
