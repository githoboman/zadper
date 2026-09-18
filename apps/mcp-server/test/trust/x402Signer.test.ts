import { describe, expect, it, vi } from "vitest";
import {
  buildX402PaymentSignature,
  x402SpendPolicyFromEnv,
  type PaymentRequirement,
  type PaymentResource,
  type X402Signer
} from "../../src/trust/x402Signer.js";

describe("MCP x402 signer spend policy", () => {
  const requirement: PaymentRequirement = {
    scheme: "exact",
    network: "botchain:botchain-test",
    asset: "9".repeat(64),
    amount: "10000",
    payTo: `00${"8".repeat(64)}`,
    maxTimeoutSeconds: 300,
    extra: { name: "Cep18x402", version: "1", symbol: "CSPR" }
  };
  const resource: PaymentResource = {
    url: "http://127.0.0.1:4021/reports/buy/agent-pay-live-1",
    description: "AgentPay live evidence report",
    mimeType: "application/json"
  };

  it("signs when the quoted payment is within local policy", async () => {
    const signer = mockSigner();

    const built = await buildX402PaymentSignature({
      requirement,
      resource,
      signer,
      policy: x402SpendPolicyFromEnv({
        AGENT_PAY_EXPECTED_PAYEE_ADDRESS: requirement.payTo,
        AGENT_PAY_EXPECTED_X402_ASSET: requirement.asset,
        AGENT_PAY_EXPECTED_NETWORK: requirement.network,
        AGENT_PAY_MAX_REPORT_AMOUNT: requirement.amount
      }),
      now: 1_700_000_000,
      nonce: new Uint8Array(32).fill(3)
    });

    expect(built.authorization.to).toBe(requirement.payTo);
    expect(signer.signTypedData).toHaveBeenCalledOnce();
  });

  it("rejects and does not sign when the payee address mismatches policy", async () => {
    const signer = mockSigner();

    await expect(
      buildX402PaymentSignature({
        requirement: { ...requirement, payTo: `00${"7".repeat(64)}` },
        resource,
        signer,
        policy: x402SpendPolicyFromEnv({
          AGENT_PAY_EXPECTED_PAYEE_ADDRESS: requirement.payTo
        })
      })
    ).rejects.toThrow(/payee address mismatch.*expected.*actual/i);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("rejects and does not sign when the x402 asset mismatches policy", async () => {
    const signer = mockSigner();

    await expect(
      buildX402PaymentSignature({
        requirement: { ...requirement, asset: "7".repeat(64) },
        resource,
        signer,
        policy: x402SpendPolicyFromEnv({
          AGENT_PAY_EXPECTED_X402_ASSET: requirement.asset
        })
      })
    ).rejects.toThrow(/asset mismatch.*expected.*actual/i);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("rejects and does not sign when the network mismatches policy", async () => {
    const signer = mockSigner();

    await expect(
      buildX402PaymentSignature({
        requirement: { ...requirement, network: "botchain:botchain" },
        resource,
        signer,
        policy: x402SpendPolicyFromEnv({
          AGENT_PAY_EXPECTED_NETWORK: requirement.network
        })
      })
    ).rejects.toThrow(/network mismatch.*expected.*actual/i);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it("rejects and does not sign when the quoted amount exceeds policy", async () => {
    const signer = mockSigner();

    await expect(
      buildX402PaymentSignature({
        requirement,
        resource,
        signer,
        policy: x402SpendPolicyFromEnv({
          AGENT_PAY_MAX_REPORT_AMOUNT: "9999"
        })
      })
    ).rejects.toThrow(/amount exceeds.*expected <= 9999.*actual 10000/i);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });

  it.each([
    ["zero", "0", /positive integer in base units/i],
    ["leading zeros", "010000", /positive integer in base units/i],
    ["negative", "-1", /positive integer in base units/i],
    ["non-integer", "1.5", /positive integer in base units/i],
    ["above U256", (1n << 256n).toString(), /exceeds the U256 transfer limit/i]
  ] as const)("rejects a %s amount before signing", async (_label, amount, message) => {
    const signer = mockSigner();

    await expect(
      buildX402PaymentSignature({
        requirement: { ...requirement, amount },
        resource,
        signer,
        now: 1_700_000_000,
        nonce: new Uint8Array(32).fill(3)
      })
    ).rejects.toThrow(message);
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });
});

function mockSigner(): X402Signer & { signTypedData: ReturnType<typeof vi.fn> } {
  return {
    algo: "secp256k1",
    publicKeyHex: `02${"1".repeat(66)}`,
    accountAddress: `00${"6".repeat(64)}`,
    signTypedData: vi.fn(() => Promise.resolve("0x" + "2".repeat(130)))
  };
}
