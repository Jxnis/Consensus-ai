/**
 * ArcRouter MCP Server
 *
 * Implements MCP Streamable HTTP transport (no SDK dependency — CF Workers safe).
 * Protocol: https://modelcontextprotocol.io/
 *
 * Install in Claude Code:
 *   claude mcp add arcrouter --transport http https://api.arcrouter.com/mcp
 */

import { CloudflareBindings } from "../types";
import { scorePrompt, detectTopicDetailed } from "../router/scorer";
import { normalizeRoutingBudget } from "../router/budget";

const MCP_PROTOCOL_VERSION = "2024-11-05";

interface JSONRPCRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const TOOLS = [
  {
    name: "arcrouter_chat",
    description:
      "Route a prompt to the best AI model based on topic, complexity, and budget. " +
      "ArcRouter auto-detects code/math/science/writing/general topics and picks the highest-scoring model. " +
      "Returns the AI response plus routing metadata (model used, topic, complexity tier, latency).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The message or question to send to the AI model",
        },
        budget: {
          type: "string",
          enum: ["free", "economy", "auto", "premium"],
          description:
            "'free' = zero-cost models only. 'economy' = cheap paid. 'auto' = best value (default). 'premium' = top-tier models.",
          default: "auto",
        },
        mode: {
          type: "string",
          enum: ["default", "council"],
          description:
            "'default' = single best model (fast, cheap). 'council' = multi-model consensus (slower, higher confidence).",
          default: "default",
        },
        session_id: {
          type: "string",
          description:
            "Session ID for model pinning — ensures multi-turn conversations stay on the same model.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "arcrouter_models",
    description:
      "List AI models available in ArcRouter with benchmark scores and pricing. " +
      "Filter by topic and budget to see which models ArcRouter would select for your use case.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["code", "math", "science", "writing", "reasoning", "general"],
          description: "Filter by topic domain (optional)",
        },
        budget: {
          type: "string",
          enum: ["free", "economy", "auto", "premium"],
          description: "Filter by budget tier (optional)",
          default: "auto",
        },
        limit: {
          type: "number",
          description: "Max number of models to return (default: 10)",
          default: 10,
        },
      },
    },
  },
  {
    name: "arcrouter_health",
    description:
      "Check ArcRouter system status — API keys, database, semantic routing, x402 wallet.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

function ok(id: string | number | null | undefined, result: unknown): JSONRPCResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: string | number | null | undefined,
  code: number,
  message: string
): JSONRPCResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

// GPT-4o reference price for savings calculation
const GPT4O_INPUT_PRICE_PER_1M = 5.0;
const GPT4O_OUTPUT_PRICE_PER_1M = 15.0;
const GPT4O_AVG_PRICE_PER_1M = (GPT4O_INPUT_PRICE_PER_1M + GPT4O_OUTPUT_PRICE_PER_1M) / 2; // $10/1M

async function callTool(
  toolName: string,
  toolArgs: Record<string, unknown>,
  env: CloudflareBindings
): Promise<unknown> {
  switch (toolName) {
    case "arcrouter_chat": {
      const prompt = String(toolArgs.prompt || "").trim();
      const budget = String(toolArgs.budget || "auto");
      const sessionId = toolArgs.session_id ? String(toolArgs.session_id) : undefined;

      if (!prompt) {
        return {
          isError: true,
          content: [{ type: "text", text: "Error: prompt is required" }],
        };
      }

      if (!env.OPENROUTER_API_KEY) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "ArcRouter service unavailable: OpenRouter API key not configured",
            },
          ],
        };
      }

      // Score prompt complexity + detect topic
      const complexity = scorePrompt(prompt);
      const topicDetection = detectTopicDetailed(prompt);
      const topic = topicDetection.secondary || topicDetection.primary;
      const routingBudget = normalizeRoutingBudget(budget);

      // Session pinning: check if we have a pinned model for this session
      let pinnedModelId: string | null = null;
      if (sessionId && env.CONSENSUS_CACHE) {
        try {
          pinnedModelId = await env.CONSENSUS_CACHE.get(`mcp:session:${sessionId}`);
        } catch {
          // Non-critical
        }
      }

      // Select model from D1
      let modelId = pinnedModelId || "google/gemini-flash-1.5";
      let modelName = "Gemini Flash 1.5";

      if (!pinnedModelId && env.SCORE_DB) {
        try {
          const { getModelsForDomain } = await import("../db/queries");
          const models = await getModelsForDomain(
            env.SCORE_DB,
            topic,
            routingBudget,
            complexity.tier
          );
          if (models && models.length > 0) {
            modelId = models[0].id;
            modelName = models[0].name;
          }
        } catch (dbErr) {
          console.error("[MCP] D1 query failed, using fallback:", dbErr);
        }
      }

      // Call OpenRouter
      const startTime = Date.now();
      let answer = "";
      let callSuccess = false;

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://arcrouter.ai",
            "X-Title": "ArcRouter MCP",
          },
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: "user", content: prompt }],
          }),
        });

        if (!response.ok) {
          const status = response.status;
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Model call failed (${status}). Try a different budget tier or report at https://github.com/arcrouter/arcrouter/issues`,
              },
            ],
          };
        }

        const completion = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        answer = completion.choices?.[0]?.message?.content || "";
        callSuccess = true;
      } catch (fetchErr) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Network error calling model: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
            },
          ],
        };
      }

      const latency = Date.now() - startTime;

      // Session pinning: cache model choice for future requests
      if (sessionId && env.CONSENSUS_CACHE && callSuccess) {
        env.CONSENSUS_CACHE.put(`mcp:session:${sessionId}`, modelId, {
          expirationTtl: 3600,
        }).catch(() => {});
      }

      return {
        content: [{ type: "text", text: answer }],
        metadata: {
          model_used: modelId,
          model_name: modelName,
          topic_detected: topic,
          topic_confidence: Math.round(topicDetection.confidence * 100) / 100,
          complexity_tier: complexity.tier,
          budget_used: routingBudget,
          latency_ms: latency,
          session_pinned: !!pinnedModelId,
        },
      };
    }

    case "arcrouter_models": {
      const topic = String(toolArgs.topic || "general");
      const budget = String(toolArgs.budget || "auto");
      const limit = typeof toolArgs.limit === "number" ? Math.min(toolArgs.limit, 20) : 10;

      if (!env.SCORE_DB) {
        return {
          isError: true,
          content: [{ type: "text", text: "Database not available" }],
        };
      }

      try {
        const { getModelsForDomain } = await import("../db/queries");
        const routingBudget = normalizeRoutingBudget(budget);
        const models = await getModelsForDomain(env.SCORE_DB, topic, routingBudget, "MEDIUM");
        const topModels = (models || []).slice(0, limit);

        if (topModels.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No models found for topic '${topic}' with budget '${budget}'.`,
              },
            ],
            models: [],
          };
        }

        const lines = topModels.map((m, i) => {
          const avgPrice = ((m.input_price + m.output_price) / 2).toFixed(4);
          const quality = m.quality_score ? ` | Quality: ${(m.quality_score * 100).toFixed(0)}` : "";
          return `${i + 1}. ${m.name}\n   ID: ${m.id}\n   Price: $${avgPrice}/1M avg${quality}\n   Context: ${(m.context_length / 1000).toFixed(0)}K tokens`;
        });

        return {
          content: [
            {
              type: "text",
              text: `Top ${topModels.length} models for topic=${topic}, budget=${budget}:\n\n${lines.join("\n\n")}`,
            },
          ],
          models: topModels.map((m) => ({
            id: m.id,
            name: m.name,
            provider: m.provider,
            input_price_per_1m: m.input_price,
            output_price_per_1m: m.output_price,
            context_length: m.context_length,
            quality_score: m.quality_score,
            value_score: m.value_score,
          })),
        };
      } catch (dbErr) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to query models: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
            },
          ],
        };
      }
    }

    case "arcrouter_health": {
      const checks = {
        openrouter_key: env.OPENROUTER_API_KEY ? "configured" : "MISSING",
        admin_token: env.ADMIN_TOKEN ? "configured" : "MISSING",
        x402_wallet: env.X402_WALLET_ADDRESS ? "configured" : "MISSING",
        score_db: env.SCORE_DB ? "configured" : "MISSING",
        workers_ai: env.AI ? "configured" : "MISSING",
        semantic_routing: env.SEMANTIC_ROUTING_ENABLED === "true" ? "enabled" : "disabled",
      };

      const healthy = checks.openrouter_key === "configured";
      const lines = Object.entries(checks).map(
        ([k, v]) => `  ${v === "MISSING" ? "✗" : "✓"} ${k}: ${v}`
      );

      return {
        content: [
          {
            type: "text",
            text: `ArcRouter Status: ${healthy ? "✓ HEALTHY" : "✗ DEGRADED"}\n\n${lines.join("\n")}\n\nAPI: https://api.arcrouter.com\nDocs: https://arcrouter.com/docs`,
          },
        ],
        healthy,
        checks,
      };
    }

    default:
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown tool: ${toolName}. Available tools: arcrouter_chat, arcrouter_models, arcrouter_health`,
          },
        ],
      };
  }
}

async function handleRequest(
  req: JSONRPCRequest,
  env: CloudflareBindings
): Promise<JSONRPCResponse | null> {
  const { method, params, id } = req;

  // Notifications have no id and require no response
  if (id === undefined && method.startsWith("notifications/")) {
    return null;
  }

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: { name: "arcrouter", version: "1.0.0" },
        instructions:
          "ArcRouter routes prompts to the best AI model by topic and complexity. " +
          "Use arcrouter_chat to route a query, arcrouter_models to browse available models, " +
          "and arcrouter_health to check system status.",
      });

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: TOOLS });

    case "tools/call": {
      const toolName = String((params as Record<string, unknown>)?.name || "");
      const toolArgs = ((params as Record<string, unknown>)?.arguments ||
        {}) as Record<string, unknown>;

      if (!toolName) {
        return err(id, -32602, "Missing required parameter: name");
      }

      try {
        const result = await callTool(toolName, toolArgs, env);
        return ok(id, result);
      } catch (e) {
        return err(
          id,
          -32603,
          `Tool execution error: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Session-Id",
};

export async function handleMCPRequest(
  request: Request,
  env: CloudflareBindings
): Promise<Response> {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Only POST is supported for MCP" }),
      { status: 405, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  let body: JSONRPCRequest | JSONRPCRequest[];
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify(err(null, -32700, "Parse error: invalid JSON")),
      { status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const responseHeaders = { "Content-Type": "application/json", ...CORS_HEADERS };

  // Batch request
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((r) => handleRequest(r, env)));
    const nonNull = responses.filter(Boolean);
    return new Response(JSON.stringify(nonNull), { headers: responseHeaders });
  }

  // Single request
  const response = await handleRequest(body, env);
  if (response === null) {
    // Notification — no body response
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify(response), { headers: responseHeaders });
}
