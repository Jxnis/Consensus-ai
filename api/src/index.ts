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
  return await next();
});

// Hybrid Middleware: Parse body once and decide whether to enforce x402
app.use("/v1/chat/completions", async (c, next) => {
  const authTier = c.get("authTier" as never) as string | undefined;

  // Already authenticated via API key → bypass x402
  if (authTier === "paid" || authTier === "playground") {
    return await next();
  }

  // Parse body once, store in context to avoid double-parsing
  let budget = "";
  try {
    const rawBody = await c.req.raw.clone().text();

    if (rawBody.length > 51200) { // 50KB limit
      return c.json({ error: "Request body too large. Maximum 50KB." }, 413);
    }

    const body = JSON.parse(rawBody);
    budget = String(body.budget ?? "").toLowerCase();
    // Store parsed body in context to avoid double-parse in handler
    c.set("parsedBody" as never, body as never);
  } catch {
    // JSON parse error or empty body — treat as free tier
    budget = "free";
  }

  // Unauthenticated users with no explicit budget get free tier
  // Fixes the bug where missing budget triggered x402 enforcement
  if (budget === "free" || budget === "") {
    return await next();
  }

  // Budget explicitly set (e.g. "low", "medium", "high") but no auth → enforce x402
  console.log(`[Auth] Unauthenticated request with budget="${budget}". Enforcing x402.`);

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
              price: "$0.002",
              network: "eip155:8453", // Base Mainnet
              payTo: c.env.X402_WALLET_ADDRESS,
            },
          ],
          description: "CouncilRouter — multi-model consensus verification",
          mimeType: "application/json",
        },
      },
      x402Server
    );

    return await dynamicHandler(c, next);
  } catch (error: unknown) {
    // x402 facilitator may not support mainnet yet — return manual 402 instead of 500
    console.error("[x402] Middleware error:", error instanceof Error ? error.message : String(error));
    return c.json({
      error: "Payment required",
      x402: {
        version: 2,
        accepts: [{
          scheme: "exact",
          price: "$0.002",
          network: "eip155:8453",
          payTo: c.env.X402_WALLET_ADDRESS,
        }],
        description: "CouncilRouter — multi-model consensus verification. Send x402 payment headers or use budget='free' for free tier.",
      },
    }, 402);
  }
});

// Main Endpoint: Run consensus logic
app.post("/v1/chat/completions", async (c) => {
  // Use pre-parsed body if available (avoids double-parse)
  const body = (c.get("parsedBody" as never) as Record<string, unknown>) || await c.req.json();
  const messages = body.messages as Array<{role: string; content: string}> | undefined;
  const prompt = messages?.[messages.length - 1]?.content || "";

  if (!prompt || typeof prompt !== "string") {
    return c.json({ error: "No valid prompt provided" }, 400);
  }

  if (prompt.length > 8000) {
    return c.json({ error: "Prompt exceeds maximum length of 8000 characters" }, 400);
  }

  const sanitizedPrompt = prompt.replace(/\0/g, "").trim();
  if (sanitizedPrompt.length === 0) {
    return c.json({ error: "Prompt cannot be empty" }, 400);
  }

  if (!c.env.OPENROUTER_API_KEY) {
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }

  const authTier = (c.get("authTier" as never) as string) || "free";
  let budget = String((body.budget as string) || "").toLowerCase() || "low";

  // Free and playground tiers always use free models
  if (authTier === "free" || authTier === "playground") {
    budget = "free";
  }

  const complexity = scorePrompt(sanitizedPrompt);
  const engine = new CouncilEngine(c.env);

  const request: ConsensusRequest = {
    prompt: sanitizedPrompt,
    budget: ["free", "low", "medium", "high"].includes(budget) ? (budget as ConsensusRequest["budget"]) : "low",
    reliability: (body.reliability === "high" ? "high" : "standard")
  };

  const wantsStream = body.stream === true;

  try {
    const result = await engine.runConsensus(request, complexity.tier);

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
      const id = `cons-${Date.now()}`;
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
      id: `cons-${Date.now()}`,
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
      }
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("[BUDGET_GUARDRAIL]")) {
      // x402 + stream edge case: budget guardrail fired before any stream started (50d)
      if (wantsStream) {
        const encoder = new TextEncoder();
        const errPayload = { id: `cons-err-${Date.now()}`, object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000), model: "council-router-v1",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          error: "Budget policy exceeded. Simplify the prompt or increase budget tier." };
        return new Response(
          encoder.encode(`data: ${JSON.stringify(errPayload)}\n\ndata: [DONE]\n\n`),
          { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
        );
      }
      return c.json({
        error: "Budget policy exceeded. Simplify the prompt or increase budget tier."
      }, 400);
    }

    // Log internally, return generic message to avoid leaking internals
    console.error("[CouncilRouter] Consensus error:", error instanceof Error ? error.message : String(error));

    if (wantsStream) {
      // Emit streaming error so clients don't hang waiting for [DONE] (50d)
      const encoder = new TextEncoder();
      const errPayload = { id: `cons-err-${Date.now()}`, object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000), model: "council-router-v1",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        error: "Consensus processing failed. Please try again." };
      return new Response(
        encoder.encode(`data: ${JSON.stringify(errPayload)}\n\ndata: [DONE]\n\n`),
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
      );
    }

    return c.json({ error: "Consensus processing failed. Please try again." }, 500);
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
      paid: "API key required. All budget tiers, Stripe metered billing.",
      x402: "USDC payment on Base Mainnet. $0.002 per request."
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

export default app;
