// Compatibility facade for the existing E2E and buyer scripts. The implementation lives in the
// shared client package so every integration signs the same canonical authorization bytes.
export {
  buildX402PaymentSignature,
  createEVMSigner,
  enforceX402SpendPolicy,
  loadEVMSignerFromPem,
  transferWithAuthorizationDigest,
  x402SpendPolicyFromEnv
} from "@agent-pay/client";

export type {
  BuiltPaymentSignature,
  BotChainAlgo,
  EVMSigner,
  PaymentRequirement,
  PaymentResource,
  X402SpendPolicy
} from "@agent-pay/client";
