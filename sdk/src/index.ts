import { OpenAI } from "openai";
import { createWalletClient, http, type Address, type PrivateKeyAccount } from "viem";
import { mainnet } from "viem/chains";

export interface ConsensusConfig {
  apiKey?: string;
  wallet?: PrivateKeyAccount;
  baseURL?: string;
}

/**
 * Production-grade Consensus SDK
 * Intercepts 402 errors and auto-handles EIP-712 handshakes
 */
export class ConsensusClient {
  private openai: OpenAI;
  private wallet?: PrivateKeyAccount;

  constructor(config: ConsensusConfig) {
    this.wallet = config.wallet as PrivateKeyAccount | undefined;
    this.openai = new OpenAI({
      apiKey: config.apiKey || "x402-mode",
      baseURL: config.baseURL || "https://consensus.ai/v1",
      dangerouslyAllowBrowser: true,
    });
  }

  /**
   * Proxies chat completions with automated payment handling
   */
  async chatCompletions(params: any) {
    try {
      return await this.openai.chat.completions.create(params);
    } catch (error: any) {
      if (error.status === 402 && error.error?.quote) {
        console.log("[Consensus SDK] 402 Payment Required. Handling handshake...");
        return this.handleX402Handshake(params, error.error.quote);
      }
      throw error;
    }
  }

  /**
   * The EIP-712 Sign -> Resubmit Flow
   */
  private async handleX402Handshake(params: any, quote: any) {
    if (!this.wallet) {
      throw new Error("Handshake failed: No wallet provided for x402 payment.");
    }

    const { amount, nonce, promptHash } = quote;

    const domain = {
      name: "Consensus API",
      version: "1",
      chainId: 137,
      verifyingContract: "0x0000000000000000000000000000000000000000" as Address,
    };

    const types = {
      Payment: [
        { name: "amount", type: "string" },
        { name: "nonce", type: "string" },
        { name: "promptHash", type: "string" },
      ],
    };

    const signature = await this.wallet.signTypedData({
      domain,
      types,
      primaryType: "Payment",
      message: { amount, nonce, promptHash },
    });

    // Retry with headers
    return await this.openai.chat.completions.create(params, {
      headers: {
        "X-402-Signature": signature,
        "X-402-Nonce": nonce,
        "X-402-Signer": this.wallet.address,
      },
    });
  }
}
