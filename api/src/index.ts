import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { paymentMiddleware } from "@x402/hono";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { z } from "zod";
import { scorePrompt, detectTopicDetailed } from "./router/scorer";
import { selectBestModel } from "./router/model-registry";
import { normalizeRoutingBudget as _normalizeRoutingBudget, routingBudgetToCouncilBudget, type RoutingBudget } from "./router/budget";
import { CouncilEngine } from "./council/engine";
import { ConsensusRequest, CloudflareBindings } from "./types";
import OpenAI from "openai";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", logger());
app.use("/v1/*", cors());

// Startup env validation — fail fast on bad deployment
app.use("*", async (c, next) => {
  if (!c.env.OPENROUTER_API_KEY) {
    console.error("[ArcRouter] FATAL: OPENROUTER_API_KEY is not set. Requests will fail.");
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
  // Paid/x402 default to "auto" if no budget specified
  const defaultBudget = (authTier === "paid" || authTier === "x402") ? "auto" : "free";
  return _normalizeRoutingBudget(rawBudget || defaultBudget);
}

function getChargedPriceUsd(authTier: string, budget: string, complexityTier: string): number {
  if (authTier === "paid") return 0.002;

  // x402 path: variable pricing based on complexity (TASK-59)
  if (authTier === "x402" || (authTier === "free" && budget !== "free")) {
    const priceByTier: Record<string, number> = {
      SIMPLE: 0.001,
      MEDIUM: 0.002,
      COMPLEX: 0.005,
      REASONING: 0.008,
    };
    return priceByTier[complexityTier] || 0.002;
  }

  return 0;
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
  const apiKey = authHeader?.replace("Bearer ", "");

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
    const hasX402Header = Boolean(c.req.header("payment-signature") || c.req.header("x-payment"));
    const effectiveTier = authTier === "free" && hasX402Header ? "x402" : authTier;
    const userId = (c.get("userId" as never) as string) || clientIP;

    const limits: Record<string, number> = {
      free: 20,
      playground: 50,
      x402: 1000,
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

    if (lastMessage) {
      complexityTier = scorePrompt(lastMessage).tier;
    }

    // Never downgrade complexity for large total-context requests.
    if (totalTokenEstimate > 4000) {
      complexityTier = "COMPLEX";
    } else if (totalTokenEstimate > 1000) {
      complexityTier = maxComplexityTier(complexityTier, "MEDIUM");
    }

    c.set("parsedBody" as never, body as never);
    c.set("complexityTier" as never, complexityTier as never);
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Already authenticated via API key → bypass x402
  if (isAuthenticated) {
    return await next();
  }

  // Body parsing and complexity scoring completed above.
  // Smart routing logic is now in the main endpoint handler (mode=default path).

  // Unauthenticated users with no explicit budget get free tier
  if (budget === "free" || budget === "") {
    return await next();
  }

  // Dynamic x402 pricing based on complexity tier (TASK-59)
  const X402_PRICE_BY_TIER: Record<string, string> = {
    SIMPLE: "$0.001",   // Free models only (~1-2 models, simple factual queries)
    MEDIUM: "$0.002",   // Cheap paid models (3-4 models, moderate reasoning)
    COMPLEX: "$0.005",  // Premium models (4-5 models including GPT-4o/Gemini Pro)
    REASONING: "$0.005",
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
          description: `ArcRouter — ${complexityTier} query consensus verification`,
          mimeType: "application/json",
        },
      },
      x402Server
    );

    // Wrap next() so authTier is set to "x402" only when payment succeeds
    // (paymentMiddleware calls next() on success, returns 402 on failure)
    const wrappedNext = async () => {
      c.set("authTier" as never, "x402" as never);
      return await next();
    };

    return await dynamicHandler(c, wrappedNext);
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
        description: `ArcRouter — ${complexityTier} query. Price varies by complexity: SIMPLE ($0.001), MEDIUM ($0.002), COMPLEX ($0.005). Use budget='free' for free tier.`,
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
  const rawBudget = typeof body.budget === "string" ? body.budget : undefined;
  const routingBudget = normalizeRoutingBudget(rawBudget, authTier);
  const councilBudget = routingBudgetToCouncilBudget(routingBudget);

  // Use pre-scored complexity from middleware if available (avoids redundant scoring)
  const preScored = c.get("complexityTier" as never) as "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING" | undefined;
  const complexity = preScored ? { tier: preScored } : scorePrompt(sanitizedPrompt);
  const engine = new CouncilEngine(c.env);

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
    // Detect topic with detailed detection
    const topicDetection = detectTopicDetailed(sanitizedPrompt);
    const topic = topicDetection.secondary || topicDetection.primary;

    console.log(`[Smart Router] Topic detected: ${topic} (confidence: ${topicDetection.confidence.toFixed(2)})`);

    // Initialize circuit breaker, telemetry, and route cache
    const { ModelCircuitBreaker } = await import('./router/circuit-breaker');
    const { RoutingTelemetry } = await import('./router/telemetry');
    const { RouteCache } = await import('./router/route-cache');
    const circuitBreaker = new ModelCircuitBreaker(c.env.CONSENSUS_CACHE);
    const telemetry = new RoutingTelemetry(c.env.CONSENSUS_CACHE);
    const routeCache = new RouteCache(c.env.CONSENSUS_CACHE);

    // Get top 3 models from D1 for failover chain
    // First check cache to skip D1 query (unless bypass requested)
    const bypassCache = body.bypass_cache === true;
    let candidateModels: Array<{ id: string; name: string; provider: string; input_price: number; output_price: number }> = [];
    let dataSource = 'fallback_registry';

    try {
      if (c.env.SCORE_DB) {
        // Check cache first (saves ~4ms D1 query)
        const cacheVersion = bypassCache ? null : await routeCache.getCacheVersion();
        const cachedModelId = bypassCache ? null : await routeCache.getCachedRouteWithVersion(topic, routingBudget, cacheVersion);

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
            const backupModels = await getModelsForDomain(c.env.SCORE_DB, topic, routingBudget, complexity.tier);
            if (backupModels && backupModels.length > 1) {
              // Add top 2 backups (excluding cached model if it appears)
              const backups = backupModels.filter(m => m.id !== cachedModelId).slice(0, 2);
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
          const semanticRoutingEnabled = c.env.SEMANTIC_ROUTING_ENABLED === 'true';
          let semanticResult = null;

          if (semanticRoutingEnabled && c.env.AI && c.env.SCORE_DB) {
            try {
              const { SemanticRouter } = await import('./router/semantic-router');
              const semanticRouter = new SemanticRouter(c.env, true);
              const messages = (body as any).messages || [];
              const lastMessage = messages[messages.length - 1];
              const query = typeof lastMessage?.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage?.content || '');

              // Use parent domain for semantic routing (embeddings are top-level only)
              const topLevelDomain = topic.includes('/') ? topic.split('/')[0] : topic;

              semanticResult = await semanticRouter.route(
                query,
                topLevelDomain,
                routingBudget,
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
                  const backups = await getModelsForDomain(c.env.SCORE_DB, topic, routingBudget, complexity.tier);
                  if (backups && backups.length > 1) {
                    const backupModels = backups.filter(m => m.id !== semanticResult!.model_id).slice(0, 2);
                    candidateModels.push(...backupModels);
                  }

                  // Cache the semantic result
                  c.executionCtx.waitUntil(
                    routeCache.cacheRoute(topic, routingBudget, semanticResult.model_id, primaryModel.name)
                  );
                }
              }
            } catch (semanticErr) {
              console.error(`[Semantic Router] Failed, falling back to traditional routing:`, semanticErr instanceof Error ? semanticErr.message : semanticErr);
            }
          }

          // Fallback to traditional D1 routing if semantic routing disabled or failed
          if (candidateModels.length === 0) {
            const { getModelsForDomain } = await import('./db/queries');
            const models = await getModelsForDomain(c.env.SCORE_DB, topic, routingBudget, complexity.tier);

            if (models && models.length > 0) {
              candidateModels = models.slice(0, 3); // Top 3 models
              dataSource = semanticResult?.fallback_reason ? `database_fallback:${semanticResult.fallback_reason}` : 'database';
              console.log(`[Smart Router] D1 returned ${models.length} models, using top 3 for failover chain`);

              // Cache the top model for future requests (async, don't block)
              c.executionCtx.waitUntil(
                routeCache.cacheRoute(topic, routingBudget, models[0].id, models[0].name)
              );
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
      const topLevelTopic = topic.split('/')[0] as any;
      const fallback = selectBestModel(topLevelTopic, complexity.tier, councilBudget);
      candidateModels = [{
        id: fallback.id,
        name: fallback.name,
        provider: 'Unknown',
        input_price: fallback.inputPricePer1M,
        output_price: fallback.outputPricePer1M,
      }];
    }

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
      const topLevelTopic = topic.split('/')[0] as any;
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

    // Initialize OpenAI client
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: c.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://arcrouter.ai',
        'X-Title': 'ArcRouter',
      },
    });

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
          const stream = await openai.chat.completions.create({
            model: model.id,
            messages: body.messages as any,
            temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
            max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
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

                c.executionCtx.waitUntil(Promise.all([
                  circuitBreaker.recordSuccess(model.id),
                  telemetry.record(model.id, totalLatency, true),
                  addMetricNumber(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_sum_ms`, totalLatency),
                  incrementMetric(c.env.CONSENSUS_CACHE, `${metricsPrefix}:latency_total_count`),
                  logSuccess(),
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
          const completion = await openai.chat.completions.create({
            model: model.id,
            messages: body.messages as any,
            temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
            max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
          });

          const latency = Date.now() - startTime;

          // Success! Record and return
          await circuitBreaker.recordSuccess(model.id);

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

          return c.json({
            ...completion,
            routing: {
              mode: 'default',
              selected_model: model.id,
              model_name: model.name,
              provider: model.provider,
              topic_detected: topic,
              topic_confidence: topicDetection.confidence,
              complexity_tier: complexity.tier,
              budget: routingBudget,
              data_source: dataSource,
              failover_count: failoverCount,
            },
          });
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
    const chargedPriceUsd = getChargedPriceUsd(authTier, routingBudget, complexity.tier);
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
  const checks: Record<string, string> = {
    status: "ok",
    openrouter_key: c.env.OPENROUTER_API_KEY ? "configured" : "MISSING",
    admin_token: c.env.ADMIN_TOKEN ? "configured" : "MISSING",
    x402_wallet: c.env.X402_WALLET_ADDRESS ? "configured" : "MISSING",
  };

  const healthy = checks.openrouter_key === "configured";
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
      x402: "USDC payment on Base Mainnet. Variable pricing: $0.001 (simple), $0.002 (medium), $0.005 (complex)."
    },
    modes: {
      default: "Smart routing to the best single model from benchmark scores.",
      council: "Multi-model consensus and confidence scoring.",
    },
  });
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
      const sessionData = await c.env.CONSENSUS_CACHE.get(`session:${sessionId}`);

      if (!sessionData) {
        return c.json({
          error: "Session not found or expired. API keys are only retrievable for 24 hours after checkout."
        }, 404);
      }

      const { apiKey, email: customerEmail, customerId } = JSON.parse(sessionData);

      // Enforce one-time retrieval: delete session mapping after first successful fetch.
      try {
        await c.env.CONSENSUS_CACHE.delete(`session:${sessionId}`);
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

// Export with scheduled handler for cron trigger
export default {
  fetch: app.fetch,
  scheduled: async (event: ScheduledEvent, env: CloudflareBindings, ctx: ExecutionContext) => {
    console.log('[Cron] Running scheduled benchmark synchronization...');

    try {
      // 1. Sync pricing from OpenRouter (updates all models)
      const { scrapeOpenRouterPricing } = await import('./db/scrapers/openrouter-pricing');
      await scrapeOpenRouterPricing(env.SCORE_DB, env.OPENROUTER_API_KEY);

      // 2. Run orchestrator: all scrapers + synthetic scores + recalculation
      const { syncAllBenchmarks } = await import('./db/scrapers/orchestrator');
      const result = await syncAllBenchmarks(env.SCORE_DB);

      console.log(
        `[Cron] Benchmark sync complete: ${result.total_scores_updated} scores updated, ` +
        `${result.composite_scores_calculated} composite scores calculated`
      );

      if (result.errors.length > 0) {
        console.error(`[Cron] Errors encountered: ${result.errors.length}`);
        for (const error of result.errors.slice(0, 10)) {
          console.error(`[Cron] ${error}`);
        }
      }

      // 3. Flush telemetry data from KV to D1
      const { RoutingTelemetry } = await import('./router/telemetry');
      const telemetry = new RoutingTelemetry(env.CONSENSUS_CACHE);
      await telemetry.flushToD1(env.SCORE_DB);

      // 4. Invalidate route cache (scores changed, cached routes may be stale)
      const { RouteCache } = await import('./router/route-cache');
      const routeCache = new RouteCache(env.CONSENSUS_CACHE);
      await routeCache.invalidateAll();

      console.log('[Cron] Pipeline complete');
    } catch (err) {
      console.error('[Cron] Pipeline failed:', err instanceof Error ? err.message : String(err));
    }
  }
};
