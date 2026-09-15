import { describe, it, expect } from "vitest";
import { buildSubjectEvidence } from "../src/subjectEvidence.js";
import { extractSignals } from "@agent-pay/core";

const subject = { kind: "token" as const, address: "a".repeat(40), raw: "a".repeat(40) };

describe("buildSubjectEvidence", () => {
  it("builds a Merkle dataset of the mandatory signal records", async () => {
    const ds = await buildSubjectEvidence(subject, {
      fetchTokenState: async () => ({ mintBurnEnabled: true,
        holderCount: 1, topHolderPct: 100, installBlock: 100, latestBlock: 130,
        authoritySourceUrl: "https://node.testnet.example/rpc",
        holdersSourceUrl: "https://node.testnet.example/rpc",
        ageSourceUrl: "https://node.testnet.example/rpc" }),
    });
    expect(ds.root).toMatch(/^[0-9a-f]+$/);
    const signals = extractSignals(ds.reports.map((r) => r.record));
    expect(signals.mintBurnEnabled).toBe(true);
    expect(signals.contractAgeBlocks).toBe(30);
    expect(signals.lpHolderCount).toBeNull(); // not checked on Testnet
    expect(signals.holderCount).toBe(1);
    expect(signals.topHolderPct).toBe(100);
    expect(signals.liquidityDepth).toBeNull(); // not checked on Testnet

    expect(ds.reports.map((report) => [report.record.subject, report.record.sourceUrl])).toEqual([
      ["token_authority", "https://node.testnet.example/rpc"],
      ["token_holders", "https://node.testnet.example/rpc"],
      ["token_age", "https://node.testnet.example/rpc"]
    ]);
    expect(ds.sourceSummary.map((source) => source.sourceUrl)).toEqual(
      ds.reports.map((report) => report.record.sourceUrl)
    );
  });

  it("does not emit a negative contract age when source heights are inconsistent", async () => {
    const ds = await buildSubjectEvidence(subject, {
      fetchTokenState: async () => ({
        mintBurnEnabled: false,
        holderCount: 10,
        topHolderPct: 25,
        installBlock: 200,
        latestBlock: 130
      })
    });

    expect(extractSignals(ds.reports.map((report) => report.record)).contractAgeBlocks).toBeNull();
  });

  it("labels and scopes Mainnet evidence independently of payment configuration", async () => {
    const ds = await buildSubjectEvidence(subject, {
      network: "botchain:mainnet",
      fetchTokenState: async () => ({
        mintBurnEnabled: false,
        holderCount: 10,
        topHolderPct: 25,
        installBlock: 100,
        latestBlock: 1500
      })
    });

    expect(ds.datasetId).toMatch(/^trust-botchain:mainnet-/);
    expect(ds.sourceSummary.every((source) => source.network === "botchain:mainnet")).toBe(true);
    expect(ds.sourceSummary).toContainEqual(expect.objectContaining({
      product: "BotChain Token Authority"
    }));
  });

  it("gives concurrent checks distinct registry dataset ids even at the same block", async () => {
    const fetchTokenState = async () => ({
      mintBurnEnabled: false,
      publicMintEntrypoint: false,
      holderCount: 20,
      topHolderPct: 12,
      installBlock: 100,
      latestBlock: 2000
    });
    const a = buildSubjectEvidence(subject, { fetchTokenState });
    const b = buildSubjectEvidence(subject, { fetchTokenState });
    expect((await a).datasetId).not.toEqual((await b).datasetId);
  });
});
