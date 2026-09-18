import { ethers } from "ethers";
import type { AuthorizationIntent, PaymentTerms } from "./types.js";
import { normalizeAddress as canonicalPackageHash } from "../address.js";

const HEX_40 = /^[0-9a-f]{40}$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const ADDRESS = /^(?:0x)?[0-9a-fA-F]{40}$/;
const POSITIVE_INTEGER = /^(0|[1-9][0-9]*)$/;
const AUTHORIZATION_CLOCK_SKEW_SECONDS = 5;

export function parseBotChainPublicKey(value: unknown): { publicKeyHex: string } {
  if (typeof value !== "string") throw new TypeError("BotChain public key must be a string");
  const normalized = value.trim().toLowerCase();
  if (!ADDRESS.test(normalized)) throw new TypeError("BotChain public key must be a valid EVM address");
  return { publicKeyHex: normalized.startsWith("0x") ? normalized : `0x${normalized}` };
}

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
};

export type TransferAuthorizationDigestInput = {
  tokenName: string;
  tokenVersion: string;
  network: string;
  assetPackageHash: string;
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
};

export type TransferAuthorizationTypedData = {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: "TransferWithAuthorization";
  message: Record<string, unknown>;
};

function buildDomain(name: string, version: string, chainIdStr: string, verifyingContract: string) {
  return {
    name,
    version,
    chainId: BigInt(chainIdStr),
    verifyingContract
  };
}

export function transferWithAuthorizationTypedData(
  input: TransferAuthorizationDigestInput
): TransferAuthorizationTypedData {
  const asset = normalizeAsset(input.assetPackageHash);
  const from = normalizeAddress(input.from, "from");
  const to = normalizeAddress(input.to, "to");
  const value = normalizeInteger(input.value, "value");
  const validAfter = normalizeInteger(input.validAfter, "validAfter");
  const validBefore = normalizeInteger(input.validBefore, "validBefore");
  const nonce = normalizeNonce(input.nonce);
  if (!input.tokenName || !input.tokenVersion || !input.network) {
    throw new TypeError("Authorization domain fields must be non-empty strings");
  }

  // extract chainId from network (e.g. "botchain:968" -> 968)
  let chainId = input.network.split(":")[1] || "968";
  if (chainId === "testnet") chainId = "968";
  if (chainId === "mainnet") chainId = "888"; // assuming mainnet is 888 if not specified

  return {
    domain: buildDomain(input.tokenName, input.tokenVersion, chainId, asset),
    types: {
      TransferWithAuthorization: TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: from,
      to: to,
      value: BigInt(value),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce: `0x${nonce}`
    }
  };
}

export function transferWithAuthorizationDigest(input: TransferAuthorizationDigestInput): string {
  const typedData = transferWithAuthorizationTypedData(input);
  return ethers.TypedDataEncoder.hash(typedData.domain, typedData.types, typedData.message);
}

export function buildAuthorizationIntent(input: {
  terms: PaymentTerms;
  payerPublicKey: string; // EVM address
  nowEpochSeconds: number;
  nonce: string;
}): AuthorizationIntent {
  if (!Number.isSafeInteger(input.nowEpochSeconds) || input.nowEpochSeconds < 0) {
    throw new TypeError("nowEpochSeconds must be a non-negative safe integer");
  }
  
  const fromAddress = normalizeAddress(input.payerPublicKey, "payerPublicKey");
  const window = buildAuthorizationWindow(input.nowEpochSeconds, input.terms.maxTimeoutSeconds);
  
  const intentWithoutDigest = {
    payerPublicKey: fromAddress,
    from: fromAddress,
    to: normalizeAddress(input.terms.payTo, "payTo"),
    amount: input.terms.amount,
    validAfter: window.validAfter,
    validBefore: window.validBefore,
    nonce: normalizeNonce(input.nonce),
    network: input.terms.network,
    asset: input.terms.asset,
    tokenName: input.terms.extra.name,
    tokenVersion: input.terms.extra.version
  } satisfies Omit<AuthorizationIntent, "digest">;

  return {
    ...intentWithoutDigest,
    digest: authorizationDigest(intentWithoutDigest)
  };
}

export function buildAuthorizationWindow(
  nowEpochSeconds: number,
  maxTimeoutSeconds: number
): { validAfter: string; validBefore: string } {
  if (!Number.isSafeInteger(nowEpochSeconds) || nowEpochSeconds < 0) {
    throw new TypeError("nowEpochSeconds must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(maxTimeoutSeconds) || maxTimeoutSeconds <= 0) {
    throw new TypeError("maxTimeoutSeconds must be a positive safe integer");
  }

  const skew = Math.min(
    AUTHORIZATION_CLOCK_SKEW_SECONDS,
    maxTimeoutSeconds - 1,
    nowEpochSeconds
  );
  const validAfter = nowEpochSeconds - skew;
  return {
    validAfter: String(validAfter),
    validBefore: String(validAfter + maxTimeoutSeconds)
  };
}

export function authorizationDigest(intent: Omit<AuthorizationIntent, "digest"> | AuthorizationIntent): string {
  return transferWithAuthorizationDigest({
    tokenName: intent.tokenName,
    tokenVersion: intent.tokenVersion,
    network: intent.network,
    assetPackageHash: intent.asset,
    from: intent.from,
    to: intent.to,
    value: intent.amount,
    validAfter: intent.validAfter,
    validBefore: intent.validBefore,
    nonce: intent.nonce
  });
}

  export function verifyAuthorizationSignature(intent: AuthorizationIntent, signatureHex: string): boolean {
    try {
      if (intent.payerPublicKey.toLowerCase() !== intent.from.toLowerCase()) return false;
      const computedDigest = authorizationDigest(intent);
    if (computedDigest !== intent.digest.toLowerCase()) return false;
    
    const typedData = transferWithAuthorizationTypedData({
        tokenName: intent.tokenName,
        tokenVersion: intent.tokenVersion,
        network: intent.network,
        assetPackageHash: intent.asset,
        from: intent.from,
        to: intent.to,
        value: intent.amount,
        validAfter: intent.validAfter,
        validBefore: intent.validBefore,
        nonce: intent.nonce
    });
    
    const recoveredAddress = ethers.verifyTypedData(typedData.domain, typedData.types, typedData.message, signatureHex);
    if (recoveredAddress.toLowerCase() !== intent.from.toLowerCase()) {
      console.error("Signature mismatch: recovered", recoveredAddress, "expected", intent.from, "signatureHex", signatureHex);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error recovering signature", err);
    return false;
  }
}

function normalizeAsset(value: string): string {
  // Accept EVM contract addresses (0x + 40 hex chars) used after Bot Chain migration
  const trimmed = value.trim().toLowerCase();
  const stripped = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (HEX_40.test(stripped)) return `0x${stripped}`;
  // Legacy: bare 64-char Casper package hash
  if (HEX_64.test(stripped)) return stripped;
  throw new TypeError(`assetPackageHash must be an EVM address (0x+40hex) or 64-char package hash, got: ${value}`);
}

function normalizeAddress(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!ADDRESS.test(normalized)) throw new TypeError(`${label} must be a valid EVM address`);
  return normalized.startsWith("0x") ? normalized : `0x${normalized}`;
}

function normalizeInteger(value: string, label: string): string {
  if (!POSITIVE_INTEGER.test(value)) throw new TypeError(`${label} must be a non-negative integer string`);
  return value;
}

function normalizeNonce(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^0x/, "");
  if (!HEX_64.test(normalized)) throw new TypeError("nonce must be 32 bytes of hexadecimal data");
  return normalized;
}

function uint256Hex(value: string): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}
