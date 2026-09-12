import { randomUUID } from "node:crypto";
import {
  buildDataset,
  hashJson,
  type EvidenceFactValue,
  type EvidenceRecord,
  type SubjectRef
} from "@agent-pay/core";

export type TokenState = {
  mintBurnEnabled: boolean | null;
  publicMintEntrypoint?: boolean | null;
  holderCount: number | null;
  topHolderPct: number | null;
  installBlock: number | null;
  latestBlock: number | null;
  packageCreatedAt?: string | null;
  authoritySourceUrl?: string;
  holdersSourceUrl?: string;
  ageSourceUrl?: string;
};

export type EvidenceDeps = {
  fetchTokenState?: (subject: SubjectRef) => Promise<TokenState>;
  network?: "botchain:testnet" | "botchain:mainnet";
  rpcUrl?: string;
};

export type LiveEvidenceDataset = any;

async function evmRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  if (!response.ok) throw new Error("RPC failed");
  const body = await response.json() as any;
  if (body.error || !body.result) throw new Error(body.error?.message ?? "RPC error");
  return body.result;
}

async function defaultFetchTokenState(
  subject: SubjectRef,
  network: string,
  rpcUrl: string
): Promise<TokenState> {
  let latestBlock: number | null = null;
  try {
    const result = await evmRpc<string>(rpcUrl, "eth_blockNumber", []);
    latestBlock = parseInt(result, 16);
  } catch {}

  // Return minimal token state for EVM Bot Chain
  return {
    mintBurnEnabled: null,
    publicMintEntrypoint: null,
    holderCount: null,
    topHolderPct: null,
    installBlock: null,
    latestBlock,
    packageCreatedAt: null,
    authoritySourceUrl: rpcUrl,
    holdersSourceUrl: rpcUrl,
    ageSourceUrl: rpcUrl
  };
}

export async function buildSubjectEvidence(
  subject: SubjectRef,
  deps: EvidenceDeps = {}
): Promise<LiveEvidenceDataset> {
  const network = deps.network ?? "botchain:testnet";
  const rpcUrl = deps.rpcUrl ?? (network === "botchain:mainnet" ? "https://rpc.botchain.ai" : "https://rpc.bohr.life");
  const observedAt = new Date().toISOString();
  
  const state = deps.fetchTokenState
    ? await deps.fetchTokenState(subject)
    : await defaultFetchTokenState(subject, network, rpcUrl);

  const datasetId = `trust-${network}-${subject.address.slice(0, 16)}-${state.latestBlock ?? "na"}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;

  const authorityFacts: Record<string, EvidenceFactValue> = {};
  if (state.mintBurnEnabled != null) authorityFacts.mintBurnEnabled = state.mintBurnEnabled;
  if (state.publicMintEntrypoint != null) authorityFacts.publicMintEntrypoint = state.publicMintEntrypoint;

  const authorityRecord: EvidenceRecord = {
    id: `token-authority-${subject.address.slice(0, 16)}`,
    product: "BotChain Token Authority",
    network: network as any,
    subject: "token_authority",
    observedAt,
    sourceUrl: state.authoritySourceUrl ?? rpcUrl,
    facts: authorityFacts,
    rawHash: hashJson({ subject: subject.address, ...authorityFacts })
  };

  const holderFacts: Record<string, EvidenceFactValue> = {};
  if (state.holderCount != null) holderFacts.holderCount = state.holderCount;
  if (state.topHolderPct != null) holderFacts.topHolderPct = state.topHolderPct;

  const holdersRecord: EvidenceRecord = {
    id: `token-holders-${subject.address.slice(0, 16)}`,
    product: "BotChain Token Holders",
    network: network as any,
    subject: "token_holders",
    observedAt,
    sourceUrl: state.holdersSourceUrl ?? rpcUrl,
    facts: holderFacts,
    rawHash: hashJson({ subject: subject.address, ...holderFacts })
  };

  const ageFacts: Record<string, EvidenceFactValue> = {};
  if (state.installBlock != null && state.latestBlock != null) ageFacts.contractAgeBlocks = state.latestBlock - state.installBlock;

  const ageRecord: EvidenceRecord = {
    id: `token-age-${subject.address.slice(0, 16)}`,
    product: "BotChain Token Age",
    network: network as any,
    subject: "token_age",
    observedAt,
    sourceUrl: state.ageSourceUrl ?? rpcUrl,
    facts: ageFacts,
    rawHash: hashJson({ subject: subject.address, ...ageFacts })
  };

  const dataset = buildDataset(datasetId, [authorityRecord, holdersRecord, ageRecord]);

  return {
    ...dataset,
    sourceSummary: dataset.reports.map((report) => ({
      product: report.record.product,
      network: report.record.network,
      subject: report.record.subject,
      observedAt: report.record.observedAt,
      sourceUrl: report.record.sourceUrl,
      recordHash: report.reportHash,
      facts: report.record.facts
    }))
  };
}
