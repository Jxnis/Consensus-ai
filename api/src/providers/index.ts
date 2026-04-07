/**
 * Direct Provider Access — Sprint 3 (TASK-S3.1)
 *
 * Routes requests directly to provider APIs when a key is available,
 * bypassing OpenRouter (saves 50-200ms latency + eliminates markup).
 * Falls back to OpenRouter transparently when key is not set.
 *
 * Supported providers:
 *   openai/*    → api.openai.com          (OpenAI-compatible)
 *   anthropic/* → api.anthropic.com       (needs format transform)
 *   google/*    → generativelanguage...   (OpenAI-compat v1beta)
 *   deepseek/*  → api.deepseek.com        (OpenAI-compatible)
 *   x-ai/*      → api.x.ai               (OpenAI-compatible)
 *
 * Add secrets to activate:
 *   wrangler secret put OPENAI_API_KEY
 *   wrangler secret put ANTHROPIC_API_KEY
 *   wrangler secret put GOOGLE_API_KEY
 *   wrangler secret put DEEPSEEK_API_KEY
 *   wrangler secret put XAI_API_KEY
 */

import { CloudflareBindings } from "../types";

export interface DirectCallResult {
  response: Response;
  provider: string;
  modelId: string; // normalized model ID as sent to the provider
}

interface OpenAIMessage {
  role: string;
  content: string | unknown;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: unknown[];
  [key: string]: unknown;
}

// ─── OpenAI-compatible providers ──────────────────────────────────────────────

interface CompatProvider {
  prefix: string;       // OpenRouter model ID prefix, e.g., "openai/"
  name: string;
  baseUrl: string;
  getKey: (env: CloudflareBindings) => string | undefined;
  // Some providers need the prefix stripped, others want a different ID
  normalizeModelId?: (openrouterId: string) => string;
}

const COMPAT_PROVIDERS: CompatProvider[] = [
  {
    prefix: "openai/",
    name: "openai",
    baseUrl: "https://api.openai.com/v1",
    getKey: (env) => (env as any).OPENAI_API_KEY,
    normalizeModelId: (id) => id.replace(/^openai\//, ""),
  },
  {
    prefix: "google/",
    name: "google",
    // Google's OpenAI-compatible endpoint
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    getKey: (env) => (env as any).GOOGLE_API_KEY,
    normalizeModelId: (id) => id.replace(/^google\//, ""),
  },
  {
    prefix: "deepseek/",
    name: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    getKey: (env) => (env as any).DEEPSEEK_API_KEY,
    normalizeModelId: (id) => id.replace(/^deepseek\//, ""),
  },
  {
    prefix: "x-ai/",
    name: "xai",
    baseUrl: "https://api.x.ai/v1",
    getKey: (env) => (env as any).XAI_API_KEY,
    normalizeModelId: (id) => id.replace(/^x-ai\//, ""),
  },
];

// ─── Anthropic (non-compatible, needs transform) ───────────────────────────────

function buildAnthropicRequest(req: OpenAIRequest): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  const messages = req.messages ?? [];

  // Extract system message (Anthropic puts it at top level)
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model: req.model.replace(/^anthropic\//, ""),
    max_tokens: req.max_tokens ?? 4096,
    messages: nonSystemMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };

  if (systemMsg) {
    body.system = systemMsg.content;
  }

  if (typeof req.temperature === "number") {
    body.temperature = req.temperature;
  }

  // Tool use (Anthropic format is similar but not identical)
  if (Array.isArray(req.tools) && req.tools.length > 0) {
    body.tools = req.tools;
  }

  return {
    url: "https://api.anthropic.com/v1/messages",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body,
  };
}

function transformAnthropicResponse(
  anthropicResp: Record<string, unknown>,
  originalModelId: string
): Record<string, unknown> {
  const content = anthropicResp.content as Array<{ type: string; text: string }> | undefined;
  const text = content?.find((c) => c.type === "text")?.text ?? "";

  const usage = anthropicResp.usage as { input_tokens?: number; output_tokens?: number } | undefined;

  const stopReasonMap: Record<string, string> = {
    end_turn: "stop",
    max_tokens: "length",
    tool_use: "tool_calls",
    stop_sequence: "stop",
  };
  const stopReason = stopReasonMap[String(anthropicResp.stop_reason)] ?? "stop";

  return {
    id: anthropicResp.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: originalModelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: stopReason,
      },
    ],
    usage: {
      prompt_tokens: usage?.input_tokens ?? 0,
      completion_tokens: usage?.output_tokens ?? 0,
      total_tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    },
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Try to call a model directly through its provider API.
 * Returns null when:
 *   - No direct provider registered for this model prefix
 *   - The provider API key is not set
 * In those cases the caller should fall back to OpenRouter.
 */
export async function callDirectProvider(
  modelId: string,
  request: OpenAIRequest,
  env: CloudflareBindings
): Promise<DirectCallResult | null> {
  // ── Anthropic ──────────────────────────────────────────────────────────────
  if (modelId.startsWith("anthropic/")) {
    const apiKey = (env as any).ANTHROPIC_API_KEY as string | undefined;
    if (!apiKey) return null; // Key not set, fall back to OpenRouter

    // Streaming is complex to transform from Anthropic format; use OpenRouter for streams
    if (request.stream) return null;

    const { url, headers, body } = buildAnthropicRequest({ ...request, model: modelId });

    const resp = await fetch(url, {
      method: "POST",
      headers: { ...headers, "x-api-key": apiKey },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[DirectProvider] Anthropic error ${resp.status}: ${errText.slice(0, 200)}`);
      return null; // Fall back to OpenRouter
    }

    const anthropicJson = (await resp.json()) as Record<string, unknown>;
    const openAIJson = transformAnthropicResponse(anthropicJson, modelId);

    return {
      response: new Response(JSON.stringify(openAIJson), {
        headers: { "Content-Type": "application/json" },
      }),
      provider: "anthropic",
      modelId: modelId.replace(/^anthropic\//, ""),
    };
  }

  // ── OpenAI-compatible providers ────────────────────────────────────────────
  for (const provider of COMPAT_PROVIDERS) {
    if (!modelId.startsWith(provider.prefix)) continue;

    const apiKey = provider.getKey(env);
    if (!apiKey) return null; // Key not set, fall back to OpenRouter

    const normalizedModelId = provider.normalizeModelId
      ? provider.normalizeModelId(modelId)
      : modelId;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    // Google needs the model as a query param on some endpoints, but v1beta/openai is standard
    const body = {
      ...request,
      model: normalizedModelId,
    };

    const url = `${provider.baseUrl}/chat/completions`;

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(
        `[DirectProvider] ${provider.name} error ${resp.status}: ${errText.slice(0, 200)}`
      );
      return null; // Fall back to OpenRouter
    }

    return {
      response: resp,
      provider: provider.name,
      modelId: normalizedModelId,
    };
  }

  // No direct provider matched
  return null;
}

/**
 * Returns the provider name for a model ID, or "openrouter" if no direct provider.
 * Used for logging / metadata only.
 */
export function getProviderName(modelId: string): string {
  if (modelId.startsWith("anthropic/")) return "anthropic";
  if (modelId.startsWith("openai/")) return "openai";
  if (modelId.startsWith("google/")) return "google";
  if (modelId.startsWith("deepseek/")) return "deepseek";
  if (modelId.startsWith("x-ai/")) return "xai";
  return "openrouter";
}

/**
 * Whether a direct provider key appears to be configured for this model.
 * Used to log which providers are active.
 */
export function isDirectProviderAvailable(modelId: string, env: CloudflareBindings): boolean {
  if (modelId.startsWith("anthropic/")) return !!(env as any).ANTHROPIC_API_KEY;
  if (modelId.startsWith("openai/")) return !!(env as any).OPENAI_API_KEY;
  if (modelId.startsWith("google/")) return !!(env as any).GOOGLE_API_KEY;
  if (modelId.startsWith("deepseek/")) return !!(env as any).DEEPSEEK_API_KEY;
  if (modelId.startsWith("x-ai/")) return !!(env as any).XAI_API_KEY;
  return false;
}
