import { verifyTypedData, type Address } from "viem";
import { CloudflareBindings } from "../types";

export interface X402Quote {
  nonce: string;
  amount: string; // in USDC or equivalent
  expiresAt: number;
}

/**
 * Production-grade x402 Payment Verification
 * Uses EIP-712 for tamper-proof payment authorization
 */
export class X402Manager {
  private static QUOTE_PREFIX = "x402_quote:";
  private static SPENT_PREFIX = "x402_spent:";

  /**
   * Generates a unique, expiring quote for a request
   */
  static async createQuote(kv: KVNamespace, promptHash: string): Promise<X402Quote> {
    const nonce = crypto.randomUUID();
    const quote: X402Quote = {
      nonce,
      amount: "0.01", // Production base price per consensus
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 mins
    };

    await kv.put(`${this.QUOTE_PREFIX}${nonce}`, JSON.stringify({ ...quote, promptHash }), {
      expirationTtl: 300
    });

    return quote;
  }

  /**
   * Verifies an EIP-712 signature against a quote
   */
  static async verifyPayment(
    kv: KVNamespace,
    signature: `0x${string}`,
    nonce: string,
    signerAddress: Address
  ): Promise<boolean> {
    const quoteData = await kv.get(`${this.QUOTE_PREFIX}${nonce}`);
    if (!quoteData) return false;

    const { amount, expiresAt, promptHash } = JSON.parse(quoteData);

    if (Date.now() > expiresAt) return false;

    // Prevent Double Spend
    const alreadySpent = await kv.get(`${this.SPENT_PREFIX}${signature}`);
    if (alreadySpent) return false;

    // Verify EIP-712 Signature
    const domain = {
      name: "Consensus API",
      version: "1",
      chainId: 137, // Polygon/Base or any L2
      verifyingContract: "0x0000000000000000000000000000000000000000" as Address
    };

    const types = {
      Payment: [
        { name: "amount", type: "string" },
        { name: "nonce", type: "string" },
        { name: "promptHash", type: "string" }
      ]
    };

    const isValid = await verifyTypedData({
        address: signerAddress,
        domain,
        types,
        primaryType: "Payment",
        message: { amount, nonce, promptHash },
        signature
    });

    if (isValid) {
      // Mark as spent
      await kv.put(`${this.SPENT_PREFIX}${signature}`, "true", { expirationTtl: 86400 });
      return true;
    }

    return false;
  }
}
