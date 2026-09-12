// Compatibility facade for the existing MCP assessment flow. Signing stays local to the MCP
// process; only public authorization fields are sent to AgentPay.
export {
  buildX402PaymentSignature,
  enforceX402SpendPolicy,
  loadEVMSignerFromPem as loadSignerFromPem,
  x402SpendPolicyFromEnv
} from "@agent-pay/client";

export type {
  BuiltPaymentSignature,
  PaymentRequirement,
  PaymentResource,
  EVMSigner as X402Signer,
  X402SpendPolicy
} from "@agent-pay/client";
