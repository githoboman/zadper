import {
  transferWithAuthorizationTypedData,
  verifyAuthorizationSignature,
  type AuthorizationIntent
} from "../../../../packages/agent-pay-core/src/payment/index";
import { AuditApiClient, AuditApiError, type OperatorSession } from "./api";
import { BrowserProvider, ethers } from "ethers";

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const WALLET_REQUEST_TIMEOUT_MS = 120_000;

export type WalletSession = OperatorSession;

export async function createWalletSession(
  api: AuditApiClient
): Promise<WalletSession> {
  try {
    const { provider, address } = await connectWallet();
    const challenge = await api.createSessionChallenge(address);
    const signer = await provider.getSigner();
    const signature = await signer.signMessage(challenge.message);

    return await api.createOperatorSession({
      challengeId: challenge.challengeId,
      operatorPublicKey: address,
      signature
    });
  } catch (cause) {
    if (cause instanceof AuditApiError) throw cause;
    throw walletError(
      "wallet_unavailable",
      "Bot Chain Wallet could not complete the login. Unlock it and try again."
    );
  }
}

export async function signWalletMessage(
  message: string,
  expectedAddress: string
): Promise<string> {
  try {
    if (!EVM_ADDRESS_REGEX.test(expectedAddress)) {
      throw walletError("wallet_public_key_invalid", "The connected AgentPay session has an invalid account key.");
    }
    const { provider, address } = await connectWallet();
    if (address.toLowerCase() !== expectedAddress.toLowerCase()) {
      throw walletError(
        "wallet_account_changed",
        "Bot Chain Wallet switched accounts. Reconnect the wallet you used to sign in."
      );
    }
    const signer = await provider.getSigner();
    return await signer.signMessage(message);
  } catch (cause) {
    if (cause instanceof AuditApiError) throw cause;
    throw walletError(
      "wallet_unavailable",
      "Bot Chain Wallet could not sign this action. Unlock it and try again."
    );
  }
}

export async function signWalletAuthorization(
  intent: AuthorizationIntent
): Promise<string> {
  try {
    if (!EVM_ADDRESS_REGEX.test(intent.payerPublicKey)) {
      throw walletError("wallet_public_key_invalid", "The approved payment has an invalid account key.");
    }
    const { provider, address } = await connectWallet();
    if (address.toLowerCase() !== intent.payerPublicKey.toLowerCase()) {
      throw walletError(
        "wallet_account_changed",
        "Bot Chain Wallet switched accounts. Reconnect the wallet AgentPay approved for this payment."
      );
    }

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

    const signer = await provider.getSigner();
    
    // signTypedData in ethers takes (domain, types, value)
    const signature = await signer.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message
    );
    
    if (!signature) {
      throw walletError("wallet_unavailable", "Bot Chain Wallet did not return a payment signature.");
    }

    if (!verifyAuthorizationSignature(intent, signature)) {
      throw walletError(
        "wallet_signature_invalid",
        "Bot Chain Wallet returned a signature that did not match the approved payment."
      );
    }
    return signature;
  } catch (cause) {
    if (cause instanceof AuditApiError) throw cause;
    throw walletError(
      "wallet_unavailable",
      "Bot Chain Wallet could not sign this payment. Unlock it and try again."
    );
  }
}

async function connectWallet(): Promise<{ provider: BrowserProvider; address: string }> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) {
    throw walletError(
      "wallet_not_found",
      "EVM Wallet was not found. Install or unlock MetaMask, then try again."
    );
  }
  
  await ensureBotChainNetwork(ethereum);

  const provider = new BrowserProvider(ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts || accounts.length === 0) {
    throw walletError("wallet_cancelled", "Wallet connection was cancelled.");
  }
  const address = accounts[0];
  if (!EVM_ADDRESS_REGEX.test(address)) {
    throw walletError("wallet_public_key_invalid", "Wallet returned an invalid account key.");
  }
  return { provider, address };
}

async function ensureBotChainNetwork(ethereum: any) {
  const BOTCHAIN_TESTNET_CHAIN_ID = "0x3C8"; // 968 in hex
  try {
    const chainId = await ethereum.request({ method: "eth_chainId" });
    if (chainId !== BOTCHAIN_TESTNET_CHAIN_ID) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BOTCHAIN_TESTNET_CHAIN_ID,
            chainName: "Bot Chain Testnet",
            rpcUrls: ["https://rpc.bohr.life"],
            nativeCurrency: {
              name: "BOT",
              symbol: "BOT",
              decimals: 18,
            },
            blockExplorerUrls: ["https://scan.bohr.life/"],
          },
        ],
      });
    }
  } catch (err: any) {
    console.warn("Failed to configure Bot Chain network", err);
  }
}

function walletError(code: string, message: string): AuditApiError {
  return new AuditApiError({ code, message, status: 0, retryable: true });
}
