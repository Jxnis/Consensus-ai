import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { paymentMiddleware } from "@x402/hono";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { scorePrompt } from "./router/scorer";
import { CouncilEngine } from "./council/engine";
import { ConsensusRequest, CloudflareBindings } from "./types";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", logger());
app.use("*", cors());

/**
 * Authentication Middleware — Three-tier access:
 * 
 * 1. API Key (Bearer sk_...)      → Full access, Stripe metered billing
 * 2. x402 Payment Headers         → Per-request USDC payment on Base
 * 3. No auth                      → Free tier only (rate-limited, free models)
 */

// API Key Authentication Middleware (runs before x402)
app.use("/v1/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const apiKey = authHeader?.replace("Bearer ", "");
  
  if (apiKey) {
    // Validate API key against KV store
    const keyData = await c.env.CONSENSUS_CACHE.get(`apikey:${apiKey}`, { type: "json" }) as { 
      userId: string; 
      tier: "paid" | "playground"; 
      stripeSubscriptionId?: string 
    } | null;
    
    if (keyData) {
      // Valid API key — set auth tier and continue
      c.set("authTier" as never, keyData.tier as never);
      c.set("userId" as never, keyData.userId as never);
      c.set("stripeSubscriptionId" as never, keyData.stripeSubscriptionId as never);
      return await next();
    } else {
      // Invalid API key
      return c.json({ error: "Invalid API key" }, 401);
    }
  }
  
  // No API key — check for x402 payment or fall back to free
  return await next();
});

// x402 Payment Middleware (for users without API keys)
const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator"
});

const x402Server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(x402Server);

// Rate Limiting Middleware (applies to all auth tiers)
app.use("/v1/*", async (c, next) => {
  const clientIP = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  const authTier = (c.get("authTier" as never) as string) || "free";
  const userId = (c.get("userId" as never) as string) || clientIP;
  
  // Different rate limits per tier
  const limits: Record<string, number> = {
    free: 20,        // 20 requests/hour — enough to try, not enough to abuse
    playground: 50,  // 50 requests/hour — demo usage
    paid: 10000,     // 10,000 requests/hour — production usage
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
  await next();
});

// Defines the completion logic separately so it can be reused
const handleCompletion = async (c: any) => {
  const body = await c.req.json();
  const prompt = body.messages?.[body.messages.length - 1]?.content || "";
  
  // Input validation
  if (!prompt || typeof prompt !== 'string') {
    return c.json({ error: "No valid prompt provided" }, 400);
  }

  if (prompt.length > 8000) {
    return c.json({ error: "Prompt exceeds maximum length of 8000 characters" }, 400);
  }

  // Sanitize
  const sanitizedPrompt = prompt.replace(/\0/g, "").trim();
  if (sanitizedPrompt.length === 0) {
    return c.json({ error: "Prompt cannot be empty" }, 400);
  }

  // Determine budget based on auth tier
  const authTier = (c.get("authTier" as never) as string) || "free";
  let budget = body.budget || "low";
  
  // Free tier: force free models only (x402 and paid can use any budget)
  if (authTier === "free" || authTier === "playground") {
    budget = "free";
  }

  // 1. Analyze Complexity (Local <1ms)
  const complexity = scorePrompt(sanitizedPrompt);

  // 2. Run Council Engine
  const engine = new CouncilEngine(c.env);
  
  const request: ConsensusRequest = {
    prompt: sanitizedPrompt,
    budget,
    reliability: body.reliability || "standard"
  };

  try {
    const result = await engine.runConsensus(request, complexity.tier);

    // 3. Track usage for Stripe metered billing (paid tier only)
    const stripeSubscriptionId = c.get("stripeSubscriptionId" as never) as string | undefined;
    if (authTier === "paid" && stripeSubscriptionId) {
      const usageKey = `stripe:usage:${stripeSubscriptionId}:${new Date().toISOString().slice(0, 10)}`;
      const currentUsage = await c.env.CONSENSUS_CACHE.get(usageKey);
      const newUsage = (parseInt(currentUsage || "0") + 1).toString();
      await c.env.CONSENSUS_CACHE.put(usageKey, newUsage, { expirationTtl: 86400 * 7 }); // 7 days
    }

    return c.json({
      id: `cons-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "consensus-v1",
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
    const message = error instanceof Error ? error.message : "Consensus Engine failed";
    console.error("[Consensus API] Flow Error:", message);
    return c.json({ error: message }, 500);
  }
};

// Hybrid Middleware: Decides whether to enforce x402 payment
app.use("/v1/chat/completions", async (c, next) => {
  const authTier = c.get("authTier" as never);

  // 1. API Key / Playground (Already Authenticated) -> Bypass x402
  if (authTier === "paid" || authTier === "playground") {
    return await next();
  }

  // 2. Check if user wants Free Tier explicitly (budget="free")
  try {
    const clone = c.req.raw.clone();
    const body = await clone.json() as any;
    
    // Robust check: handle missing budget, mixed case
    const budget = String(body.budget || "").toLowerCase();
    
    // If explicitly requesting free budget, let them through as Free Tier
    if (budget === "free") {
      return await next();
    } else {
      console.log(`[Auth Check] Unauthed request with budget="${budget}". Enforcing x402.`);
    }
  } catch (e) {
    console.error("[Auth Check] Body parse failed (likely empty/malformed). Enforcing x402.", e);
    // JSON parse error or empty body - let x402 handler deal with it
  }

  // 3. Otherwise -> Enforce x402 Payment dynamically (accessing c.env)
  const dynamicHandler = paymentMiddleware(
    {
      "POST /v1/chat/completions": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.002", // $0.002 per request
            network: "eip155:8453", // Base Mainnet
            payTo: c.env.X402_WALLET_ADDRESS || "0x0000000000000000000000000000000000000000",
          },
        ],
        description: "Consensus LLM routing - multi-model verification",
        mimeType: "application/json",
      },
    },
    x402Server
  );
  
  return dynamicHandler(c, next);
});

// Main Endpoint: Just runs the consensus logic
app.post("/v1/chat/completions", async (c) => {
  return handleCompletion(c);
});

// Health check endpoint
app.get("/", (c) => {
  return c.json({ 
    name: "Consensus API", 
    status: "operational", 
    version: "1.0.0",
    tiers: {
      free: "No auth required. Free models only, 20 req/hour.",
      paid: "API key required. All budget tiers, Stripe metered billing.",
      x402: "USDC payment on Base Mainnet. $0.002 per request."
    }
  });
});

// API Key creation endpoint (requires admin auth)
app.post("/admin/create-key", async (c) => {
  const adminToken = c.req.header("X-Admin-Token");
  if (adminToken !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { userId, tier, stripeSubscriptionId } = body;

  // Generate API key
  const apiKey = `sk_${crypto.randomUUID().replace(/-/g, "")}`;

  // Store in KV
  await c.env.CONSENSUS_CACHE.put(
    `apikey:${apiKey}`,
    JSON.stringify({ userId, tier, stripeSubscriptionId }),
    { expirationTtl: 31536000 } // 1 year
  );

  return c.json({ apiKey, userId, tier });
});

export default app;
