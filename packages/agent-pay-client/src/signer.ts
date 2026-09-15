import { ethers } from "ethers";
import {
  normalizeAddress,
  parseBaseUnitAmount,
  type AuthorizationIntent
} from "@agent-pay/core";

export type PaymentRequirement = {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; decimals?: string; symbol?: string };
};

export type PaymentResource = {
  url: string;
  description: string;
  mimeType: string;
};

export type X402SpendPolicy = {
  expectedPayeeAddress?: string;
  expectedX402Asset?: string;
  expectedNetwork?: string;
  maxReportAmount?: string;
};

export type EVMSigner = {
  algo: "secp256k1";
  publicKeyHex: string;
  accountAddress: string;
  signTypedData(domain: any, types: any, value: any): Promise<string>;
};

export type BuiltPaymentSignature = {
  paymentPayload: Record<string, unknown>;
  header: string;
  digestHex: string;
  authorization: Record<string, string>;
};

export function createEVMSigner(privateKeyHex: string): EVMSigner {
  const wallet = new ethers.Wallet(privateKeyHex);
  return {
    algo: "secp256k1",
    publicKeyHex: wallet.publicKey,
    accountAddress: wallet.address,
    async signTypedData(domain: any, types: any, value: any): Promise<string> {
      return wallet.signTypedData(domain, types, value);
    }
  };
}

export function loadEVMSignerFromPem(pem: string): EVMSigner {
  // Simplification for hackathon: just extract the hex key from PEM or expect hex directly
  const hex = pem.replace(/[^a-fA-F0-9]/g, "");
  return createEVMSigner(hex.length === 64 ? "0x" + hex : pem);
}

export async function signAuthorizationIntent(
  signer: EVMSigner,
  intent: AuthorizationIntent
): Promise<string> {
  const domain = {
    name: intent.tokenName,
    version: intent.tokenVersion,
    chainId: intent.network === "botchain:mainnet" ? 677 : 968,
    verifyingContract: intent.asset
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ]
  };

  const value = {
    from: intent.from,
    to: intent.to,
    value: intent.amount,
    validAfter: intent.validAfter,
    validBefore: intent.validBefore,
    nonce: `0x${intent.nonce}`
  };

  return signer.signTypedData(domain, types, value);
}

export function x402SpendPolicyFromEnv(
  env: Record<string, string | undefined> = process.env
): X402SpendPolicy {
  return {
    expectedPayeeAddress: env.AGENT_PAY_EXPECTED_PAYEE_ADDRESS,
    expectedX402Asset: env.AGENT_PAY_EXPECTED_X402_ASSET,
    expectedNetwork: env.AGENT_PAY_EXPECTED_NETWORK,
    maxReportAmount: env.AGENT_PAY_MAX_REPORT_AMOUNT
  };
}

export function enforceX402SpendPolicy(
  requirement: PaymentRequirement,
  policy: X402SpendPolicy = x402SpendPolicyFromEnv()
): void {
  // policy enforcement logic here
}

export async function buildX402PaymentSignature(input: {
  requirement: PaymentRequirement;
  resource: PaymentResource;
  signer: EVMSigner;
  policy?: X402SpendPolicy;
  domainChainName?: string;
  now?: number;
  nonce?: Uint8Array;
}): Promise<BuiltPaymentSignature> {
  enforceX402SpendPolicy(input.requirement, input.policy);
  const now = input.now ?? Math.floor(Date.now() / 1_000);
  const validAfter = now;
  const validBefore = now + (input.requirement.maxTimeoutSeconds || 300);
  const nonce = input.nonce
    ? Buffer.from(input.nonce).toString("hex")
    : ethers.hexlify(ethers.randomBytes(32)).slice(2);
  
  const intent: AuthorizationIntent = {
    payerPublicKey: input.signer.publicKeyHex,
    from: input.signer.accountAddress,
    to: input.requirement.payTo,
    amount: input.requirement.amount,
    validAfter: String(validAfter),
    validBefore: String(validBefore),
    nonce,
    network: (input.domainChainName ?? input.requirement.network) as any,
    asset: input.requirement.asset,
    tokenName: input.requirement.extra.name,
    tokenVersion: input.requirement.extra.version,
    digest: "" // Will be calculated by EIP-712
  };

  const signature = await signAuthorizationIntent(input.signer, intent);

  const authorization = {
    from: input.signer.accountAddress,
    to: input.requirement.payTo,
    value: input.requirement.amount,
    validAfter: String(validAfter),
    validBefore: String(validBefore),
    nonce
  };
  
  const paymentPayload = {
    x402Version: 2,
    accepted: input.requirement,
    resource: input.resource,
    payload: {
      signature,
      publicKey: input.signer.publicKeyHex,
      authorization
    }
  };
  
  return {
    paymentPayload,
    header: Buffer.from(JSON.stringify(paymentPayload), "utf8").toString("base64"),
    digestHex: "0x0", // Placeholder
    authorization
  };
}
