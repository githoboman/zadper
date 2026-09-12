import { describe, expect, it } from "vitest";
import {
  botChainEvidenceEndpoints,
  defaultEvidenceNetwork,
  evidenceRpcUrl,
  parseEvidenceNetwork
} from "../src/evidenceNetwork.js";

describe("evidence network configuration", () => {
  it("accepts only explicit Bot Chain evidence networks", () => {
    expect(parseEvidenceNetwork("botchain:mainnet")).toBe("botchain:mainnet");
    expect(parseEvidenceNetwork("botchain:testnet")).toBe("botchain:testnet");
    expect(parseEvidenceNetwork("botchain:testnet")).toBeNull();
  });

  it("keeps evidence RPC selection separate from the x402 payment RPC", () => {
    const env = {
      CASPER_RPC_URL: "https://payment-testnet.example/rpc",
      AGENTPAY_MAINNET_RPC_URL: "https://mainnet.example/rpc",
      AGENTPAY_TESTNET_RPC_URL: "https://evidence-testnet.example/rpc"
    };

    expect(evidenceRpcUrl("botchain:mainnet", env)).toBe("https://mainnet.example/rpc");
    expect(evidenceRpcUrl("botchain:testnet", env)).toBe(
      "https://evidence-testnet.example/rpc"
    );
  });

  it("selects matching CSPR.cloud endpoints for each evidence network", () => {
    expect(botChainEvidenceEndpoints("botchain:mainnet", {})).toEqual({
      restBase: "https://api.cspr.cloud",
      nodeRpcUrl: "https://node.cspr.cloud/rpc"
    });
    expect(botChainEvidenceEndpoints("botchain:testnet", {})).toEqual({
      restBase: "https://api.testnet.cspr.cloud",
      nodeRpcUrl: "https://node.testnet.cspr.cloud/rpc"
    });
  });

  it("defaults to Testnet for backward-compatible CLI calls and rejects bad configuration", () => {
    expect(defaultEvidenceNetwork({})).toBe("botchain:testnet");
    expect(() =>
      defaultEvidenceNetwork({ AGENTPAY_DEFAULT_EVIDENCE_NETWORK: "wrong" })
    ).toThrow(/botchain:mainnet or botchain:testnet/);
  });
});
