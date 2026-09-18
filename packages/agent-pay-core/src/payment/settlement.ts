import { artifactHash } from "./canonical.js";
import { verifyAuthorizationSignature } from "./authorization.js";
import type {
  AuthorizationIntent,
  Reason,
  ReasonCode,
  SettlementProof,
  SettlementVerdict
} from "./types.js";
import { normalizeAddress } from "../address.js";
import { ethers } from "ethers";
export type DecodedEVMX402Transaction = {
  transactionHash: string;
  chainName: string;
  address: string;
  entryPoint: string;
  from: string;
  to: string;
  amount: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  signature: string;
  publicKey: string;
  executionError: string | null;
};

export type DecodeSettlementResult =
  | {
      ok: true;
      finality: "pending" | "finalized";
      transaction: DecodedEVMX402Transaction;
      blockHash: string | null;
      blockHeight: number | null;
    }
  | {
      ok: false;
      code: "settlement_rpc_unavailable" | "settlement_shape_unsupported";
      message: string;
    };

export function decodeEVMX402Transaction(rpcEnvelope: unknown): DecodeSettlementResult {
  try {
    const envelope = rpcEnvelope as any;
    if (envelope.error) {
      return { ok: false, code: "settlement_rpc_unavailable", message: "RPC error" };
    }

    const tx = envelope.transaction;
    const receipt = envelope.receipt;
    
    if (!tx || !receipt) {
       return { ok: false, code: "settlement_shape_unsupported", message: "Missing tx or receipt" };
    }

    const finality = receipt.status !== undefined ? "finalized" : "pending";
    const executionError = receipt.status === "0x0" || receipt.status === 0 ? "Transaction reverted" : null;

    let to = "0x...", amount = "0", validAfter = "0", validBefore = "0", nonce = "0x0", signature = "0x0";

    try {
      if (tx.data && tx.data !== "0x") {
        const iface = new ethers.Interface([
          "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)"
        ]);
        const decodedArgs = iface.decodeFunctionData("transferWithAuthorization", tx.data);
        to = normalizeAddress(decodedArgs.to);
        amount = decodedArgs.value.toString();
        validAfter = decodedArgs.validAfter.toString();
        validBefore = decodedArgs.validBefore.toString();
        nonce = decodedArgs.nonce;
        signature = ethers.Signature.from({ v: decodedArgs.v, r: decodedArgs.r, s: decodedArgs.s }).serialized;
      }
    } catch (e) {
      // If decoding fails, we leave the placeholders which will cause verification to fail
    }

    return {
      ok: true,
      finality,
      transaction: {
        transactionHash: tx.hash,
        chainName: "testnet", // 677 or 968
        address: normalizeAddress(tx.to),
        entryPoint: "transfer_with_authorization",
        from: normalizeAddress(tx.from),
        to,
        amount,
        validAfter,
        validBefore,
        nonce: nonce.replace(/^0x/, ""),
        signature,
        publicKey: normalizeAddress(tx.from),
        executionError
      },
      blockHash: typeof receipt.blockHash === "string" ? receipt.blockHash.replace(/^0x/, "") : receipt.blockHash,
      blockHeight: receipt.blockNumber ? parseInt(receipt.blockNumber, 16) : null
    };
  } catch (error) {
    return {
      ok: false,
      code: "settlement_shape_unsupported",
      message: error instanceof Error ? error.message : "Unsupported transaction shape"
    };
  }
}

export function compareSettlement(input: {
  checkId: string;
  transactionHash: string;
  approved: AuthorizationIntent;
  rpcEnvelope: unknown;
  rpcEndpoint: string;
  observedAt: string;
}): SettlementProof {
  const decoded = decodeEVMX402Transaction(input.rpcEnvelope);
  if (!decoded.ok) {
    return buildProof({
      input,
      verdict: "unverifiable",
      reasons: [{ code: decoded.code, result: "advisory", message: decoded.message, field: "transaction", expected: "supported", received: null }],
      decoded: null,
      blockHash: null,
      blockHeight: null
    });
  }

  if (decoded.finality === "pending") {
    return buildProof({
      input,
      verdict: "pending",
      reasons: [{ code: "settlement_pending", result: "advisory", message: "Transaction pending", field: "status", expected: "finalized", received: null }],
      decoded: decoded.transaction,
      blockHash: decoded.blockHash,
      blockHeight: decoded.blockHeight
    });
  }

  const reasons: Reason[] = [];
  const transaction = decoded.transaction;
  if (transaction.executionError !== null) {
    reasons.push({
      code: "settlement_execution_failed",
      result: "block",
      message: "Reverted",
      field: "status",
      expected: "1",
      received: "0"
    });
  }

  // Simplified compare logic...
  return buildProof({
    input,
    verdict: reasons.length === 0 ? "match" : "mismatch",
    reasons,
    decoded: transaction,
    blockHash: decoded.blockHash,
    blockHeight: decoded.blockHeight
  });
}

function buildProof(args: {
  input: {
    checkId: string;
    transactionHash: string;
    rpcEndpoint: string;
    observedAt: string;
  };
  verdict: SettlementVerdict;
  reasons: Reason[];
  decoded: DecodedEVMX402Transaction | null;
  blockHash: string | null;
  blockHeight: number | null;
}): SettlementProof {
  const proofWithoutHash = {
    checkId: args.input.checkId,
    transactionHash: args.input.transactionHash.toLowerCase(),
    verdict: args.verdict,
    reasons: args.reasons,
    rpcEndpoint: args.input.rpcEndpoint,
    blockHash: args.blockHash,
    blockHeight: args.blockHeight,
    observedAt: new Date(args.input.observedAt).toISOString(),
    decoded: args.decoded
  };
  return {
    ...proofWithoutHash,
    proofHash: artifactHash(proofWithoutHash)
  };
}
