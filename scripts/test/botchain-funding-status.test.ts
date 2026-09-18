import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBotChainFundingStatus, formatBotChainFundingStatus, type BotChainFundingStatus } from "../botchain-funding-status";

describe("AgentPay Bot Chain funding status", () => {
  it("formats the account hash, faucet URL, and required CSPR amount", () => {
    const status: BotChainFundingStatus = {
      accountHash: `account-hash-${"a".repeat(64)}`,
      balanceMotes: "0",
      requiredMotes: "155000000000",
      funded: false,
      faucetUrl: "https://testnet.cspr.live/tools/faucet",
      publicKeyPath: ".agentpay-testnet-key/public_key_hex",
      rpcUrl: "https://rpc.bohr.life",
      message: "Account is not funded on Bot Chain Testnet yet"
    };

    expect(formatBotChainFundingStatus(status)).toContain(`Account: account-hash-${"a".repeat(64)}`);
    expect(formatBotChainFundingStatus(status)).toContain("Required: 155000000000 motes (155 CSPR)");
    expect(formatBotChainFundingStatus(status)).toContain("Faucet: https://testnet.cspr.live/tools/faucet");
    expect(formatBotChainFundingStatus(status)).toContain("Funded: no");
  });

  it("reports a missing configured public key file before calling Bot Chain", async () => {
    const status = await createBotChainFundingStatus({
      CASPER_PUBLIC_KEY_PATH: ".agentpay-testnet-key/missing_funded_public_key_hex",
      CASPER_RPC_URL: "https://rpc.bohr.life",
      CASPER_CLIENT_COMMAND: "botchain-client"
    });

    expect(status.funded).toBe(false);
    expect(status.message).toBe("CASPER_PUBLIC_KEY_PATH does not exist or is not readable: .agentpay-testnet-key/missing_funded_public_key_hex");
  });

  it("checks funding with a wallet account identifier when no public key file is available", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentpay-funding-identifier-"));
    const clientPath = join(dir, "botchain-client");

    try {
      await writeFile(
        clientPath,
        `#!/usr/bin/env sh
[ "$1" = "query-balance" ] || exit 2
printf '%s' '{"result":{"balance":"155000000000"}}'
`
      );
      await chmod(clientPath, 0o700);

      const status = await createBotChainFundingStatus({
        CASPER_ACCOUNT_IDENTIFIER: `account-hash-${"b".repeat(64)}`,
        CASPER_RPC_URL: "https://rpc.bohr.life",
        CASPER_CLIENT_COMMAND: clientPath
      });

      expect(status.funded).toBe(true);
      expect(status.accountHash).toBe(`account-hash-${"b".repeat(64)}`);
      expect(status.publicKeyPath).toBe(null);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
