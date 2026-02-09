import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { scorePrompt } from "./router/scorer";
import { CouncilEngine } from "./council/engine";
import { X402Manager } from "./payments/x402";
import { ConsensusRequest, CloudflareBindings } from "./types";
import { Address } from "viem";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.use("*", logger());
app.use("*", cors());

// Production x402 Middleware (The Handshake)
app.use("/v1/*", async (c, next) => {
  // 1. Skip if bypass key or non-payment required route
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer sk_")) return await next();

  // 2. Check x402 Headers
  const signature = c.req.header("X-402-Signature") as `0x${string}`;
  const nonce = c.req.header("X-402-Nonce");
  const signer = c.req.header("X-402-Signer") as Address;

  // 3. If headers are missing, initiate handshake
  if (!signature || !nonce || !signer) {
    // For this implementation, we return 402 with a quote
    const quote = await X402Manager.createQuote(c.env.CONSENSUS_CACHE, "default");
    
    return c.json({
      error: "Payment Required",
      message: "This endpoint requires an x402 payment signature.",
      quote
    }, 402);
  }

  // 4. Verify Signature
  const isValid = await X402Manager.verifyPayment(c.env.CONSENSUS_CACHE, signature, nonce, signer);
  if (!isValid) {
    return c.json({ error: "Invalid or expired payment signature" }, 402);
  }

  await next();
});

// OpenAI compatible completions endpoint
app.post("/v1/chat/completions", async (c) => {
  const body = await c.req.json();
  const prompt = body.messages?.[body.messages.length - 1]?.content || "";
  
  if (!prompt) {
    return c.json({ error: "No prompt provided" }, 400);
  }

  // 1. Analyze Complexity (Local <1ms)
  const complexity = scorePrompt(prompt);

  // 2. Run Council Engine (Dynamic & Parallel)
  const engine = new CouncilEngine(c.env);
  
  const request: ConsensusRequest = {
    prompt,
    budget: body.budget || "low",
    reliability: body.reliability || "standard"
  };

  try {
    const result = await engine.runConsensus(request, complexity.tier);

    // 3. Return OpenAI compatible response
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
      // Extended Metadata for Consensus Confidence
      consensus: {
        confidence: result.confidence,
        tier: result.complexity,
        votes: result.votes
      }
    });
  } catch (error: any) {
    console.error("[Consensus API] Flow Error:", error.message);
    return c.json({ error: error.message || "Consensus Engine failed" }, 500);
  }
});

app.get("/", (c) => {
  return c.json({ 
    name: "Consensus API", 
    status: "active", 
    version: "1.0.0-production" 
  });
});

export default app;
