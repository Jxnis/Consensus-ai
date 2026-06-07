import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { paymentMiddleware } from "@x402/hono";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { z } from "zod";
import { scorePrompt, detectAgentic, detectTopicDetailed } from "./router/scorer";
import { selectBestModel } from "./router/model-registry";
import { normalizeRoutingBudget as _normalizeRoutingBudget, routingBudgetToCouncilBudget, type RoutingBudget } from "./router/budget";
import { CouncilEngine } from "./council/engine";
import { ConsensusRequest, CloudflareBindings } from "./types";
import { handleMCPRequest } from "./mcp/server";
import { WorkflowTracker, parseAgentStep } from "./router/workflow";
import { callDirectProvider, getProviderName, isDirectProviderAvailable } from "./providers/index";
import OpenAI from "openai";
import {
  PRICE_BY_TIER,
  PRICE_BY_TIER_COUNCIL,
  buildMppWwwAuthenticate,
  createMppx,
  hasMppCredential,
  hasX402Credential,
  isMppConfigured,
  toMppAmount,
} from "./payments/mpp";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", logger());
app.use("/v1/*", cors());

// Startup env validation — fail fast on bad deployment
app.use("*", async (c, next) => {
  const hasDirectProvider = !!(
    (c.env as any).OPENAI_API_KEY ||
    (c.env as any).ANTHROPIC_API_KEY ||
    (c.env as any).GOOGLE_API_KEY ||
    (c.env as any).DEEPSEEK_API_KEY ||
    (c.env as any).XAI_API_KEY
  );
  if (!c.env.OPENROUTER_API_KEY && !hasDirectProvider) {
    console.error("[ArcRouter] FATAL: No provider keys set (OPENROUTER_API_KEY or direct provider keys). Requests will fail.");
  } else if (!c.env.OPENROUTER_API_KEY) {
    console.warn("[ArcRouter] WARNING: OPENROUTER_API_KEY is not set. Only direct provider models available.");
  }
  if (!c.env.ADMIN_TOKEN) {
    console.error("[ArcRouter] WARNING: ADMIN_TOKEN is not set. Admin endpoint is disabled.");
  }
  return await next();
});

/**
 * Authentication Middleware — Three-tier access:
 *
 * 1. API Key (Bearer sk_...)      → Full access, Stripe metered billing
 * 2. x402 Payment Headers         → Per-request USDC payment on Base
 * 3. No auth + budget="free"      → Free tier only (rate-limited, free models)
 */

async function hashApiKey(apiKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(apiKey);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const METRICS_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getMetricNumber(kv: KVNamespace, key: string): Promise<number> {
  const value = await kv.get(key);
  const parsed = value ? parseFloat(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function addMetricNumber(kv: KVNamespace, key: string, delta: number): Promise<void> {
  const current = await getMetricNumber(kv, key);
  await kv.put(key, (current + delta).toString(), { expirationTtl: METRICS_TTL_SECONDS });
}

async function incrementMetric(kv: KVNamespace, key: string): Promise<void> {
  await addMetricNumber(kv, key, 1);
}

function rankComplexity(tier: "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING"): number {
  if (tier === "REASONING") return 4;
  if (tier === "COMPLEX") return 3;
  if (tier === "MEDIUM") return 2;
  return 1;
}

function maxComplexityTier(
  a: "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING",
  b: "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING"
): "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING" {
  return rankComplexity(a) >= rankComplexity(b) ? a : b;
}

function normalizeRoutingBudget(rawBudget: string | undefined, authTier: string): RoutingBudget {
  if (authTier === "free" || authTier === "playground") {
    return "free";
  }
  // Paid/x402/mpp default to "auto" if no budget specified
  const defaultBudget = (authTier === "paid" || authTier === "x402" || authTier === "mpp") ? "auto" : "free";
  return _normalizeRoutingBudget(rawBudget || defaultBudget);
}

function getChargedPriceUsd(
  authTier: string,
  budget: string,
  complexityTier: string,
  mode: "default" | "council" = "default"
): number {
  const multiplier = mode === "council" ? 5 : 1;

  if (authTier === "paid") return 0.002 * multiplier;

  // x402/mpp path: variable pricing based on complexity (TASK-59)
  if (authTier === "x402" || authTier === "mpp" || (authTier === "free" && budget !== "free")) {
    const normalizedBudget = (budget || "auto").toLowerCase();
    const isPremium = normalizedBudget === "premium" || normalizedBudget === "high";

    // P1 fix (2026-06-07): budget=premium ALWAYS charges PREMIUM tier price,
    // regardless of detected complexity. Previously this only applied to
    // COMPLEX/REASONING complexity, which let premium-budget MEDIUM-classified
    // prompts pick frontier models (output_price > $5/1M) while being charged
    // MEDIUM tier ($0.002) — real margin leak when frontier got selected.
    // Trade: premium-budget users always pay $0.015 even on SIMPLE prompts.
    // Documented in docs as "premium authorizes frontier routing AND premium price".
    if (isPremium) {
      return 0.015 * multiplier;
    }

    const priceByTier: Record<string, number> = {
      SIMPLE: 0.001,
      MEDIUM: 0.002,
      COMPLEX: 0.005,
      REASONING: 0.012,
    };
    return (priceByTier[complexityTier] || 0.002) * multiplier;
  }

  return 0;
}

function shouldEnforceToolCall(
  messages: Array<{ role: string; content?: unknown }> | undefined,
  hasToolsArray: boolean,
  toolChoice: unknown,
  isAgentic: boolean
): boolean {
  if (!hasToolsArray) return false;
  if (toolChoice === "required") return true;
  if (!isAgentic) return false;

  // Heuristic: only enforce when the prompt explicitly asks to call tools.
  const joined = (messages || [])
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join(" ")
    .toLowerCase();
  return /\b(use|call|invoke)\b.{0,24}\b(tool|tools)\b/.test(joined) ||
         /\bstart by calling\b/.test(joined) ||
         /\bdo not commit\b/.test(joined);
}

// API Key Authentication Middleware (runs before x402)
app.use("/v1/*", async (c, next) => {
  // Localhost bypass is allowed only in explicit local/development environments.
  const url = new URL(c.req.url);
  const host = c.req.header("host") || "";
  const environment = (c.env.ENVIRONMENT || "production").toLowerCase();
  const isLocalEnvironment = environment === "development" || environment === "local";
  const isLocalhost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    host.includes("localhost") ||
    host.includes("127.0.0.1");

  if (isLocalEnvironment && isLocalhost) {
    c.set("authTier" as never, "paid" as never);
    c.set("userId" as never, "local-dev" as never);
    return await next();
  }

  const authHeader = c.req.header("Authorization");
  // Only treat header as an API key if it uses the Bearer scheme.
  // Authorization: Payment <credential> is the MPP payment header — must not be
  // hashed and looked up as an API key, or MPP clients get a spurious 401.
  const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (apiKey) {
    const keyHash = await hashApiKey(apiKey);
    let keyData = await c.env.CONSENSUS_CACHE.get(`apikey:${keyHash}`, { type: "json" }) as {
      userId: string;
      tier: "paid" | "playground";
      stripeSubscriptionId?: string;
      subscriptionItemId?: string;
      status?: string;
    } | null;

    // Backward-compatible lookup for previously stored plaintext keys (migration path).
    if (!keyData) {
      const legacyKeyData = await c.env.CONSENSUS_CACHE.get(`apikey:${apiKey}`, { type: "json" }) as {
        userId: string;
        tier: "paid" | "playground";
        stripeSubscriptionId?: string;
        subscriptionItemId?: string;
        status?: string;
      } | null;

      if (legacyKeyData) {
        try {
          await c.env.CONSENSUS_CACHE.put(`apikey:${keyHash}`, JSON.stringify(legacyKeyData), { expirationTtl: 31536000 });
          await c.env.CONSENSUS_CACHE.delete(`apikey:${apiKey}`);
        } catch (err) {
          console.error("[Auth] API key migration failed (non-critical):", err instanceof Error ? err.message : err);
        }
        keyData = legacyKeyData;
      }
    }

    if (keyData) {
      // Check subscription status if paid tier
      if (keyData.tier === "paid" && keyData.status && keyData.status !== "active") {
        // Subscription is past_due or canceled - downgrade to free
        console.log(`[Auth] Subscription ${keyData.status} for user ${keyData.userId}, downgrading to free`);
        c.set("authTier" as never, "free" as never);
      } else {
        c.set("authTier" as never, keyData.tier as never);
      }

      c.set("userId" as never, keyData.userId as never);
      c.set("keyHash" as never, keyHash as never);
      c.set("stripeSubscriptionId" as never, keyData.stripeSubscriptionId as never);
      c.set("subscriptionItemId" as never, keyData.subscriptionItemId as never);
      return await next();
    } else {
      return c.json({ error: "Invalid API key" }, 401);
    }
  }

  return await next();
});

// x402 Payment Middleware setup — Coinbase CDP mainnet facilitator
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://api.cdp.coinbase.com/platform/v2/x402"
});

const x402Server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(x402Server);

// Rate Limiting Middleware
app.use("/v1/*", async (c, next) => {
  try {
    const clientIP = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
    const authTier = (c.get("authTier" as never) as string) || "free";
    const hasX402Header = hasX402Credential(
      c.req.header("payment-signature"),
      c.req.header("x-payment")
    );
    // Only promote tier to mpp/x402 when the request explicitly asks for paid
    // routing (budget != "free"). Prevents sending "Authorization: Payment garbage"
    // to claim the 1000/hr payment tier while still receiving free-tier routing.
    // Body isn't parsed yet so we do a cheap text peek (clone avoids consuming the stream).
    const rawBodyText = await c.req.raw.clone().text().catch(() => "");
    const appearsFreeBudget =
      rawBodyText.includes('"budget":"free"') ||
      rawBodyText.includes('"budget": "free"') ||
      !rawBodyText.includes('"budget"'); // no budget field → treated as free
    const hasMppHeader = !appearsFreeBudget && hasMppCredential(c.req.header("authorization"));
    const effectiveTier =
      authTier === "free" && hasMppHeader ? "mpp" :
      authTier === "free" && hasX402Header && !appearsFreeBudget ? "x402" :
      authTier;
    const userId = (c.get("userId" as never) as string) || clientIP;

    const limits: Record<string, number> = {
      free: 20,
      playground: 50,
      x402: 1000,
      mpp: 1000,
      paid: 1000,
    };

    const limit = limits[effectiveTier] || 20;
    const key = `ratelimit:${effectiveTier}:${userId}`;

    const current = await c.env.CONSENSUS_CACHE.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= limit) {
      return c.json({
        error: "Rate limit exceeded",
        limit,
        tier: effectiveTier,
        message: `Max ${limit} requests per hour for ${effectiveTier} tier.`
      }, 429);
    }

    await c.env.CONSENSUS_CACHE.put(key, String(count + 1), { expirationTtl: 3600 });
  } catch (err) {
    // Don't block requests if rate limiting fails — just log and continue
    console.error("[RateLimit] Middleware error:", err instanceof Error ? err.message : String(err));
  }
  return await next();
});

// Hybrid Middleware: Parse body, score prompt, apply dynamic x402 pricing
app.use("/v1/chat/completions", async (c, next) => {
  const authTier = c.get("authTier" as never) as string | undefined;
  const isAuthenticated = authTier === "paid" || authTier === "playground";
  const maxBodySize = isAuthenticated ? 512000 : 51200;

  // Parse body once and enforce tier-specific size limits before reaching handlers.
  let budget = "";
  let complexityTier: "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING" = "MEDIUM";
  let body: Record<string, unknown>;

  try {
    const rawBody = await c.req.raw.clone().text();

    if (rawBody.length > maxBodySize) {
      return c.json({ error: `Request body too large. Maximum ${maxBodySize / 1024}KB.` }, 413);
    }

    body = JSON.parse(rawBody);
    budget = String(body.budget ?? "").toLowerCase();

    // Model aliases: resolve shorthand model names before routing
    const MODEL_ALIASES: Record<string, string> = {
      "free": "__alias:free",                      // route to best free model
      "gpt": "openai/gpt-4o",
      "gpt-4o": "openai/gpt-4o",
      "gpt-4o-mini": "openai/gpt-4o-mini",
      "claude": "anthropic/claude-sonnet-4-5",     // Claude Sonnet (latest)
      "claude-sonnet": "anthropic/claude-sonnet-4-5",
      "claude-haiku": "anthropic/claude-haiku-4-5-20251001",
      "claude-opus": "anthropic/claude-opus-4-5",
      "gemini": "google/gemini-2.5-flash-lite-preview-09-2025",
      "gemini-pro": "google/gemini-2.5-pro",
      "deepseek": "deepseek/deepseek-chat-v3-0324",
      "deepseek-chat": "deepseek/deepseek-chat-v3-0324",
      "deepseek-v3": "deepseek/deepseek-chat-v3-0324",
      "deepseek-flash": "deepseek/deepseek-v3.2",        // closest to "deepseek 4 flash" naming
      "deepseek-v3.2": "deepseek/deepseek-v3.2",
      "deepseek-r1": "deepseek/deepseek-r1",
      "deepseek-reasoner": "deepseek/deepseek-r1",
    };
    if (typeof body.model === "string" && MODEL_ALIASES[body.model.toLowerCase()]) {
      body = { ...body, model: MODEL_ALIASES[body.model.toLowerCase()] };
    }

    const messages = Array.isArray(body.messages)
      ? (body.messages as Array<{ role: string; content?: unknown }>)
      : [];
    const fullConversation = messages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join(" ");
    const totalTokenEstimate = Math.ceil(fullConversation.length / 4);
    const lastMessage = typeof messages[messages.length - 1]?.content === "string"
      ? (messages[messages.length - 1]!.content as string)
      : "";

    const hasToolsArray = Array.isArray(body.tools) && (body.tools as unknown[]).length > 0;
    if (lastMessage) {
      complexityTier = scorePrompt(lastMessage, hasToolsArray).tier;
    }

    // Never downgrade complexity for large total-context requests.
    if (totalTokenEstimate > 4000) {
      complexityTier = "COMPLEX";
    } else if (totalTokenEstimate > 1000) {
      complexityTier = maxComplexityTier(complexityTier, "MEDIUM");
    }

    const rawMode = typeof body.mode === "string" ? body.mode.toLowerCase() : "default";
    const requestMode: "default" | "council" = rawMode === "council" ? "council" : "default";

    c.set("parsedBody" as never, body as never);
    c.set("complexityTier" as never, complexityTier as never);
    c.set("tokenEstimate" as never, totalTokenEstimate as never);
    c.set("hasToolsArray" as never, hasToolsArray as never);
    c.set("requestMode" as never, requestMode as never);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Already authenticated via API key → bypass payment middleware
  if (isAuthenticated) {
    return await next();
  }

  // Unauthenticated users with free budget pass through to free-model routing
  if (budget === "free" || budget === "") {
    return await next();
  }

  // Complexity-based price — shared between MPP and x402 rails (no divergence)
  // Mode and budget both shift the price: council = 5x multiplier, premium budget = PREMIUM tier
  // P1 fix (2026-06-07): budget=premium ALWAYS resolves to PREMIUM tier (regardless of
  // complexity). MUST match getChargedPriceUsd's premium branch — otherwise the 402
  // challenge price diverges from routing.charged_cost_usd, producing a billing mismatch.
  const requestMode = (c.get("requestMode" as never) as "default" | "council") || "default";
  const normalizedBudgetForPrice = (budget || "auto").toLowerCase();
  const isPremiumBudget = normalizedBudgetForPrice === "premium" || normalizedBudgetForPrice === "high";
  const effectiveTier: string = isPremiumBudget ? "PREMIUM" : complexityTier;

  const tierTable = requestMode === "council" ? PRICE_BY_TIER_COUNCIL : PRICE_BY_TIER;
  const price = tierTable[effectiveTier] ?? tierTable.MEDIUM;
  const tierList = Object.entries(tierTable).map(([k, v]) => `${k} ${v}`).join(" / ");
  const priceDescription = `ArcRouter - ${effectiveTier} query (${requestMode}). ${tierList}.`;

  console.log(`[Auth] Unauthenticated request budget="${budget}" complexity=${complexityTier} mode=${requestMode} effectiveTier=${effectiveTier} price=${price}`);

  // ── MPP path ─────────────────────────────────────────────────────────────
  // Authorization: Payment <credential> header present → verify via mppx
  if (hasMppCredential(c.req.header("authorization"))) {
    if (!isMppConfigured(c.env)) {
      return c.json({ error: "Payment required", message: "MPP not configured. Use budget='free' or an API key." }, 402);
    }
    try {
      const mppx = createMppx(c.env);
      const result = await mppx.charge({ amount: toMppAmount(price), description: priceDescription })(c.req.raw);
      if (result.status === 402) {
        // result.challenge is already a Web API Response (the 402 with WWW-Authenticate header).
        // The cast is safe: for HTTP transport, Transport.ChallengeOutputOf<Http> = Response.
        return result.challenge as Response;
      }
      // Payment verified
      c.set("authTier" as never, "mpp" as never);
      const mppStartedAt = Date.now();
      await next();

      // Don't redeem payment for failed responses (5xx) — fairness for customers.
      // Without this, the partner gets billed for "All models failed" 502s. The MPP
      // payment was technically verified, but we didn't deliver a usable response.
      const responseStatus = c.res.status;
      if (responseStatus >= 500) {
        // Skip withReceipt + log to a separate KV bucket for manual reconciliation.
        // Add explicit header so client-side billing systems know not to deduct.
        c.res.headers.set("X-MPP-Settlement", "skipped-server-error");
        c.executionCtx.waitUntil(
          c.env.CONSENSUS_CACHE.put(
            `mpp_unbilled:${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            JSON.stringify({
              timestamp: Date.now(),
              status: responseStatus,
              price,
              complexity_tier: complexityTier,
              reason: "upstream_failure_no_redemption",
              latency_ms: Date.now() - mppStartedAt,
            }),
            { expirationTtl: 60 * 60 * 24 * 90 } // 90 days for refund tracking
          )
        );
        console.warn(`[MPP] Skipping payment redemption — response status=${responseStatus}`);
        return;
      }

      // Success path: attach receipt, redeem payment
      c.res = result.withReceipt(c.res);

      // Log MPP receipt to KV for reconciliation (non-blocking, 30-day TTL)
      const mppReceiptHeader = c.res.headers.get("Payment-Receipt");
      if (mppReceiptHeader) {
        const receiptKey = `mpp_receipt:${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        c.executionCtx.waitUntil(
          c.env.CONSENSUS_CACHE.put(
            receiptKey,
            JSON.stringify({
              timestamp: Date.now(),
              price,
              complexity_tier: complexityTier,
              latency_ms: Date.now() - mppStartedAt,
              method: "mpp",
              chain: "tempo",
              receipt_header: mppReceiptHeader,
            }),
            { expirationTtl: 60 * 60 * 24 * 30 }
          )
        );
      }
      return;
    } catch (err: unknown) {
      console.error("[MPP] Middleware error:", err instanceof Error ? err.message : String(err));
      return c.json({ error: "Payment verification failed", message: "MPP payment could not be verified." }, 402);
    }
  }

  // ── x402 path ────────────────────────────────────────────────────────────
  // X-PAYMENT / payment-signature header present → verify via existing x402 middleware
  if (hasX402Credential(c.req.header("payment-signature"), c.req.header("x-payment"))) {
    if (!c.env.X402_WALLET_ADDRESS) {
      return c.json({ error: "Payment required", message: "x402 not configured. Use budget='free' or an API key." }, 402);
    }
    try {
      const dynamicHandler = paymentMiddleware(
        {
          "POST /v1/chat/completions": {
            accepts: [{ scheme: "exact", price, network: "eip155:8453", payTo: c.env.X402_WALLET_ADDRESS }],
            description: priceDescription,
            mimeType: "application/json",
          },
        },
        x402Server
      );
      const wrappedNext = async () => {
        c.set("authTier" as never, "x402" as never);
        return await next();
      };
      return await dynamicHandler(c, wrappedNext);
    } catch (err: unknown) {
      console.error("[x402] Middleware error:", err instanceof Error ? err.message : String(err));
      return c.json({
        error: "Payment required",
        x402: {
          version: 2,
          accepts: [{ scheme: "exact", price, network: "eip155:8453", payTo: c.env.X402_WALLET_ADDRESS ?? "" }],
          description: priceDescription,
        },
      }, 402);
    }
  }

  // ── No payment credential → dual-rail 402 challenge ──────────────────────
  // Return BOTH MPP (WWW-Authenticate: Payment) and x402 challenge so any
  // client can pick its preferred payment rail. Per MPP spec, clients ignore
  // headers they don't understand — backward compatible with x402 clients.
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Generate MPP challenge (async, uses HMAC-bound ID)
  if (isMppConfigured(c.env)) {
    try {
      const wwwAuth = await buildMppWwwAuthenticate(c.env, toMppAmount(price), priceDescription);
      headers["WWW-Authenticate"] = wwwAuth;
    } catch (err: unknown) {
      console.error("[MPP] Challenge generation error:", err instanceof Error ? err.message : String(err));
    }
  }

  const responseBody: Record<string, unknown> = {
    error: "Payment required",
    message: `This endpoint requires payment. Price: ${price} (${complexityTier} query). Use budget='free' for free models.`,
    price,
    complexity: complexityTier,
    payment_methods: [
      ...(isMppConfigured(c.env) ? [{ method: "mpp", header: "Authorization: Payment <credential>", chain: "tempo" }] : []),
      ...(c.env.X402_WALLET_ADDRESS ? [{ method: "x402", header: "X-PAYMENT <credential>", chain: "base-mainnet" }] : []),
    ],
  };

  // Include x402 challenge data in body for x402-aware clients
  if (c.env.X402_WALLET_ADDRESS) {
    responseBody.x402 = {
      version: 2,
      accepts: [{ scheme: "exact", price, network: "eip155:8453", payTo: c.env.X402_WALLET_ADDRESS }],
      description: priceDescription,
    };
  }

  return new Response(JSON.stringify(responseBody), { status: 402, headers });
});

// Main Endpoint: Run consensus logic
app.post("/v1/chat/completions", async (c) => {
  const requestStartedAt = Date.now();
  const requestId = `cons-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  // Use pre-parsed body if available (avoids double-parse)
  let body = (c.get("parsedBody" as never) as Record<string, unknown>) || await c.req.json();

  // Prompt compression (lossless, applied when messages total > 5000 chars)
  let compressionStats: import("./compression/index").CompressionStats | null = null;
  if (Array.isArray(body.messages)) {
    const { compressMessages } = await import("./compression/index");
    const { messages: compressedMessages, stats } = compressMessages(body.messages as any[]);
    if (stats.saved_chars > 0) {
      body = { ...body, messages: compressedMessages };
      compressionStats = stats;
      console.log(`[Compression] Saved ${stats.saved_chars} chars (${(100 - stats.ratio * 100).toFixed(1)}%) via [${stats.layers_applied.join(",")}]`);
    }
  }

  const messages = body.messages as Array<{role: string; content: string}> | undefined;
  const prompt = messages?.[messages.length - 1]?.content || "";

  if (!prompt || typeof prompt !== "string") {
    return c.json({ error: "No valid prompt provided", request_id: requestId }, 400);
  }

  if (prompt.length > 8000) {
    return c.json({ error: "Prompt exceeds maximum length of 8000 characters", request_id: requestId }, 400);
  }

  const sanitizedPrompt = prompt.replace(/\0/g, "").trim();
  if (sanitizedPrompt.length === 0) {
    return c.json({ error: "Prompt cannot be empty", request_id: requestId }, 400);
  }

  // Require at least one provider key (OpenRouter or any direct provider)
  const hasAnyProviderKey = !!(
    c.env.OPENROUTER_API_KEY ||
    (c.env as any).OPENAI_API_KEY ||
    (c.env as any).ANTHROPIC_API_KEY ||
    (c.env as any).GOOGLE_API_KEY ||
    (c.env as any).DEEPSEEK_API_KEY ||
    (c.env as any).XAI_API_KEY
  );
  if (!hasAnyProviderKey) {
    return c.json({ error: "Service temporarily unavailable — no provider keys configured", request_id: requestId }, 503);
  }

  const authTier = (c.get("authTier" as never) as string) || "free";

  // "free" model alias → force free budget tier (must happen before budget computation)
  if (typeof body.model === "string" && body.model === "__alias:free") {
    (body as any).budget = "free";
  }

  const rawBudget = typeof body.budget === "string" ? body.budget : undefined;
  const routingBudget = normalizeRoutingBudget(rawBudget, authTier);
  const councilBudget = routingBudgetToCouncilBudget(routingBudget);

  // Always use full scorePrompt for accurate confidence — the middleware pre-scores for
  // x402 pricing but the handler needs real confidence for routing metadata.
  const preHasTools = (c.get("hasToolsArray" as never) as boolean | undefined) ?? Array.isArray(body.tools);
  const complexity = scorePrompt(sanitizedPrompt, preHasTools);
  const engine = new CouncilEngine(c.env);

  // Extract quick-win parameters from request body
  const sessionId = typeof body.session_id === "string" ? body.session_id : undefined;
  const maxCostUsd = typeof body.max_cost === "number" ? body.max_cost : undefined;
  const excludeModels = Array.isArray(body.exclude_models)
    ? (body.exclude_models as unknown[]).filter((m): m is string => typeof m === "string")
    : [];
  // "auto" / "default" / "" / "smart" are smart-routing sentinels — NOT forced model IDs.
  // Without this guard, body.model = "auto" gets passed straight to OpenRouter as
  // openrouter/auto (returning provider="Unknown" and bypassing our intelligent router).
  const SMART_ROUTING_SENTINELS = new Set(["auto", "default", "smart", ""]);
  const rawModel = typeof body.model === "string" ? body.model.trim().toLowerCase() : "";
  const forcedModelId = typeof body.model === "string" &&
                        !body.model.startsWith("__alias:") &&
                        !SMART_ROUTING_SENTINELS.has(rawModel)
    ? body.model
    : undefined;

  // === SPRINT 2: X-Agent-Step header ===
  const agentStep = parseAgentStep(c.req.header("X-Agent-Step"));
  if (agentStep.complexityTier) {
    // Header overrides scored complexity
    (complexity as any).tier = agentStep.complexityTier;
    console.log(`[Agent-Step] Override complexity → ${agentStep.complexityTier}`);
  }
  if (agentStep.forceCouncilMode) {
    (body as any).mode = "council";
    console.log(`[Agent-Step] Override mode → council (verification step)`);
  }

  // === SPRINT 2: Workflow Budget ===
  const workflowBudgetParam = body.workflow_budget as { session_id?: string; total_budget_usd?: number } | undefined;
  const workflowSessionId = workflowBudgetParam?.session_id || sessionId;
  let workflowBudgetRemaining: number | null = null;
  let workflowPctUsed: number | null = null;

  if (workflowSessionId && c.env.CONSENSUS_CACHE) {
    const tracker = new WorkflowTracker(c.env.CONSENSUS_CACHE);

    // Register budget if provided for first time
    if (workflowBudgetParam?.total_budget_usd && workflowBudgetParam.total_budget_usd > 0) {
      await tracker.initBudget(workflowSessionId, workflowBudgetParam.total_budget_usd);
    }

    try {
      const tierInfo = await tracker.getEffectiveTier(workflowSessionId, routingBudget);
      // Downgrade routing budget if workflow spending threshold crossed
      if (tierInfo.tier !== routingBudget) {
        console.log(`[Workflow] Budget downgrade: ${routingBudget} → ${tierInfo.tier} (${tierInfo.pctUsed}% used)`);
        (body as any)._workflowOverrideBudget = tierInfo.tier;
      }
      workflowBudgetRemaining = tierInfo.remainingUsd;
      workflowPctUsed = tierInfo.pctUsed;
    } catch (e: any) {
      if (e.message === "WORKFLOW_BUDGET_EXHAUSTED") {
        return c.json({
          error: "Workflow budget exhausted",
          message: "This session has used ≥95% of its allocated budget. Add more budget or start a new session.",
          session_id: workflowSessionId,
          request_id: requestId,
        }, 402);
      }
    }
  }

  // Apply workflow budget override
  const effectiveRoutingBudget: RoutingBudget = ((body as any)._workflowOverrideBudget as RoutingBudget) || routingBudget;

  // TASK-P4.11: Extract mode parameter — DEFAULT to smart routing (was "council")
  const rawMode = body.mode as string | undefined;
  const mode: "default" | "council" = (rawMode === "default" || rawMode === "council") ? rawMode : "default";

  const request: ConsensusRequest = {
    prompt: sanitizedPrompt,
    budget: councilBudget,
    reliability: (body.reliability === "high" ? "high" : "standard"),
    mode,
  };
  const wantsStream = body.stream === true;
  const dayKey = getUtcDayKey();
  const metricsPrefix = `metrics:${dayKey}`;

  // Global request counters for all modes.
  try {
    await Promise.all([
      incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_total`),
      incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_tier:${authTier}`),
      incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_mode:${mode}`),
      wantsStream
        ? incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:stream_requests`)
        : Promise.resolve(),
    ]);
  } catch (kvErr) {
    console.error("[Metrics] Request counter write failed (non-critical):", kvErr instanceof Error ? kvErr.message : String(kvErr));
  }

  // TASK-P4.10, P4.11, P4.13, P4.15, P4.16: Smart Routing with Circuit Breaker and Failover
  // Uses D1 database for model selection, supports streaming, automatic failover
  if (mode === "default") {
    // Session pinning: check if caller has a pinned model for this session
    let sessionPinnedModelId: string | null = null;
    if (sessionId && c.env.CONSENSUS_CACHE) {
      try {
        sessionPinnedModelId = await c.env.CONSENSUS_CACHE.get(`chat_session:${sessionId}`);
        if (sessionPinnedModelId) {
          console.log(`[Smart Router] Session pin HIT for ${sessionId}: ${sessionPinnedModelId}`);
        }
      } catch { /* non-critical */ }
    }

    // Detect topic with detailed detection
    const topicDetection = detectTopicDetailed(sanitizedPrompt);
    const topic = topicDetection.secondary || topicDetection.primary;

    // Keep topic detection stable for agentic workflows.
    // Forcing generic agentic traffic to "code" can degrade non-code tasks (e.g., research).
    const effectiveTopic = topic;

    console.log(`[Smart Router] Topic detected: ${effectiveTopic} (confidence: ${topicDetection.confidence.toFixed(2)}, agentic: ${complexity.isAgentic})`);

    // Initialize circuit breaker, telemetry, and route cache
    const { ModelCircuitBreaker } = await import('./router/circuit-breaker');
    const { RoutingTelemetry } = await import('./router/telemetry');
    const { RouteCache } = await import('./router/route-cache');
    const circuitBreaker = new ModelCircuitBreaker(c.env.CONSENSUS_CACHE);
    const telemetry = new RoutingTelemetry(c.env.CONSENSUS_CACHE);
    const routeCache = new RouteCache(c.env.CONSENSUS_CACHE);

    const desiredCandidateCount = complexity.isAgentic ? 10 : 3;
    const routeCacheTopic = `${effectiveTopic}|${complexity.tier}|${complexity.isAgentic ? "agentic" : "standard"}`;

    // Get candidate models from D1 for failover chain.
    // Route cache is safe for lexical/database routing, but NOT for semantic routing:
    // semantic selection depends on the exact prompt embedding, while this cache key
    // is only topic|complexity|agentic|budget. Caching semantic results here would
    // make the first prompt in a bucket control unrelated prompts for up to 1 hour.
    const bypassCache = body.bypass_cache === true;
    const semanticRoutingEnabled = c.env.SEMANTIC_ROUTING_ENABLED === 'true';
    const shouldUseRouteCache = !semanticRoutingEnabled && !bypassCache;
    let candidateModels: Array<{ id: string; name: string; provider: string; input_price: number; output_price: number }> = [];
    let dataSource = 'fallback_registry';

    try {
      if (c.env.SCORE_DB) {
        // Check cache first (saves ~4ms D1 query)
        const cacheVersion = shouldUseRouteCache ? await routeCache.getCacheVersion() : null;
        const cachedModelId = shouldUseRouteCache ? await routeCache.getCachedRouteWithVersion(routeCacheTopic, effectiveRoutingBudget, cacheVersion) : null;

        if (cachedModelId) {
          // Cache hit! Use cached model as primary candidate
          const { getModelById } = await import('./db/queries');
          const cachedModel = await getModelById(c.env.SCORE_DB, cachedModelId);

          if (cachedModel) {
            candidateModels = [cachedModel];
            dataSource = 'cache';
            console.log(`[Smart Router] Route cache HIT: ${cachedModelId}`);

            // Still get backups from D1 for failover
            const { getModelsForDomain } = await import('./db/queries');
              const backupModels = await getModelsForDomain(c.env.SCORE_DB, effectiveTopic, effectiveRoutingBudget, complexity.tier);
              if (backupModels && backupModels.length > 1) {
                // Add backups (excluding cached model if it appears)
                const backups = backupModels.filter(m => m.id !== cachedModelId).slice(0, Math.max(0, desiredCandidateCount - 1));
                candidateModels.push(...backups);
              }
          } else {
            // Cached model not found (deleted?), fall through to normal D1 query
            console.log(`[Smart Router] Cached model ${cachedModelId} not found, querying D1...`);
          }
        }

        // Cache miss or cached model not found - query D1
        if (candidateModels.length === 0) {
          // Try semantic routing if enabled
          let semanticResult = null;

          if (semanticRoutingEnabled && c.env.AI && c.env.SCORE_DB) {
            try {
              const { SemanticRouter } = await import('./router/semantic-router');
              const semanticRouter = new SemanticRouter(c.env, true);
              const messages = (body as any).messages || [];
              const lastMessage = messages[messages.length - 1];
              const query = typeof lastMessage?.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage?.content || '');

              // Use parent domain for semantic routing (embeddings are top-level only)
              const topLevelDomain = effectiveTopic.includes('/') ? effectiveTopic.split('/')[0] : effectiveTopic;

              semanticResult = await semanticRouter.route(
                query,
                topLevelDomain,
                effectiveRoutingBudget,
                complexity.tier
              );

              if (semanticResult && semanticResult.semantic_enabled) {
                // Get the semantic-selected model plus backups
                const { getModelById, getModelsForDomain } = await import('./db/queries');
                const primaryModel = await getModelById(c.env.SCORE_DB, semanticResult.model_id);

                if (primaryModel) {
                  candidateModels = [primaryModel];
                  dataSource = 'semantic';
                  console.log(`[Semantic Router] Selected ${semanticResult.model_id} (score: ${semanticResult.final_score.toFixed(3)}, latency: ${semanticResult.semantic_latency_ms}ms)`);

                  // Add backup models for failover
                  const backups = await getModelsForDomain(c.env.SCORE_DB, effectiveTopic, effectiveRoutingBudget, complexity.tier);
                  if (backups && backups.length > 1) {
                    const backupModels = backups.filter(m => m.id !== semanticResult!.model_id).slice(0, 2);
                    candidateModels.push(...backupModels);
                  }

                  // Do not route-cache semantic results. Semantic routing is prompt-specific;
                  // this coarse cache key would reuse one prompt's selected model for
                  // unrelated prompts in the same topic/complexity/budget bucket.
                }
              }
            } catch (semanticErr) {
              console.error(`[Semantic Router] Failed, falling back to traditional routing:`, semanticErr instanceof Error ? semanticErr.message : semanticErr);
            }
          }

          // Fallback to traditional D1 routing if semantic routing disabled or failed
          if (candidateModels.length === 0) {
            const { getModelsForDomain } = await import('./db/queries');
            const models = await getModelsForDomain(c.env.SCORE_DB, effectiveTopic, effectiveRoutingBudget, complexity.tier);

            if (models && models.length > 0) {
              candidateModels = models.slice(0, desiredCandidateCount);
              dataSource = semanticResult?.fallback_reason ? `database_fallback:${semanticResult.fallback_reason}` : 'database';
              console.log(`[Smart Router] D1 returned ${models.length} models, using top ${desiredCandidateCount} for failover chain`);

              // Cache lexical/database routing only. Semantic-enabled deployments should
              // re-run prompt-specific semantic ranking on each request.
              if (shouldUseRouteCache) {
                c.executionCtx.waitUntil(
                  routeCache.cacheRoute(routeCacheTopic, effectiveRoutingBudget, models[0].id, models[0].name)
                );
              }
            }
          }
        }
      }
    } catch (dbErr) {
      console.error(`[Smart Router] D1 query failed, falling back to registry:`, dbErr);
    }

    // Fallback to hardcoded registry if D1 fails or returns no results
    if (candidateModels.length === 0) {
      console.log(`[Smart Router] Using fallback registry`);
      const topLevelTopic = effectiveTopic.split('/')[0] as any;
      const fallback = selectBestModel(topLevelTopic, complexity.tier, councilBudget);
      candidateModels = [{
        id: fallback.id,
        name: fallback.name,
        provider: 'Unknown',
        input_price: fallback.inputPricePer1M,
        output_price: fallback.outputPricePer1M,
      }];
    }

    // === QUICK WINS: Apply request-level filters to candidate pool ===

    // 1. Forced model override (body.model = specific model ID)
    if (forcedModelId) {
      const found = candidateModels.find(m => m.id === forcedModelId);
      if (found) {
        // Promote requested model to first position
        candidateModels = [found, ...candidateModels.filter(m => m.id !== forcedModelId)];
      } else {
        // Insert forced model as primary candidate (will be tried first)
        candidateModels = [{ id: forcedModelId, name: forcedModelId, provider: 'Unknown', input_price: 0, output_price: 0 }, ...candidateModels];
      }
    }

    // 2. Session pinning: promote pinned model to first position
    if (sessionPinnedModelId && !forcedModelId) {
      const pinned = candidateModels.find(m => m.id === sessionPinnedModelId);
      if (pinned) {
        candidateModels = [pinned, ...candidateModels.filter(m => m.id !== sessionPinnedModelId)];
      } else {
        // Pinned model not in candidates (DB changed?), insert it as primary
        candidateModels = [{ id: sessionPinnedModelId, name: sessionPinnedModelId, provider: 'Unknown', input_price: 0, output_price: 0 }, ...candidateModels];
      }
      dataSource = 'session_pin';
    }

    // 3. Exclude models from request body
    if (excludeModels.length > 0) {
      const filtered = candidateModels.filter(m => !excludeModels.includes(m.id));
      if (filtered.length > 0) candidateModels = filtered;
      // If all models excluded, keep original list (better than empty)
    }

    // 4. Context-length filtering: remove models that can't handle the request size
    const tokenEstimate = (c.get("tokenEstimate" as never) as number | undefined) ?? 0;
    if (tokenEstimate > 100) {
      const contextFiltered = candidateModels.filter(m => {
        const contextLen = (m as any).context_length;
        return !contextLen || contextLen >= tokenEstimate * 1.2; // 20% buffer
      });
      if (contextFiltered.length > 0) candidateModels = contextFiltered;
    }

    // 5. max_cost filtering: exclude models exceeding per-request budget
    if (maxCostUsd !== undefined && maxCostUsd > 0) {
      // Estimate tokens: assume ~500 output tokens for typical request
      const estimatedOutputTokens = 500;
      const costFiltered = candidateModels.filter(m => {
        const inputCost = ((tokenEstimate || 200) / 1_000_000) * m.input_price;
        const outputCost = (estimatedOutputTokens / 1_000_000) * m.output_price;
        return (inputCost + outputCost) <= maxCostUsd;
      });
      if (costFiltered.length > 0) {
        candidateModels = costFiltered;
      } else {
        // Graceful degradation: if nothing fits budget, pick cheapest available
        candidateModels = [...candidateModels].sort((a, b) => a.input_price - b.input_price).slice(0, 1);
      }
    }

    // 6. Agentic routing guardrail for tool-use requests.
    // Keep both chat and reasoning models eligible, but block known-bad tool models.
    let agenticFiltered = false;
    let agenticTier: "guardrail" | undefined;
    let agenticWarning: string | undefined;
    if (complexity.isAgentic && !forcedModelId && !sessionPinnedModelId) {
      const TOOL_CAPABLE_PATTERNS = [
        /claude(-|\/|$)/i,
        /gpt-4o/i, /gpt-4\.1/i, /gpt-5/i,
        /gpt-4(?!.*o-?mini)/i,
        /o[1-9].*(mini|pro)/i,
        /gemini.*(pro|flash)(?!-image)/i,
        /mistral.*(large|medium)/i,
        /deepseek.*(chat|coder|r1|v3|deepthink)/i,
        /qwen.*(2\.5|3)/i,
        /llama-?(3|4).*?-(70b|405b|maverick|scout)/i,
        /grok-?[3-9]/i,
        /command-r/i,
      ];
      // Hard-blocked patterns — never used for tool calling.
      const NEVER_FOR_TOOLS = [
        /openrouter\/(auto|free)/i,              // OpenRouter meta-routers
        /-1\.2b/i, /-2b-/i, /-3b-/i,             // Tiny models < ~7B
        /:free$/i,                               // Free-tier auto suffixes
        /^thinking-/i, /-thinking(:|$|-)/i,      // Pure thinking variants
        /gpt-oss/i,                              // OSS GPT clones
        /lfm-/i,                                 // Liquid models
        /-image/i, /-vision-only/i,              // Image-only models
      ];

      const isBlocked = (id: string) => NEVER_FOR_TOOLS.some(p => p.test(id));
      const isToolCapable = (id: string) =>
        TOOL_CAPABLE_PATTERNS.some(p => p.test(id)) && !isBlocked(id);

      const guardrailFiltered = candidateModels.filter(m => !isBlocked(m.id));
      if (guardrailFiltered.length > 0) {
        candidateModels = guardrailFiltered;
        agenticFiltered = true;
        agenticTier = "guardrail";
      }

      const toolCapable = candidateModels.filter(m => isToolCapable(m.id));
      if (toolCapable.length > 0) {
        candidateModels = toolCapable;
        agenticFiltered = true;
        agenticTier = "guardrail";
        console.log(`[Smart Router] Agentic guardrail: ${toolCapable.length}/${candidateModels.length} tool-capable models remain`);
      } else {
        // No verified tool-capable models in current pool — keep non-blocked list with warning.
        agenticWarning = `No verified tool-capable models in budget="${effectiveRoutingBudget}" pool. Tool calling may fail. Try budget="auto" or "premium".`;
        console.warn(`[Smart Router] ${agenticWarning} (topic=${topic})`);
      }
    }

    const modelsConsidered = candidateModels.length;
    // Surface top candidate IDs for client-side debugging (partner request).
    const candidateModelIds = candidateModels.slice(0, 6).map(m => m.id);

    // Filter out circuit-broken models
    const healthyModels: typeof candidateModels = [];
    for (const model of candidateModels) {
      const isHealthy = await circuitBreaker.isModelHealthy(model.id);
      if (isHealthy) {
        healthyModels.push(model);
      } else {
        console.log(`[Smart Router] Skipping ${model.id} - circuit breaker is open`);
      }
    }

    if (healthyModels.length === 0) {
      // Last resort: try hardcoded fallback registry (known-working models)
      console.warn('[Smart Router] All D1 candidates circuit-broken, trying fallback registry');
      const topLevelTopic = effectiveTopic.split('/')[0] as any;
      const fallback = selectBestModel(topLevelTopic, complexity.tier, councilBudget);
      const fallbackHealthy = await circuitBreaker.isModelHealthy(fallback.id);
      if (fallbackHealthy) {
        healthyModels.push({
          id: fallback.id,
          name: fallback.name,
          provider: 'Unknown',
          input_price: fallback.inputPricePer1M,
          output_price: fallback.outputPricePer1M,
        });
        dataSource = 'fallback_registry';
      } else {
        console.error('[Smart Router] All models including fallback are circuit-broken!');
        c.executionCtx.waitUntil(incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:errors_total`));
        return c.json({
          error: 'All models unavailable',
          message: 'All candidate models are currently failing. Please try again later.',
          request_id: requestId,
        }, 503);
      }
    }

    // Initialize OpenAI client for OpenRouter fallback (only if key available)
    const openai = c.env.OPENROUTER_API_KEY
      ? new OpenAI({
          baseURL: 'https://openrouter.ai/api/v1',
          apiKey: c.env.OPENROUTER_API_KEY,
          defaultHeaders: {
            'HTTP-Referer': 'https://arcrouter.ai',
            'X-Title': 'ArcRouter',
          },
        })
      : null;

    const requestTools = Array.isArray(body.tools) ? (body.tools as unknown[]) : undefined;
    const requestToolChoice = (body as { tool_choice?: unknown }).tool_choice;
    const requestParallelToolCalls = (body as { parallel_tool_calls?: unknown }).parallel_tool_calls;
    const toolCallRequired = shouldEnforceToolCall(messages, !!requestTools?.length, requestToolChoice, complexity.isAgentic);

    // Failover chain: try up to 3 models
    const MAX_FAILOVER_ATTEMPTS = Math.min(healthyModels.length, 3);
    let lastError: Error | null = null;
    let failoverCount = 0;

    for (let i = 0; i < MAX_FAILOVER_ATTEMPTS; i++) {
      const model = healthyModels[i];
      console.log(`[Smart Router] Attempt ${i + 1}/${MAX_FAILOVER_ATTEMPTS}: Trying ${model.id}`);

      const startTime = Date.now();

      try {
        if (wantsStream) {
          // TASK-P4.10: Streaming support with failover
          // NOTE: For streaming, we can only failover BEFORE the first chunk arrives
          // Once chunks start flowing, we cannot switch models
          // Direct provider streaming: use OpenAI-compatible providers directly when possible
          // (Anthropic streaming format differs, so Anthropic always goes via OpenRouter for streams)
          const directStreamResult = await callDirectProvider(
            model.id,
            {
              model: model.id,
              messages: body.messages as any,
              temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
              max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
              tools: requestTools as any,
              tool_choice: requestToolChoice as any,
              parallel_tool_calls: requestParallelToolCalls as any,
              stream: true,
            },
            c.env
          );

          let streamSource: AsyncIterable<any>;
          let streamCallPath = 'openrouter';

          if (directStreamResult) {
            // Direct provider returned a streaming response — pipe it through
            const reader = directStreamResult.response.body?.getReader();
            streamCallPath = `direct:${getProviderName(model.id)}`;
            console.log(`[DirectProvider] Streaming via ${directStreamResult.provider} for ${model.id}`);

            const encoder2 = new TextEncoder();
            const readable2 = new ReadableStream({
              async start(controller) {
                if (!reader) { controller.close(); return; }
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    controller.enqueue(value);
                  }
                  controller.close();
                  c.executionCtx.waitUntil(Promise.all([
                    circuitBreaker.recordSuccess(model.id),
                    telemetry.record(model.id, Date.now() - startTime, true),
                  ]));
                } catch (e) {
                  c.executionCtx.waitUntil(circuitBreaker.recordFailure(model.id));
                  controller.error(e);
                }
              },
            });
            return new Response(readable2, {
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'X-ArcRouter-Mode': 'default',
                'X-ArcRouter-Model': model.id,
                'X-ArcRouter-Call-Path': streamCallPath,
              },
            });
          }

          if (!openai) {
            throw new Error(`No provider available for ${model.id} (no OpenRouter key and direct provider returned null)`);
          }
          const stream = await openai.chat.completions.create({
            model: model.id,
              messages: body.messages as any,
              temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
              max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
              tools: requestTools as any,
              tool_choice: requestToolChoice as any,
              parallel_tool_calls: requestParallelToolCalls as any,
              stream: true,
            });

          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              try {
                for await (const chunk of stream) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();

                const totalLatency = Date.now() - startTime;

                const logSuccess = async () => {
                  if (!c.env.SCORE_DB) return;
                  const { logRoutingDecision } = await import('./router/routing-history');
                  await logRoutingDecision(c.env.SCORE_DB, {
                    request_id: requestId,
                    topic,
                    topic_confidence: topicDetection.confidence,
                    complexity: complexity.tier,
                    budget: routingBudget,
                    selected_model: model.id,
                    data_source: dataSource,
                    latency_ms: totalLatency,
                    success: true,
                    failover_count: failoverCount,
                    created_at: new Date().toISOString(),
                  });
                };

                // Per-key usage tracking for stream requests
                const streamKeyHash = c.get("keyHash" as never) as string | undefined;
                const trackStreamUsage = async () => {
                  if (!streamKeyHash || !c.env.CONSENSUS_CACHE) return;
                  try {
                    const usageKey = `usage:${streamKeyHash}:${dayKey}`;
                    const existing = await c.env.CONSENSUS_CACHE.get(usageKey, { type: "json" }) as { requests: number; cost_usd: number } | null;
                    const spendUsd = tokenEstimate > 0
                      ? ((tokenEstimate / 1_000_000) * model.input_price) + (500 / 1_000_000 * model.output_price)
                      : (complexity.tier === "SIMPLE" ? 0.001 : complexity.tier === "REASONING" ? 0.008 : 0.002);
                    await c.env.CONSENSUS_CACHE.put(usageKey, JSON.stringify({
                      requests: (existing?.requests ?? 0) + 1,
                      cost_usd: parseFloat(((existing?.cost_usd ?? 0) + spendUsd).toFixed(6)),
                    }), { expirationTtl: 60 * 60 * 24 * 90 });
                  } catch { /* non-critical */ }
                };

                c.executionCtx.waitUntil(Promise.all([
                  circuitBreaker.recordSuccess(model.id),
                  telemetry.record(model.id, totalLatency, true),
                  addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_sum_ms`, totalLatency),
                  incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_count`),
                  logSuccess(),
                  trackStreamUsage(),
                ]));
              } catch (streamErr) {
                console.error('[Smart Router] Stream error:', streamErr);
                // Stream already started, can't fail over now
                const totalLatency = Date.now() - startTime;

                const logFailure = async () => {
                  if (!c.env.SCORE_DB) return;
                  const { logRoutingDecision } = await import('./router/routing-history');
                  await logRoutingDecision(c.env.SCORE_DB, {
                    request_id: requestId,
                    topic,
                    topic_confidence: topicDetection.confidence,
                    complexity: complexity.tier,
                    budget: routingBudget,
                    selected_model: model.id,
                    data_source: dataSource,
                    latency_ms: totalLatency,
                    success: false,
                    failover_count: failoverCount,
                    created_at: new Date().toISOString(),
                  });
                };

                c.executionCtx.waitUntil(Promise.all([
                  circuitBreaker.recordFailure(model.id),
                  telemetry.record(model.id, totalLatency, false),
                  incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:errors_total`),
                  logFailure(),
                ]));
                controller.error(streamErr);
              }
            },
          });

          return new Response(readable, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'X-ArcRouter-Mode': 'default',
              'X-ArcRouter-Model': model.id,
              'X-ArcRouter-Topic': topic,
              'X-ArcRouter-Budget': routingBudget,
              'X-ArcRouter-Confidence': topicDetection.confidence.toFixed(2),
              'X-ArcRouter-Failover-Count': String(failoverCount),
            },
          });
        } else {
          // Non-streaming response with failover
          // Try direct provider first; fall back to OpenRouter when key not set or direct call fails
          let completion: Record<string, unknown>;
          let usedDirectProvider = false;

          const directResult = await callDirectProvider(
            model.id,
            {
              model: model.id,
              messages: body.messages as any,
              temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
              max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
              tools: requestTools as any,
              tool_choice: requestToolChoice as any,
              parallel_tool_calls: requestParallelToolCalls as any,
            },
            c.env
          );

          if (directResult) {
            completion = await directResult.response.json() as Record<string, unknown>;
            usedDirectProvider = true;
            console.log(`[DirectProvider] Used ${directResult.provider} for ${model.id}`);
          } else if (openai) {
            // Fall back to OpenRouter
            completion = await openai.chat.completions.create({
              model: model.id,
              messages: body.messages as any,
              temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
              max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
              tools: requestTools as any,
              tool_choice: requestToolChoice as any,
              parallel_tool_calls: requestParallelToolCalls as any,
            }) as any;
          } else {
            throw new Error(`No provider available for ${model.id} (no OpenRouter key and direct provider returned null)`);
          }

          // Quality guard: for explicit tool workflows, retry another model when no tool call is emitted.
          const firstChoice = (completion as { choices?: Array<{ message?: { tool_calls?: unknown[]; content?: unknown }; finish_reason?: unknown }> }).choices?.[0];
          const toolCalls = Array.isArray(firstChoice?.message?.tool_calls) ? firstChoice?.message?.tool_calls : [];
          if (toolCallRequired && toolCalls.length === 0) {
            const finishReason = typeof firstChoice?.finish_reason === "string" ? firstChoice.finish_reason : "unknown";
            const contentPreview = typeof firstChoice?.message?.content === "string"
              ? firstChoice.message.content.slice(0, 120).replace(/\s+/g, " ")
              : "";
            throw new Error(`No tool calls emitted for a tool-required request (finish_reason=${finishReason}, preview="${contentPreview}")`);
          }

          const latency = Date.now() - startTime;

          // Success! Record and return
          await circuitBreaker.recordSuccess(model.id);

          // Session pinning: save successful model for future requests with same session_id
          if (sessionId && c.env.CONSENSUS_CACHE) {
            c.executionCtx.waitUntil(
              c.env.CONSENSUS_CACHE.put(`chat_session:${sessionId}`, model.id, { expirationTtl: 3600 })
            );
          }

          // Per-key usage tracking (async, don't block response)
          const keyHashForUsage = c.get("keyHash" as never) as string | undefined;
          if (keyHashForUsage && c.env.CONSENSUS_CACHE) {
            const usageKey = `usage:${keyHashForUsage}:${dayKey}`;
            c.executionCtx.waitUntil(
              (async () => {
                try {
                  const existing = await c.env.CONSENSUS_CACHE.get(usageKey, { type: "json" }) as { requests: number; cost_usd: number } | null;
                  const spendUsd = tokenEstimate > 0
                    ? ((tokenEstimate / 1_000_000) * model.input_price) + (500 / 1_000_000 * model.output_price)
                    : (complexity.tier === "SIMPLE" ? 0.001 : complexity.tier === "REASONING" ? 0.008 : 0.002);
                  await c.env.CONSENSUS_CACHE.put(usageKey, JSON.stringify({
                    requests: (existing?.requests ?? 0) + 1,
                    cost_usd: parseFloat(((existing?.cost_usd ?? 0) + spendUsd).toFixed(6)),
                  }), { expirationTtl: 60 * 60 * 24 * 90 }); // 90-day TTL
                } catch { /* non-critical */ }
              })()
            );
          }

          // Workflow budget: record spend (async, don't block response)
          if (workflowSessionId && c.env.CONSENSUS_CACHE) {
            const tracker = new WorkflowTracker(c.env.CONSENSUS_CACHE);
            const spendUsd = tokenEstimate > 0
              ? ((tokenEstimate / 1_000_000) * model.input_price) + (500 / 1_000_000 * model.output_price)
              : (complexity.tier === "SIMPLE" ? 0.001 : complexity.tier === "REASONING" ? 0.008 : 0.002);
            c.executionCtx.waitUntil(
              tracker.recordRequest(workflowSessionId, model.id, spendUsd, latency, complexity.tier)
            );
          }

          // Record telemetry (async, don't block response)
          c.executionCtx.waitUntil(telemetry.record(model.id, latency, true));
          c.executionCtx.waitUntil(Promise.all([
            addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_sum_ms`, latency),
            incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_count`),
          ]));

          // Log routing decision (async, don't block response)
          if (c.env.SCORE_DB) {
            const { logRoutingDecision } = await import('./router/routing-history');
            c.executionCtx.waitUntil(
              logRoutingDecision(c.env.SCORE_DB, {
                request_id: requestId,
                topic,
                topic_confidence: topicDetection.confidence,
                complexity: complexity.tier,
                budget: routingBudget,
                selected_model: model.id,
                data_source: dataSource,
                latency_ms: latency,
                success: true,
                failover_count: failoverCount,
                created_at: new Date().toISOString(),
              })
            );
          }

          // Routing metadata enrichment
          const avgModelPrice = (model.input_price + model.output_price) / 2;
          const GPT4O_AVG_PRICE = 10.0; // $10/1M tokens avg
          const savingsVsGpt4 = avgModelPrice > 0 && avgModelPrice < GPT4O_AVG_PRICE
            ? Math.round((1 - avgModelPrice / GPT4O_AVG_PRICE) * 100)
            : undefined;
          const estimatedCostUsd = tokenEstimate > 0
            ? parseFloat((((tokenEstimate / 1_000_000) * model.input_price) + (500 / 1_000_000 * model.output_price)).toFixed(6))
            : undefined;

          const responseHeaders: Record<string, string> = {
            'X-ArcRouter-Model': model.id,
            'X-ArcRouter-Topic': topic,
            'X-ArcRouter-Complexity': complexity.tier,
          };
          if (compressionStats && compressionStats.saved_chars > 0) {
            responseHeaders['X-Compression-Ratio'] = compressionStats.ratio.toString();
            responseHeaders['X-Compression-Saved-Chars'] = compressionStats.saved_chars.toString();
          }
          if (workflowBudgetRemaining !== null) {
            responseHeaders['X-ArcRouter-Budget-Remaining'] = workflowBudgetRemaining.toString();
          }
          if (workflowPctUsed !== null) {
            responseHeaders['X-ArcRouter-Budget-Used-Pct'] = workflowPctUsed.toString();
          }
          if (agentStep.complexityTier) {
            responseHeaders['X-ArcRouter-Agent-Step'] = c.req.header("X-Agent-Step") || "";
          }

          // Per-request log to D1 for dashboard + margin reconciliation (non-blocking)
          if (c.env.SCORE_DB) {
            const { writeRoutingLog } = await import('./router/routing-log');
            const usage = (completion as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
            const inTok = usage?.prompt_tokens;
            const outTok = usage?.completion_tokens;
            const actualCostUsd = (inTok !== undefined && outTok !== undefined)
              ? parseFloat((((inTok / 1_000_000) * model.input_price) + ((outTok / 1_000_000) * model.output_price)).toFixed(6))
              : estimatedCostUsd;
            const chargedUsd = getChargedPriceUsd(authTier, effectiveRoutingBudget, complexity.tier, "default");
            c.executionCtx.waitUntil(
              writeRoutingLog(c.env.SCORE_DB, {
                request_id: requestId,
                timestamp: Date.now(),
                api_key_hash: c.get('keyHash' as never) as string | undefined,
                auth_tier: authTier,
                model_id: model.id,
                topic,
                complexity_tier: complexity.tier,
                latency_ms: Date.now() - requestStartedAt,
                input_tokens: inTok,
                output_tokens: outTok,
                cost_usd: actualCostUsd,
                charged_usd: chargedUsd,
                call_path: usedDirectProvider ? `direct:${getProviderName(model.id)}` : 'openrouter',
                status: 'success',
                is_agentic: complexity.isAgentic,
                mode: 'default',
                session_id: sessionId || undefined,
              })
            );
          }

          return c.json({
            ...completion,
            routing: {
              mode: 'default',
              selected_model: model.id,
              model_name: model.name,
              provider: model.provider,
              call_path: usedDirectProvider ? `direct:${getProviderName(model.id)}` : 'openrouter',
              topic_detected: topic,
              topic_confidence: Math.round(topicDetection.confidence * 100) / 100,
              complexity_tier: complexity.tier,
              complexity_confidence: Math.round(complexity.confidence * 100) / 100,
              budget: effectiveRoutingBudget,
              data_source: dataSource,
              failover_count: failoverCount,
              models_considered: modelsConsidered,
              candidate_models: candidateModelIds,
              is_agentic: complexity.isAgentic,
              ...(agenticFiltered && { agentic_filter_applied: true }),
              ...(agenticTier && { agentic_tier: agenticTier }),
              ...(agenticWarning && { agentic_warning: agenticWarning }),
              ...(agentStep.complexityTier && { agent_step_override: agentStep.complexityTier }),
              ...(estimatedCostUsd !== undefined && { estimated_cost_usd: estimatedCostUsd }),
              charged_cost_usd: getChargedPriceUsd(authTier, effectiveRoutingBudget, complexity.tier, "default"),
              ...(savingsVsGpt4 !== undefined && { savings_vs_gpt4_pct: savingsVsGpt4 }),
              ...(sessionId && { session_pinned: dataSource === 'session_pin' }),
              ...(workflowBudgetRemaining !== null && { workflow_budget_remaining_usd: workflowBudgetRemaining }),
            },
          }, 200, responseHeaders);
        }
      } catch (error: any) {
        const latency = Date.now() - startTime;
        lastError = error;
        failoverCount++;
        await circuitBreaker.recordFailure(model.id);

        // Record failure in telemetry (async, don't block)
        c.executionCtx.waitUntil(telemetry.record(model.id, latency, false));

        console.error(`[Smart Router] Model ${model.id} failed:`, error.message);

        // If not the last model, try next one
        if (i < MAX_FAILOVER_ATTEMPTS - 1) {
          console.log(`[Smart Router] Failing over to next model...`);
          continue;
        }
      }
    }

    // All models failed
    console.error('[Smart Router] All models in failover chain failed');

    // Log routing decision failure (async, don't block response)
    if (c.env.SCORE_DB && healthyModels.length > 0) {
      const { logRoutingDecision } = await import('./router/routing-history');
      c.executionCtx.waitUntil(
        logRoutingDecision(c.env.SCORE_DB, {
          request_id: requestId,
          topic,
          topic_confidence: topicDetection.confidence,
          complexity: complexity.tier,
          budget: routingBudget,
          selected_model: healthyModels[0].id, // Log the first attempted model
          data_source: dataSource,
          latency_ms: null, // No successful response
          success: false,
          failover_count: failoverCount,
          created_at: new Date().toISOString(),
        })
      );
    }

    c.executionCtx.waitUntil(incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:errors_total`));
    return c.json({
      error: 'All models failed',
      message: lastError?.message || 'Failed to call any model in failover chain',
      failover_count: failoverCount,
      request_id: requestId,
    }, 502);
  }

  try {
    const consensusStartedAt = Date.now();
    console.log(`[Monitoring] runConsensus:start request_id=${requestId} tier=${authTier} budget=${councilBudget} stream=${wantsStream}`);
    const result = await engine.runConsensus(request, complexity.tier);
    const consensusLatencyMs = Date.now() - consensusStartedAt;
    const totalLatencyMs = Date.now() - requestStartedAt;
    console.log(`[Monitoring] runConsensus:done request_id=${requestId} latency_ms=${consensusLatencyMs} total_ms=${totalLatencyMs}`);

    const estimatedTotalCostUsd = result.monitoring?.estimatedTotalCostUsd ?? 0;
    const chargedPriceUsd = getChargedPriceUsd(authTier, routingBudget, complexity.tier, "council");
    const marginAlert = estimatedTotalCostUsd > chargedPriceUsd;

    // 52a/52c/52d/52e monitoring metrics
    try {
      await Promise.all([
        addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:confidence_sum`, result.confidence),
        incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:confidence_count`),
        addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_consensus_sum_ms`, consensusLatencyMs),
        incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_consensus_count`),
        addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_sum_ms`, totalLatencyMs),
        incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_count`),
        addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cost_estimated_total_usd`, estimatedTotalCostUsd),
        addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cost_estimated_model_usd`, result.monitoring?.estimatedModelCostUsd ?? 0),
        addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cost_estimated_embedding_usd`, result.monitoring?.estimatedEmbeddingCostUsd ?? 0),
        addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cost_estimated_chairman_usd`, result.monitoring?.estimatedChairmanCostUsd ?? 0),
        addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:charged_total_usd`, chargedPriceUsd),
        result.monitoring?.usedChairman
          ? incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:chairman_path_count`)
          : Promise.resolve(),
        result.monitoring?.usedEmbeddings
          ? incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:embedding_path_count`)
          : Promise.resolve(),
        marginAlert
          ? incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:margin_alert_count`)
          : Promise.resolve(),
      ]);
    } catch (kvErr) {
      console.error('[Metrics] Post-consensus KV write failed (non-critical):', kvErr instanceof Error ? kvErr.message : String(kvErr));
    }

    // Report metered usage to Stripe for paid tier
    const subscriptionItemId = c.get("subscriptionItemId" as never) as string | undefined;
    if (authTier === "paid" && subscriptionItemId && c.env.STRIPE_SECRET_KEY) {
      // Report usage asynchronously (don't block response)
      c.executionCtx.waitUntil(
        (async () => {
          const { reportUsage } = await import("./payments/stripe");
          await reportUsage(c.env.STRIPE_SECRET_KEY, subscriptionItemId, 1);
        })()
      );
    }

    // --- SSE Streaming path ---
    if (wantsStream) {
      const id = requestId;
      const created = Math.floor(Date.now() / 1000);
      const encoder = new TextEncoder();

      // Tokenise answer into ~4-word chunks to simulate incremental delivery
      const tokens = result.answer.match(/\S+\s*/g) ?? [result.answer];
      const CHUNK_SIZE = 4;
      const wordChunks: string[] = [];
      for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
        wordChunks.push(tokens.slice(i, i + CHUNK_SIZE).join(""));
      }

      const consensusMeta = {
        confidence: result.confidence,
        tier: result.complexity,
        votes: result.votes,
        budget: councilBudget,
        synthesized: result.synthesized ?? false,
        cached: result.cached,
        mode_used: mode,  // TASK-A5: Track which mode was used
        degraded: result.degraded ?? false,  // CONCERN-3 FIX: Expose degraded council flag
        deliberation: result.deliberation,   // CONCERN-3 FIX: Expose deliberation metadata
      };

      const readable = new ReadableStream({
        start(controller) {
          const emit = (payload: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

          // Role announcement chunk (matches OpenAI streaming format)
          emit({ id, object: "chat.completion.chunk", created, model: "council-router-v1",
            choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] });

          // Content chunks
          for (const chunk of wordChunks) {
            emit({ id, object: "chat.completion.chunk", created, model: "council-router-v1",
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] });
          }

          // Final stop chunk — consensus metadata appended here (50c)
          emit({ id, object: "chat.completion.chunk", created, model: "council-router-v1",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            consensus: consensusMeta });

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // --- Non-streaming JSON path (unchanged) ---
    return c.json({
      id: requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "council-router-v1",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.answer,
          },
          finish_reason: "stop",
        },
      ],
      consensus: {
        confidence: result.confidence,
        tier: result.complexity,
        votes: result.votes,
        budget: councilBudget,
        synthesized: result.synthesized ?? false,
        cached: result.cached,
        monitoring: result.monitoring,
        mode_used: mode,  // TASK-A5: Track which mode was used
        degraded: result.degraded ?? false,  // CONCERN-3 FIX: Expose degraded council flag
        deliberation: result.deliberation,   // CONCERN-3 FIX: Expose deliberation metadata
      }
    });
  } catch (error: unknown) {
    try { await incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:errors_total`); } catch { /* KV limit */ }
    const failedTotalLatencyMs = Date.now() - requestStartedAt;
    console.log(`[Monitoring] runConsensus:error request_id=${requestId} total_ms=${failedTotalLatencyMs}`);

    if (error instanceof Error && error.message.startsWith("[BUDGET_GUARDRAIL]")) {
      // x402 + stream edge case: budget guardrail fired before any stream started (50d)
      if (wantsStream) {
        const encoder = new TextEncoder();
        const errPayload = { id: requestId, object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000), model: "council-router-v1",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          error: "Budget policy exceeded. Simplify the prompt or increase budget tier.",
          request_id: requestId };
        return new Response(
          encoder.encode(`data: ${JSON.stringify(errPayload)}\n\ndata: [DONE]\n\n`),
          { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
        );
      }
      return c.json({
        error: "Budget policy exceeded. Simplify the prompt or increase budget tier.",
        request_id: requestId
      }, 400);
    }

    // Log internally, return generic message to avoid leaking internals
    console.error(`[ArcRouter] Consensus error request_id=${requestId}:`, error instanceof Error ? error.message : String(error));

    if (wantsStream) {
      // Emit streaming error so clients don't hang waiting for [DONE] (50d)
      const encoder = new TextEncoder();
      const errPayload = { id: requestId, object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000), model: "council-router-v1",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        error: "Consensus processing failed. Please try again.",
        request_id: requestId };
      return new Response(
        encoder.encode(`data: ${JSON.stringify(errPayload)}\n\ndata: [DONE]\n\n`),
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
      );
    }

    return c.json({ error: "Consensus processing failed. Please try again.", request_id: requestId }, 500);
  }
});

// Health check — verifies config is present
app.get("/health", async (c) => {
  const directProviders = [
    (c.env as any).OPENAI_API_KEY && "openai",
    (c.env as any).ANTHROPIC_API_KEY && "anthropic",
    (c.env as any).GOOGLE_API_KEY && "google",
    (c.env as any).DEEPSEEK_API_KEY && "deepseek",
    (c.env as any).XAI_API_KEY && "xai",
  ].filter(Boolean) as string[];

  const checks: Record<string, string> = {
    status: "ok",
    openrouter_key: c.env.OPENROUTER_API_KEY ? "configured" : "not set",
    direct_providers: directProviders.length > 0 ? directProviders.join(", ") : "none",
    admin_token: c.env.ADMIN_TOKEN ? "configured" : "MISSING",
    x402_wallet: c.env.X402_WALLET_ADDRESS ? "configured" : "MISSING",
  };

  // Healthy if at least one provider is available
  const healthy = !!(c.env.OPENROUTER_API_KEY || directProviders.length > 0);
  return c.json({ ...checks, healthy }, healthy ? 200 : 503);
});

// Waitlist signup — beta launch email capture
app.post("/api/waitlist", async (c) => {
  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not available" }, 503);
  }

  // Rate limit: 3 submissions per IP per hour
  const ip = c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || "unknown";
  const ipHash = await hashApiKey(ip); // Reuse hash function
  const rateLimitKey = `waitlist:ratelimit:${ipHash}`;
  const currentCount = parseInt((await c.env.CONSENSUS_CACHE.get(rateLimitKey)) || "0");

  if (currentCount >= 3) {
    return c.json({ error: "Too many submissions. Please try again later." }, 429);
  }

  // Validate email
  const body = await c.req.json().catch(() => ({}));
  const emailSchema = z.object({
    email: z.string().email("Invalid email address").max(255),
  });

  const parsed = emailSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      error: "Invalid email address",
      details: parsed.error.flatten().fieldErrors
    }, 400);
  }

  const { email } = parsed.data;
  const referrer = c.req.header("referer") || null;
  const userAgent = c.req.header("user-agent") || null;

  try {
    // Insert into waitlist (UNIQUE constraint handles duplicates)
    await c.env.SCORE_DB.prepare(
      `INSERT INTO waitlist (email, referrer, user_agent, ip_hash)
       VALUES (?1, ?2, ?3, ?4)`
    ).bind(email, referrer, userAgent, ipHash).run();

    // Increment rate limit counter (1 hour TTL)
    await c.env.CONSENSUS_CACHE.put(rateLimitKey, (currentCount + 1).toString(), { expirationTtl: 3600 });

    // Get current waitlist count
    const countResult = await c.env.SCORE_DB.prepare(
      `SELECT COUNT(*) as count FROM waitlist`
    ).first<{ count: number }>();

    return c.json({
      success: true,
      message: "You're on the waitlist!",
      position: countResult?.count || 1
    }, 201);

  } catch (err: any) {
    // Handle duplicate email
    if (err.message?.includes("UNIQUE constraint failed")) {
      return c.json({ error: "This email is already on the waitlist." }, 409);
    }

    console.error("[Waitlist] Database error:", err);
    return c.json({ error: "Failed to save email. Please try again." }, 500);
  }
});

// Public: Get waitlist count (no auth, no rate limit)
app.get("/api/waitlist/count", async (c) => {
  if (!c.env.SCORE_DB) {
    return c.json({ count: 0 });
  }

  try {
    const result = await c.env.SCORE_DB.prepare(
      `SELECT COUNT(*) as count FROM waitlist`
    ).first<{ count: number }>();

    return c.json({ count: result?.count || 0 });
  } catch (err) {
    console.error("[Waitlist] Failed to get count:", err);
    return c.json({ count: 0 });
  }
});

// Root info endpoint
app.get("/", (c) => {
  return c.json({
    name: "ArcRouter API",
    status: "operational",
    version: "1.0.0",
    docs: "https://arcrouter.ai/docs",
    tiers: {
      free: "No API key required. Free-tier models only, 20 requests/hour.",
      paid: "API key required. All budget tiers, Stripe metered billing, $0.002 per request.",
      x402: "USDC payment on Base Mainnet. Variable pricing: $0.001 (simple), $0.002 (medium), $0.005 (complex).",
      mpp: "Tempo chain payment via MPP. Same pricing as x402. Send Authorization: Payment <credential>.",
    },
    modes: {
      default: "Smart routing to the best single model from benchmark scores.",
      council: "Multi-model consensus and confidence scoring.",
    },
  });
});

// MPP discovery endpoint — agents auto-discover payment methods and pricing.
// Returns an OpenAPI-compatible document advertising our MPP and x402 support.
app.get("/openapi.json", cors(), (c) => {
  return c.json({
    openapi: "3.1.0",
    info: {
      title: "ArcRouter API",
      description: "Intelligent LLM routing. Route any prompt to the best model. Supports API key, x402 (Base USDC), and MPP (Tempo) payments.",
      version: "1.0.0",
    },
    servers: [{ url: "https://api.arcrouter.com", description: "Production" }],
    paths: {
      "/v1/chat/completions": {
        post: {
          summary: "Route a prompt to the best AI model",
          description: "OpenAI-compatible endpoint. Free tier available with budget=free. Paid tier via API key, x402, or MPP.",
          "x-payment": {
            methods: [
              {
                method: "tempo",
                intent: "charge",
                pricing: { default: PRICE_BY_TIER, council: PRICE_BY_TIER_COUNCIL },
                chain: "tempo-mainnet",
                header: "Authorization: Payment <credential>",
              },
              {
                method: "x402",
                pricing: { default: PRICE_BY_TIER, council: PRICE_BY_TIER_COUNCIL },
                chain: "base-mainnet",
                header: "X-PAYMENT <credential>",
              },
            ],
            free_tier: "Set budget=free in request body for free models (rate-limited)",
          },
        },
      },
    },
  }, 200, { "Cache-Control": "public, max-age=300" });
});

// Public: Get all models with their benchmark scores (no auth required)
app.get("/v1/models/scores", async (c) => {
  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { getAllModelsWithScores } = await import("./db/queries");
    const data = await getAllModelsWithScores(c.env.SCORE_DB);

    return c.json(data);
  } catch (err) {
    console.error('[Public API] Failed to fetch model scores:', err);
    return c.json({
      error: "Failed to fetch model scores",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Usage stats for authenticated API key
app.get("/v1/usage", async (c) => {
  const authTier = c.get("authTier" as never) as string | undefined;
  const keyHash = c.get("keyHash" as never) as string | undefined;

  if (!authTier || authTier === "free") {
    return c.json({ error: "API key required for usage stats" }, 401);
  }
  if (!keyHash) {
    return c.json({ error: "Could not identify API key" }, 400);
  }

  const daysParam = parseInt(c.req.query("days") || "30");
  const days = Math.min(Math.max(daysParam, 1), 90);

  const dailyStats: Array<{ date: string; requests: number; cost_usd: number }> = [];
  const today = new Date();

  const keys = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });

  // Parallel KV reads for all days
  const results = await Promise.all(
    keys.map(date =>
      c.env.CONSENSUS_CACHE.get(`usage:${keyHash}:${date}`, { type: "json" })
        .then(data => ({ date, ...(data as { requests: number; cost_usd: number } | null ?? { requests: 0, cost_usd: 0 }) }))
        .catch(() => ({ date, requests: 0, cost_usd: 0 }))
    )
  );

  // Sort ascending by date
  results.sort((a, b) => a.date.localeCompare(b.date));
  dailyStats.push(...results);

  const totalRequests = dailyStats.reduce((s, d) => s + d.requests, 0);
  const totalCostUsd = parseFloat(dailyStats.reduce((s, d) => s + d.cost_usd, 0).toFixed(6));

  return c.json({
    tier: authTier,
    period: { days, from: keys[keys.length - 1], to: keys[0] },
    total_requests: totalRequests,
    total_cost_usd: totalCostUsd,
    daily: dailyStats,
  });
});

// Workflow: Get usage stats for a session (no auth required — session_id is the secret)
app.get("/v1/workflow/:session_id/usage", async (c) => {
  const sessionId = c.req.param("session_id");

  if (!sessionId || sessionId.length < 4) {
    return c.json({ error: "Invalid session_id" }, 400);
  }

  if (!c.env.CONSENSUS_CACHE) {
    return c.json({ error: "Cache not available" }, 503);
  }

  const tracker = new WorkflowTracker(c.env.CONSENSUS_CACHE);
  const usage = await tracker.getUsage(sessionId);

  if (!usage) {
    return c.json({ error: "Session not found or expired", session_id: sessionId }, 404);
  }

  return c.json(usage);
});

// Admin: Create API key (requires admin auth + rate limit)
app.post("/admin/create-key", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");

  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }

  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Rate limit: 10 requests/hour per IP
  const clientIP = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  const adminRateLimitKey = `admin:ratelimit:${clientIP}`;
  const adminCount = parseInt((await c.env.CONSENSUS_CACHE.get(adminRateLimitKey)) || "0");

  if (adminCount >= 10) {
    return c.json({ error: "Admin rate limit exceeded. Max 10 requests/hour." }, 429);
  }
  try {
    await c.env.CONSENSUS_CACHE.put(adminRateLimitKey, String(adminCount + 1), { expirationTtl: 3600 });
  } catch (err) {
    console.error("[Admin] Rate limit counter write failed (non-critical):", err instanceof Error ? err.message : err);
  }

  // Validate request body with Zod
  const bodySchema = z.object({
    userId: z.string().min(1).max(128),
    tier: z.enum(["paid", "playground"]),
    stripeSubscriptionId: z.string().optional(),
  });

  let body: z.infer<typeof bodySchema>;
  try {
    const raw = await c.req.json();
    body = bodySchema.parse(raw);
  } catch {
    return c.json({ error: "Invalid request body. Required: userId (string), tier (paid|playground)." }, 400);
  }

  const apiKey = `sk_${crypto.randomUUID().replace(/-/g, "")}`;
  const keyHash = await hashApiKey(apiKey);

  await c.env.CONSENSUS_CACHE.put(
    `apikey:${keyHash}`,
    JSON.stringify({ userId: body.userId, tier: body.tier, stripeSubscriptionId: body.stripeSubscriptionId }),
    { expirationTtl: 31536000 } // 1 year
  );

  return c.json({ apiKey, userId: body.userId, tier: body.tier });
});

// Admin: Generate embedding (for pre-computing model embeddings)
app.post("/admin/generate-embedding", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { text } = await c.req.json();
    if (!text || typeof text !== 'string') {
      return c.json({ error: "Missing or invalid 'text' parameter" }, 400);
    }

    // Generate embedding using Workers AI
    // @ts-ignore - Workers AI type not available yet
    const response = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [text],
    });

    // @ts-ignore
    if (!response?.data || !response.data[0]) {
      return c.json({ error: "Invalid embedding response from Workers AI" }, 500);
    }

    // @ts-ignore
    const embedding = response.data[0];

    return c.json({
      embedding: Array.from(embedding), // Convert to regular array for JSON
      dimensions: embedding.length,
      model: '@cf/baai/bge-base-en-v1.5',
    });

  } catch (err) {
    console.error('[Admin] Embedding generation failed:', err);
    return c.json({
      error: "Embedding generation failed",
      details: err instanceof Error ? err.message : String(err)
    }, 500);
  }
});

// Admin: Monitoring stats (requires admin auth)
app.get("/admin/stats", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const date = c.req.query("date") || getUtcDayKey();
  const metricsPrefix = `metrics:${date}`;

  const [
    requestsTotal,
    errorsTotal,
    confidenceSum,
    confidenceCount,
    latencyConsensusSum,
    latencyConsensusCount,
    latencyTotalSum,
    latencyTotalCount,
    estimatedCostTotal,
    estimatedModelCost,
    estimatedEmbeddingCost,
    estimatedChairmanCost,
    chargedTotal,
    marginAlertCount,
    chairmanPathCount,
    embeddingPathCount,
    streamRequests,
    freeRequests,
    playgroundRequests,
    x402Requests,
    paidRequests,
    cacheHitCount,
    cacheMissCount,
    defaultModeRequests,
    councilModeRequests,
  ] = await Promise.all([
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_total`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:errors_total`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:confidence_sum`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:confidence_count`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_consensus_sum_ms`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_consensus_count`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_sum_ms`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_count`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cost_estimated_total_usd`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cost_estimated_model_usd`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cost_estimated_embedding_usd`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cost_estimated_chairman_usd`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:charged_total_usd`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:margin_alert_count`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:chairman_path_count`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:embedding_path_count`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:stream_requests`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_tier:free`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_tier:playground`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_tier:x402`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_tier:paid`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cache_hit`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cache_miss`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_mode:default`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_mode:council`),
  ]);

  const avgConfidence = confidenceCount > 0 ? confidenceSum / confidenceCount : 0;
  const avgConsensusLatencyMs = latencyConsensusCount > 0 ? latencyConsensusSum / latencyConsensusCount : 0;
  const avgTotalLatencyMs = latencyTotalCount > 0 ? latencyTotalSum / latencyTotalCount : 0;
  const estimatedMarginUsd = chargedTotal - estimatedCostTotal;

  return c.json({
    date,
    summary: {
      requests_total: requestsTotal,
      errors_total: errorsTotal,
      error_rate: requestsTotal > 0 ? errorsTotal / requestsTotal : 0,
      avg_confidence: avgConfidence,
      avg_consensus_latency_ms: avgConsensusLatencyMs,
      avg_total_latency_ms: avgTotalLatencyMs,
    },
    traffic: {
      stream_requests: streamRequests,
      cache: {
        hit: cacheHitCount,
        miss: cacheMissCount,
        hit_rate: (cacheHitCount + cacheMissCount) > 0 ? cacheHitCount / (cacheHitCount + cacheMissCount) : 0,
      },
      by_tier: {
        free: freeRequests,
        playground: playgroundRequests,
        x402: x402Requests,
        paid: paidRequests,
      },
      by_mode: {
        default: defaultModeRequests,
        council: councilModeRequests,
      },
    },
    cost: {
      estimated_total_usd: estimatedCostTotal,
      estimated_model_usd: estimatedModelCost,
      estimated_embedding_usd: estimatedEmbeddingCost,
      estimated_chairman_usd: estimatedChairmanCost,
      charged_total_usd: chargedTotal,
      estimated_margin_usd: estimatedMarginUsd,
      margin_alert_count: marginAlertCount,
      chairman_path_count: chairmanPathCount,
      embedding_path_count: embeddingPathCount,
    },
  });
});

// Admin: Sync pricing from OpenRouter (requires admin auth)
app.post("/admin/sync-pricing", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { scrapeOpenRouterPricing } = await import("./db/scrapers/openrouter-pricing");
    const result = await scrapeOpenRouterPricing(c.env.SCORE_DB, c.env.OPENROUTER_API_KEY);

    return c.json({
      success: true,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (err) {
    return c.json({
      error: "Pricing sync failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Sync HuggingFace benchmark scores (requires admin auth)
app.post("/admin/sync-huggingface", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { scrapeHuggingFace } = await import("./db/scrapers/huggingface");
    const result = await scrapeHuggingFace(c.env.SCORE_DB);

    return c.json({
      success: true,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (err) {
    return c.json({
      error: "HuggingFace sync failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Sync LiveBench scores (requires admin auth)
app.post("/admin/sync-livebench", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { scrapeLiveBench } = await import("./db/scrapers/livebench");
    const result = await scrapeLiveBench(c.env.SCORE_DB);

    return c.json({
      success: true,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (err) {
    return c.json({
      error: "LiveBench sync failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Sync LiveCodeBench coding scores (requires admin auth)
app.post("/admin/sync-livecodebench", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { scrapeLiveCodeBench } = await import("./db/scrapers/livecodebench");
    const result = await scrapeLiveCodeBench(c.env.SCORE_DB);

    return c.json({
      success: true,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (err) {
    return c.json({
      error: "LiveCodeBench sync failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Recalculate composite scores (requires admin auth)
app.post("/admin/recalculate-scores", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { recalculateScores } = await import("./db/score-calculator");
    await recalculateScores(c.env.SCORE_DB);

    return c.json({
      success: true,
      message: "Composite scores recalculated",
    });
  } catch (err) {
    return c.json({
      error: "Score recalculation failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Invalidate route cache (requires admin auth)
app.post("/admin/invalidate-cache", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const { RouteCache } = await import("./router/route-cache");
    const routeCache = new RouteCache(c.env.CONSENSUS_CACHE);
    await routeCache.invalidateAll();

    return c.json({
      success: true,
      message: "Route cache invalidated",
    });
  } catch (err) {
    return c.json({
      error: "Cache invalidation failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Sync all benchmarks (orchestrator) - runs all scrapers + synthetic + recalculation
app.post("/admin/sync-all-benchmarks", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { syncAllBenchmarks } = await import("./db/scrapers/orchestrator");
    const result = await syncAllBenchmarks(c.env.SCORE_DB);

    return c.json({
      success: result.success,
      duration_ms: result.duration_ms,
      total_scores_updated: result.total_scores_updated,
      composite_scores_calculated: result.composite_scores_calculated,
      scrapers: result.scrapers,
      synthetic: result.synthetic,
      errors: result.errors,
    });
  } catch (err) {
    return c.json({
      error: "Benchmark synchronization failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Sync Chatbot Arena (requires admin auth)
app.post("/admin/sync-chatbot-arena", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { scrapeChatbotArena } = await import("./db/scrapers/chatbot-arena");
    const result = await scrapeChatbotArena(c.env.SCORE_DB);

    return c.json({
      success: result.updated > 0,
      updated: result.updated,
      models_matched: result.models_matched,
      models_skipped: result.models_skipped,
      errors: result.errors,
    });
  } catch (err) {
    return c.json({
      error: "Chatbot Arena sync failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Sync BigCodeBench (requires admin auth)
app.post("/admin/sync-bigcodebench", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { scrapeBigCodeBench } = await import("./db/scrapers/bigcodebench");
    const result = await scrapeBigCodeBench(c.env.SCORE_DB);

    return c.json({
      success: result.updated > 0,
      updated: result.updated,
      models_matched: result.models_matched,
      models_skipped: result.models_skipped,
      errors: result.errors,
    });
  } catch (err) {
    return c.json({
      error: "BigCodeBench sync failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Sync AlpacaEval (requires admin auth)
app.post("/admin/sync-alpaca-eval", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { scrapeAlpacaEval } = await import("./db/scrapers/alpaca-eval");
    const result = await scrapeAlpacaEval(c.env.SCORE_DB);

    return c.json({
      success: result.updated > 0,
      updated: result.updated,
      models_matched: result.models_matched,
      models_skipped: result.models_skipped,
      errors: result.errors,
    });
  } catch (err) {
    return c.json({
      error: "AlpacaEval sync failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Generate synthetic scores (requires admin auth)
app.post("/admin/generate-synthetic-scores", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { generateSyntheticScores } = await import("./db/scrapers/synthetic-scores");
    const result = await generateSyntheticScores(c.env.SCORE_DB);

    return c.json({
      success: result.updated > 0,
      updated: result.updated,
      models_matched: result.models_matched,
      errors: result.errors,
    });
  } catch (err) {
    return c.json({
      error: "Synthetic score generation failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Admin: Get benchmark coverage stats (requires admin auth)
app.get("/admin/coverage-stats", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { getCoverageStats } = await import("./db/scrapers/orchestrator");
    const stats = await getCoverageStats(c.env.SCORE_DB);

    return c.json(stats);
  } catch (err) {
    return c.json({
      error: "Failed to get coverage stats",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// Stripe: Create checkout session
app.post("/api/stripe/create-checkout", async (c) => {
  const { createCheckoutSession } = await import("./payments/stripe");
  return await createCheckoutSession(c);
});

// Stripe: Create customer portal session
app.post("/api/stripe/portal", async (c) => {
  const { createPortalSession } = await import("./payments/stripe");
  return await createPortalSession(c);
});

// Stripe: Webhook handler
app.post("/api/stripe/webhook", async (c) => {
  const { handleWebhook } = await import("./payments/stripe");
  return await handleWebhook(c);
});

// Stripe: Retrieve API key after checkout (rate-limited)
app.get("/v1/stripe/api-key", async (c) => {
  // Rate limiting: 5 requests per minute per IP
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  const rateLimitKey = `ratelimit:apikey:${ip}`;

  const currentCount = await c.env.CONSENSUS_CACHE.get(rateLimitKey);
  const count = currentCount ? parseInt(currentCount, 10) : 0;

  if (count >= 5) {
    return c.json({
      error: "Rate limit exceeded. Please wait a minute before trying again."
    }, 429);
  }

  await c.env.CONSENSUS_CACHE.put(
    rateLimitKey,
    String(count + 1),
    { expirationTtl: 60 }
  );

  const sessionId = c.req.query("session_id");
  const email = c.req.query("email");
  const authHeader = c.req.header("Authorization");
  const headerApiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const apiKey = c.req.query("api_key") || headerApiKey;

  if (!sessionId && !email) {
    return c.json({
      error: "Either session_id or email parameter is required"
    }, 400);
  }

  try {
    // Path 1: Retrieve by session_id (secure, time-limited)
    if (sessionId) {
      // Check if session mapping exists (stored by webhook with 24h TTL)
      const sessionData = await c.env.CONSENSUS_CACHE.get(`stripe_session:${sessionId}`);

      if (!sessionData) {
        return c.json({
          error: "Session not found or expired. API keys are only retrievable for 24 hours after checkout."
        }, 404);
      }

      const { apiKey, email: customerEmail, customerId } = JSON.parse(sessionData);

      // Enforce one-time retrieval: delete session mapping after first successful fetch.
      try {
        await c.env.CONSENSUS_CACHE.delete(`stripe_session:${sessionId}`);
      } catch (err) {
        console.error("[Stripe] Failed to delete session mapping (non-fatal):", err);
      }

      return c.json({
        apiKey,
        email: customerEmail,
        customerId,
        message: "Save this API key securely. It will not be shown again."
      });
    }

    // Path 2: Retrieve by email (requires API key for ownership verification)
    if (email) {
      if (!apiKey) {
        return c.json({
          error: "API key is required to verify ownership for email lookup."
        }, 401);
      }

      const providedHash = await hashApiKey(apiKey);
      const apiKeyHash = await c.env.CONSENSUS_CACHE.get(`email:${email}`);

      if (!apiKeyHash || apiKeyHash !== providedHash) {
        return c.json({
          error: "Unable to verify ownership for this email address."
        }, 403);
      }

      const keyData = await c.env.CONSENSUS_CACHE.get(`apikey:${apiKeyHash}`);

      if (!keyData) {
        return c.json({
          error: "Unable to verify ownership for this email address."
        }, 403);
      }

      const data = JSON.parse(keyData);

      // Return subscription status but NOT the raw API key (security)
      return c.json({
        email: data.email,
        tier: data.tier,
        status: data.status,
        customerId: data.customerId,
        created: data.created,
        message: "Your API key was sent to your email during checkout. If you lost it, please contact support."
      });
    }

    return c.json({ error: "Invalid request" }, 400);

  } catch (err) {
    console.error("[Stripe] API key retrieval error:", err);
    return c.json({
      error: "Failed to retrieve API key",
      details: err instanceof Error ? err.message : "Unknown error"
    }, 500);
  }
});

// Admin: Database health check (requires admin auth)
app.get("/admin/db-health", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "Admin endpoint disabled" }, 503);
  }
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!c.env.SCORE_DB) {
    return c.json({ error: "Database not configured" }, 503);
  }

  try {
    const { checkDatabaseHealth } = await import("./db/queries");
    const health = await checkDatabaseHealth(c.env.SCORE_DB);

    return c.json({
      success: true,
      database: health,
    });
  } catch (err) {
    return c.json({
      error: "Health check failed",
      message: err instanceof Error ? err.message : String(err),
    }, 500);
  }
});

// MCP Server — Exposes ArcRouter as an MCP tool for Claude Code, Cursor, Windsurf
// Install: claude mcp add arcrouter --transport http https://api.arcrouter.com/mcp
app.all("/mcp", async (c) => {
  return handleMCPRequest(c.req.raw, c.env);
});

// Export with scheduled handler for cron trigger.
// Each phase is independently wrapped so a failure in one (e.g. a timed-out
// scraper) does NOT prevent later phases (most importantly: composite-score
// recalc) from running. Prevents the "rankings page stale for weeks because
// one scraper threw" failure mode we hit in May 2026.
export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: CloudflareBindings, ctx: ExecutionContext) => {
    console.log('[Cron] Starting daily pipeline');

    // Phase A — pricing scrape (slow, network-bound, may fail)
    try {
      const { scrapeOpenRouterPricing } = await import('./db/scrapers/openrouter-pricing');
      await scrapeOpenRouterPricing(env.SCORE_DB, env.OPENROUTER_API_KEY);
      console.log('[Cron] Phase A: pricing sync OK');
    } catch (err) {
      console.error('[Cron] Phase A: pricing sync FAILED:', err instanceof Error ? err.message : String(err));
    }

    // Phase B — benchmark scrapers + synthetic scores + internal recalc
    try {
      const { syncAllBenchmarks } = await import('./db/scrapers/orchestrator');
      const result = await syncAllBenchmarks(env.SCORE_DB);
      console.log(
        `[Cron] Phase B: scrapers OK — ${result.total_scores_updated} scores, ` +
        `${result.composite_scores_calculated} composite. Errors: ${result.errors.length}`
      );
    } catch (err) {
      console.error('[Cron] Phase B: scrapers FAILED:', err instanceof Error ? err.message : String(err));
    }

    // Phase C — UNCONDITIONAL composite-score recalc.
    // This runs even if Phase A/B failed, so the rankings page is never more
    // than 24h stale on the calculation side (benchmark data may be stale,
    // but the score blend always reflects current models + pricing in D1).
    try {
      const { recalculateScores } = await import('./db/score-calculator');
      await recalculateScores(env.SCORE_DB);
      console.log('[Cron] Phase C: composite-score recalc OK');
    } catch (err) {
      console.error('[Cron] Phase C: recalc FAILED:', err instanceof Error ? err.message : String(err));
    }

    // Phase D — telemetry flush + route-cache invalidation (best-effort)
    try {
      const { RoutingTelemetry } = await import('./router/telemetry');
      const telemetry = new RoutingTelemetry(env.CONSENSUS_CACHE);
      await telemetry.flushToD1(env.SCORE_DB);

      const { RouteCache } = await import('./router/route-cache');
      const routeCache = new RouteCache(env.CONSENSUS_CACHE);
      await routeCache.invalidateAll();
      console.log('[Cron] Phase D: telemetry + cache invalidation OK');
    } catch (err) {
      console.error('[Cron] Phase D: telemetry/cache FAILED:', err instanceof Error ? err.message : String(err));
    }

    console.log('[Cron] Pipeline finished');
  }
};
