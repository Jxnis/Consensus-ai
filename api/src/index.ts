import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { paymentMiddleware } from "@x402/hono";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { z } from "zod";
import { scorePrompt } from "./router/scorer";
import { CouncilEngine } from "./council/engine";
import { ConsensusRequest, CloudflareBindings } from "./types";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", logger());
app.use("/v1/*", cors());

// Startup env validation — fail fast on bad deployment
app.use("*", async (c, next) => {
  if (!c.env.OPENROUTER_API_KEY) {
    console.error("[CouncilRouter] FATAL: OPENROUTER_API_KEY is not set. Requests will fail.");
  }
  if (!c.env.ADMIN_TOKEN) {
    console.error("[CouncilRouter] WARNING: ADMIN_TOKEN is not set. Admin endpoint is disabled.");
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

function getChargedPriceUsd(authTier: string, budget: string, complexityTier: string): number {
  if (authTier === "paid") return 0.002;

  // x402 path: variable pricing based on complexity (TASK-59)
  if (authTier === "free" && budget !== "free") {
    const priceByTier: Record<string, number> = {
      SIMPLE: 0.001,
      MEDIUM: 0.002,
      COMPLEX: 0.005,
    };
    return priceByTier[complexityTier] || 0.002;
  }

  return 0;
}

// API Key Authentication Middleware (runs before x402)
app.use("/v1/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = authHeader?.replace("Bearer ", "");

  if (apiKey) {
    const keyHash = await hashApiKey(apiKey);
    let keyData = await c.env.CONSENSUS_CACHE.get(`apikey:${keyHash}`, { type: "json" }) as {
      userId: string;
      tier: "paid" | "playground";
      stripeSubscriptionId?: string;
    } | null;

    // Backward-compatible lookup for previously stored plaintext keys (migration path).
    if (!keyData) {
      const legacyKeyData = await c.env.CONSENSUS_CACHE.get(`apikey:${apiKey}`, { type: "json" }) as {
        userId: string;
        tier: "paid" | "playground";
        stripeSubscriptionId?: string;
      } | null;

      if (legacyKeyData) {
        await c.env.CONSENSUS_CACHE.put(`apikey:${keyHash}`, JSON.stringify(legacyKeyData), { expirationTtl: 31536000 });
        await c.env.CONSENSUS_CACHE.delete(`apikey:${apiKey}`);
        keyData = legacyKeyData;
      }
    }

    if (keyData) {
      c.set("authTier" as never, keyData.tier as never);
      c.set("userId" as never, keyData.userId as never);
      c.set("stripeSubscriptionId" as never, keyData.stripeSubscriptionId as never);
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
    const userId = (c.get("userId" as never) as string) || clientIP;

    const limits: Record<string, number> = {
      free: 20,
      playground: 50,
      paid: 1000,
    };

    const limit = limits[authTier] || 20;
    const key = `ratelimit:${authTier}:${userId}`;

    const current = await c.env.CONSENSUS_CACHE.get(key);
    const count = current ? parseInt(current) : 0;

    if (count >= limit) {
      return c.json({
        error: "Rate limit exceeded",
        limit,
        tier: authTier,
        message: `Max ${limit} requests per hour for ${authTier} tier.`
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

  // Already authenticated via API key → bypass x402
  if (authTier === "paid" || authTier === "playground") {
    return await next();
  }

  // Parse body once, extract prompt, score complexity
  let budget = "";
  let complexityTier: "SIMPLE" | "MEDIUM" | "COMPLEX" = "MEDIUM"; // default

  try {
    const rawBody = await c.req.raw.clone().text();

    if (rawBody.length > 51200) { // 50KB limit
      return c.json({ error: "Request body too large. Maximum 50KB." }, 413);
    }

    const body = JSON.parse(rawBody);
    budget = String(body.budget ?? "").toLowerCase();

    // Extract prompt and score complexity for dynamic pricing
    const messages = body.messages as Array<{role: string; content: string}> | undefined;
    const prompt = messages?.[messages.length - 1]?.content || "";

    if (prompt && typeof prompt === "string") {
      const complexity = scorePrompt(prompt);
      complexityTier = complexity.tier;
    }

    // Store parsed body and complexity in context to avoid re-parsing/re-scoring
    c.set("parsedBody" as never, body as never);
    c.set("complexityTier" as never, complexityTier as never);
  } catch {
    // JSON parse error or empty body — treat as free tier
    budget = "free";
  }

  // Unauthenticated users with no explicit budget get free tier
  if (budget === "free" || budget === "") {
    return await next();
  }

  // Dynamic x402 pricing based on complexity tier (TASK-59)
  const X402_PRICE_BY_TIER: Record<string, string> = {
    SIMPLE: "$0.001",   // Free models only (~1-2 models, simple factual queries)
    MEDIUM: "$0.002",   // Cheap paid models (3-4 models, moderate reasoning)
    COMPLEX: "$0.005",  // Premium models (4-5 models including GPT-4o/Gemini Pro)
  };

  const x402Price = X402_PRICE_BY_TIER[complexityTier];

  console.log(`[Auth] Unauthenticated request with budget="${budget}". Enforcing x402. Complexity: ${complexityTier}, Price: ${x402Price}`);

  if (!c.env.X402_WALLET_ADDRESS) {
    return c.json({
      error: "Payment required",
      message: "x402 payment is not configured on this server. Use budget='free' or authenticate with an API key.",
    }, 402);
  }

  try {
    const dynamicHandler = paymentMiddleware(
      {
        "POST /v1/chat/completions": {
          accepts: [
            {
              scheme: "exact",
              price: x402Price, // Dynamic price based on prompt complexity
              network: "eip155:8453", // Base Mainnet
              payTo: c.env.X402_WALLET_ADDRESS,
            },
          ],
          description: `CouncilRouter — ${complexityTier} query consensus verification`,
          mimeType: "application/json",
        },
      },
      x402Server
    );

    return await dynamicHandler(c, next);
  } catch (error: unknown) {
    // x402 facilitator error — return manual 402 with dynamic price
    console.error("[x402] Middleware error:", error instanceof Error ? error.message : String(error));
    return c.json({
      error: "Payment required",
      x402: {
        version: 2,
        accepts: [{
          scheme: "exact",
          price: x402Price, // Return dynamic price in error response
          network: "eip155:8453",
          payTo: c.env.X402_WALLET_ADDRESS,
        }],
        description: `CouncilRouter — ${complexityTier} query. Price varies by complexity: SIMPLE ($0.001), MEDIUM ($0.002), COMPLEX ($0.005). Use budget='free' for free tier.`,
      },
    }, 402);
  }
});

// Main Endpoint: Run consensus logic
app.post("/v1/chat/completions", async (c) => {
  const requestStartedAt = Date.now();
  const requestId = `cons-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  // Use pre-parsed body if available (avoids double-parse)
  const body = (c.get("parsedBody" as never) as Record<string, unknown>) || await c.req.json();
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

  if (!c.env.OPENROUTER_API_KEY) {
    return c.json({ error: "Service temporarily unavailable", request_id: requestId }, 503);
  }

  const authTier = (c.get("authTier" as never) as string) || "free";
  let budget = String((body.budget as string) || "").toLowerCase() || "low";

  // Free and playground tiers always use free models
  if (authTier === "free" || authTier === "playground") {
    budget = "free";
  }

  // Use pre-scored complexity from middleware if available (avoids redundant scoring)
  const preScored = c.get("complexityTier" as never) as "SIMPLE" | "MEDIUM" | "COMPLEX" | undefined;
  const complexity = preScored ? { tier: preScored } : scorePrompt(sanitizedPrompt);
  const engine = new CouncilEngine(c.env);

  const request: ConsensusRequest = {
    prompt: sanitizedPrompt,
    budget: ["free", "low", "medium", "high"].includes(budget) ? (budget as ConsensusRequest["budget"]) : "low",
    reliability: (body.reliability === "high" ? "high" : "standard")
  };

  const wantsStream = body.stream === true;
  const dayKey = getUtcDayKey();
  const metricsPrefix = `metrics:${dayKey}`;

  // 52a: daily counters by requests + tier
  try {
    await Promise.all([
      incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_total`),
      incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_tier:${authTier}`),
      wantsStream
        ? incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:stream_requests`)
        : Promise.resolve(),
    ]);
  } catch (kvErr) {
    console.error('[Metrics] KV write failed (non-critical):', kvErr instanceof Error ? kvErr.message : String(kvErr));
  }

  try {
    const consensusStartedAt = Date.now();
    console.log(`[Monitoring] runConsensus:start request_id=${requestId} tier=${authTier} budget=${budget} stream=${wantsStream}`);
    const result = await engine.runConsensus(request, complexity.tier);
    const consensusLatencyMs = Date.now() - consensusStartedAt;
    const totalLatencyMs = Date.now() - requestStartedAt;
    console.log(`[Monitoring] runConsensus:done request_id=${requestId} latency_ms=${consensusLatencyMs} total_ms=${totalLatencyMs}`);

    const estimatedTotalCostUsd = result.monitoring?.estimatedTotalCostUsd ?? 0;
    const chargedPriceUsd = getChargedPriceUsd(authTier, budget, complexity.tier);
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

    // Track Stripe usage for paid tier
    const stripeSubscriptionId = c.get("stripeSubscriptionId" as never) as string | undefined;
    if (authTier === "paid" && stripeSubscriptionId) {
      const usageKey = `stripe:usage:${stripeSubscriptionId}:${new Date().toISOString().slice(0, 10)}`;
      const currentUsage = await c.env.CONSENSUS_CACHE.get(usageKey);
      const newUsage = (parseInt(currentUsage || "0") + 1).toString();
      await c.env.CONSENSUS_CACHE.put(usageKey, newUsage, { expirationTtl: 86400 * 7 });
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
        budget,
        synthesized: result.synthesized ?? false,
        cached: result.cached,
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
        budget,
        synthesized: result.synthesized ?? false,
        cached: result.cached,
        monitoring: result.monitoring,
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
    console.error(`[CouncilRouter] Consensus error request_id=${requestId}:`, error instanceof Error ? error.message : String(error));

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
  const checks: Record<string, string> = {
    status: "ok",
    openrouter_key: c.env.OPENROUTER_API_KEY ? "configured" : "MISSING",
    admin_token: c.env.ADMIN_TOKEN ? "configured" : "MISSING",
    x402_wallet: c.env.X402_WALLET_ADDRESS ? "configured" : "MISSING",
  };

  const healthy = checks.openrouter_key === "configured";
  return c.json({ ...checks, healthy }, healthy ? 200 : 503);
});

// Root info endpoint
app.get("/", (c) => {
  return c.json({
    name: "CouncilRouter API",
    status: "operational",
    version: "1.0.0",
    docs: "https://councilrouter.ai/docs",
    tiers: {
      free: "No auth required. Free models only, 20 req/hour.",
      paid: "API key required. All budget tiers, Stripe metered billing, $0.002 per request.",
      x402: "USDC payment on Base Mainnet. Variable pricing: $0.001 (simple), $0.002 (medium), $0.005 (complex)."
    }
  });
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
  await c.env.CONSENSUS_CACHE.put(adminRateLimitKey, String(adminCount + 1), { expirationTtl: 3600 });

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
    paidRequests,
    cacheHitCount,
    cacheMissCount,
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
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:requests_tier:paid`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cache_hit`),
    getMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:cache_miss`),
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
        paid: paidRequests,
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

export default app;
