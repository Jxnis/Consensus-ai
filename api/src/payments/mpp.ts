import { Mppx, tempo } from "mppx/server";
import { Challenge } from "mppx";
import type { CloudflareBindings } from "../types";

// Shared price schedule — single source of truth for both MPP and x402 rails.
// Keeping parity prevents arbitrage between payment methods.
// x402 format: "$0.001" (dollar prefix). MPP format: "0.001" (plain decimal).
export const PRICE_BY_TIER: Record<string, string> = {
  SIMPLE: "$0.001",
  MEDIUM: "$0.002",
  COMPLEX: "$0.005",
  REASONING: "$0.008", // must match getChargedPriceUsd in index.ts (fixed in P5.25)
};

// Convert x402 price format ("$0.001") to MPP amount format ("0.001")
export function toMppAmount(x402Price: string): string {
  return x402Price.replace(/^\$/, "");
}

export function isMppConfigured(env: CloudflareBindings): boolean {
  return Boolean(env.MPP_SECRET_KEY && env.MPP_TEMPO_RECIPIENT);
}

// Called per-request: CF Workers has no module-level env binding access.
export function createMppx(env: CloudflareBindings) {
  if (!env.MPP_SECRET_KEY || !env.MPP_TEMPO_RECIPIENT) {
    throw new Error("[MPP] MPP_SECRET_KEY and MPP_TEMPO_RECIPIENT must be set");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(env.MPP_TEMPO_RECIPIENT)) {
    throw new Error(`[MPP] MPP_TEMPO_RECIPIENT is not a valid EVM address: ${env.MPP_TEMPO_RECIPIENT.slice(0, 10)}...`);
  }
  return Mppx.create({
    secretKey: env.MPP_SECRET_KEY,
    methods: [
      // tempo.charge only — tempo() also registers session which requires a signing
      // private key for on-chain channel settlement. Charge is all we need for Phase 1.
      tempo.charge({
        recipient: env.MPP_TEMPO_RECIPIENT as `0x${string}`,
        // Optimistic settlement: sub-cent micropayments are low fraud risk.
        // 500ms Tempo finality on every LLM request would destroy P90 latency.
        waitForConfirmation: false,
      }),
    ],
  });
}

// Generate the WWW-Authenticate: Payment header value for a dual-rail 402.
// Challenge.serialize() already prepends "Payment " per spec.
// amount must be plain decimal string ("0.001"), not x402 format ("$0.001").
export async function buildMppWwwAuthenticate(
  env: CloudflareBindings,
  amount: string,
  description: string
): Promise<string> {
  const mppx = createMppx(env);
  const challenge = await mppx.challenge.tempo.charge({ amount, description });
  return Challenge.serialize(challenge as Parameters<typeof Challenge.serialize>[0]);
}

// True when the request carries an MPP credential (Authorization: Payment ...)
// Uses /^payment\s+/i to match mppx's internal extractPaymentScheme regex —
// handles tab separators, multiple spaces, etc. without false positives.
export function hasMppCredential(authHeader: string | undefined): boolean {
  return Boolean(authHeader && /^payment\s+/i.test(authHeader));
}

// True when the request carries an x402 credential header
export function hasX402Credential(
  paymentSig: string | undefined,
  xPayment: string | undefined
): boolean {
  return Boolean(paymentSig || xPayment);
}
