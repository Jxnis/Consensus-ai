/**
 * ArcRouter TypeScript SDK
 * Drop-in OpenAI-compatible client with intelligent routing, council mode,
 * workflow budgets, and x402 micropayments.
 *
 * @example
 * ```typescript
 * import { ArcRouter } from 'arcrouter';
 *
 * const arc = new ArcRouter({ apiKey: 'sk_...' });
 * const res = await arc.chat('Write a Python function to parse JSON');
 * console.log(res.content);
 * console.log(res.routing.model, res.routing.estimatedCostUsd);
 * ```
 */

import { OpenAI } from "openai";

// ─── Public types ─────────────────────────────────────────────────────────────

export type Budget = "free" | "economy" | "auto" | "premium";
export type ComplexityTier = "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING";
export type AgentStep =
  | "simple-action"
  | "simple"
  | "reasoning"
  | "code-generation"
  | "code"
  | "verification"
  | "verify"
  | "analysis"
  | "analyze"
  | "planning"
  | "plan";

/**
 * EVM wallet signer compatible with viem's LocalAccount.
 * Must have an address and be able to sign EIP-712 typed data.
 *
 * @example
 * ```typescript
 * import { privateKeyToAccount } from 'viem/accounts';
 * const wallet = privateKeyToAccount('0x...');
 * ```
 */
export interface EvmSigner {
  readonly address: `0x${string}`;
  signTypedData(params: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }): Promise<`0x${string}`>;
}

export interface ArcRouterConfig {
  /** API key (sk_...). Required for paid tier. Optional for free tier. */
  apiKey?: string;
  /** Override API base URL. Default: https://api.arcrouter.com */
  baseURL?: string;
  /** Default budget for all requests. Default: 'auto' */
  budget?: Budget;
  /** Default session ID for model pinning across requests */
  sessionId?: string;
  /**
   * EVM wallet for x402 micropayments (USDC on Base).
   * When set, 402 responses are automatically handled: the SDK signs
   * an on-chain payment authorization and retries the request.
   * Requires `viem` and `@x402/core` + `@x402/evm` peer dependencies.
   *
   * @example
   * ```typescript
   * import { privateKeyToAccount } from 'viem/accounts';
   *
   * const arc = new ArcRouter({
   *   wallet: privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),
   * });
   * // Requests that need payment are automatically signed and retried
   * const res = await arc.chat('Complex query', { budget: 'premium' });
   * ```
   */
  wallet?: EvmSigner;
  /** Max automatic retries on 5xx errors. Default: 2 */
  maxRetries?: number;
}

export interface ChatOptions {
  budget?: Budget;
  /** Hint to the router about the agent step type — overrides complexity scoring */
  agentStep?: AgentStep;
  /** Max cost per request in USD (graceful downgrade if exceeded) */
  maxCost?: number;
  /** Model IDs to exclude */
  excludeModels?: string[];
  /** Session ID for model pinning */
  sessionId?: string;
  /** Override model selection with a specific model ID or alias */
  model?: string;
  /** Workflow budget object (for multi-step workflows) */
  workflowBudget?: { session_id: string; total_budget_usd: number };
  /** System prompt */
  system?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
}

export interface RoutingMetadata {
  model: string;
  modelName: string;
  provider: string;
  callPath: string;
  topic: string;
  complexityTier: ComplexityTier;
  complexityConfidence: number;
  budget: string;
  dataSource: string;
  failoverCount: number;
  modelsConsidered: number;
  isAgentic: boolean;
  estimatedCostUsd?: number;
  savingsVsGpt4Pct?: number;
  sessionPinned?: boolean;
  workflowBudgetRemainingUsd?: number;
  agentStepOverride?: string;
}

export interface ArcRouterResponse {
  /** The AI response text */
  content: string;
  /** Routing metadata — which model was used, topic, cost, etc. */
  routing: RoutingMetadata;
  /** Raw API response (full OpenAI-compatible object) */
  raw: Record<string, unknown>;
}

export interface Vote {
  model: string;
  answer: string;
  agrees: boolean;
}

export interface CouncilResponse {
  /** The consensus answer */
  content: string;
  /** 0-1 confidence score */
  confidence: number;
  /** Individual model votes */
  votes: Vote[];
  /** Whether the chairman synthesized (models disagreed) */
  synthesized: boolean;
  /** Whether result was served from cache */
  cached: boolean;
  /** Raw API response */
  raw: Record<string, unknown>;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  contextLength: number;
  qualityScore?: number;
  valueScore?: number;
}

export interface UsageDay {
  date: string;
  requests: number;
  costUsd: number;
}

export interface UsageStats {
  tier: string;
  period: { days: number; from: string; to: string };
  totalRequests: number;
  totalCostUsd: number;
  daily: UsageDay[];
}

export interface WorkflowOptions {
  /** Unique session ID for this workflow */
  sessionId: string;
  /** Total budget for entire workflow in USD */
  totalBudget?: number;
  /** Default budget tier */
  budget?: Budget;
}

export interface WorkflowUsage {
  session_id: string;
  total_budget_usd?: number;
  total_spent_usd: number;
  pct_used: number;
  requests: number;
  models_used: string[];
  avg_latency_ms: number;
  tier_distribution: Record<string, number>;
}

// ─── x402 payment types ───────────────────────────────────────────────────────

interface X402PaymentRequired {
  x402Version: number;
  resource: string;
  accepts: Array<{
    scheme: string;
    network: string;
    payTo: string;
    maxAmountRequired: string;
    asset: string;
    amount?: string;
    extra?: Record<string, unknown>;
    maxTimeoutSeconds?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface X402Client {
  createPaymentPayload(paymentRequired: X402PaymentRequired): Promise<unknown>;
}

interface X402HTTPClientLike {
  encodePaymentSignatureHeader(paymentPayload: unknown): Record<string, string>;
  getPaymentRequiredResponse(
    getHeader: (name: string) => string | null | undefined,
    body?: unknown,
  ): X402PaymentRequired;
  createPaymentPayload(paymentRequired: X402PaymentRequired): Promise<unknown>;
}

/**
 * Lazily loads and initializes the x402 payment client.
 * Returns null if @x402/core or @x402/evm are not installed.
 */
async function createX402HTTPClient(wallet: EvmSigner): Promise<X402HTTPClientLike | null> {
  try {
    // Dynamic imports — these packages are optional peer dependencies.
    // Users who want x402 micropayments must install @x402/core, @x402/evm, and viem.
    // @ts-ignore — optional peer dependency
    const coreClient = await import("@x402/core/client");
    // @ts-ignore — optional peer dependency
    const evmClient = await import("@x402/evm/exact/client");

    const client: X402Client = new coreClient.x402Client();
    evmClient.registerExactEvmScheme(client, { signer: wallet });
    const httpClient: X402HTTPClientLike = new coreClient.x402HTTPClient(client);

    // Attach standalone encode function from http module
    const originalEncode = httpClient.encodePaymentSignatureHeader.bind(httpClient);
    httpClient.encodePaymentSignatureHeader = (payload: unknown) => {
      // x402HTTPClient.encodePaymentSignatureHeader returns { "X-PAYMENT": base64 }
      return originalEncode(payload);
    };

    return httpClient;
  } catch {
    return null;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function extractContent(raw: Record<string, unknown>): string {
  const choices = raw.choices as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content ?? "";
}

function extractRouting(raw: Record<string, unknown>): RoutingMetadata {
  const r = (raw.routing ?? {}) as Record<string, unknown>;
  return {
    model: String(r.selected_model ?? r.model ?? "unknown"),
    modelName: String(r.model_name ?? r.selected_model ?? "unknown"),
    provider: String(r.provider ?? "openrouter"),
    callPath: String(r.call_path ?? "openrouter"),
    topic: String(r.topic_detected ?? "general"),
    complexityTier: (r.complexity_tier as ComplexityTier) ?? "MEDIUM",
    complexityConfidence: Number(r.complexity_confidence ?? 0),
    budget: String(r.budget ?? "auto"),
    dataSource: String(r.data_source ?? "unknown"),
    failoverCount: Number(r.failover_count ?? 0),
    modelsConsidered: Number(r.models_considered ?? 1),
    isAgentic: Boolean(r.is_agentic ?? false),
    estimatedCostUsd: typeof r.estimated_cost_usd === "number" ? r.estimated_cost_usd : undefined,
    savingsVsGpt4Pct: typeof r.savings_vs_gpt4_pct === "number" ? r.savings_vs_gpt4_pct : undefined,
    sessionPinned: Boolean(r.session_pinned ?? false),
    workflowBudgetRemainingUsd: typeof r.workflow_budget_remaining_usd === "number" ? r.workflow_budget_remaining_usd : undefined,
    agentStepOverride: typeof r.agent_step_override === "string" ? r.agent_step_override : undefined,
  };
}

/** Sleep helper for retry backoff */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export class ArcWorkflow {
  private arc: ArcRouter;
  private options: WorkflowOptions;
  private initialized = false;

  constructor(arc: ArcRouter, options: WorkflowOptions) {
    this.arc = arc;
    this.options = options;
  }

  async chat(prompt: string, opts: Omit<ChatOptions, "workflowBudget" | "sessionId"> = {}): Promise<ArcRouterResponse> {
    const workflowBudget = this.options.totalBudget && !this.initialized
      ? { session_id: this.options.sessionId, total_budget_usd: this.options.totalBudget }
      : undefined;
    this.initialized = true;

    return this.arc.chat(prompt, {
      ...opts,
      sessionId: this.options.sessionId,
      budget: opts.budget ?? this.options.budget,
      workflowBudget,
    });
  }

  async getUsage(): Promise<WorkflowUsage> {
    return this.arc.workflowUsage(this.options.sessionId);
  }
}

// ─── Main client ──────────────────────────────────────────────────────────────

export class ArcRouter {
  private readonly baseURL: string;
  private readonly apiKey: string | undefined;
  private readonly defaultBudget: Budget;
  private readonly defaultSessionId: string | undefined;
  private readonly wallet: EvmSigner | undefined;
  private readonly maxRetries: number;
  private x402HttpClient: X402HTTPClientLike | null | undefined; // undefined = not yet loaded

  constructor(config: ArcRouterConfig = {}) {
    this.baseURL = (config.baseURL ?? "https://api.arcrouter.com").replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.defaultBudget = config.budget ?? "auto";
    this.defaultSessionId = config.sessionId;
    this.wallet = config.wallet;
    this.maxRetries = config.maxRetries ?? 2;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    return h;
  }

  /**
   * Lazily initialize x402 HTTP client (only when wallet is configured and 402 is received).
   */
  private async getX402Client(): Promise<X402HTTPClientLike | null> {
    if (this.x402HttpClient !== undefined) return this.x402HttpClient;
    if (!this.wallet) {
      this.x402HttpClient = null;
      return null;
    }
    this.x402HttpClient = await createX402HTTPClient(this.wallet);
    if (!this.x402HttpClient) {
      console.warn(
        "[ArcRouter] x402 wallet configured but @x402/core and @x402/evm packages not found. " +
        "Install them to enable automatic micropayments: npm install @x402/core @x402/evm viem"
      );
    }
    return this.x402HttpClient;
  }

  /**
   * Handle a 402 response by signing a payment and retrying.
   * Returns { res, paidInit } so callers can use paidInit for subsequent retries —
   * x402 payment headers must be preserved on 5xx retries to avoid re-triggering 402.
   */
  private async handleX402(
    res: Response,
    url: string,
    init: RequestInit,
  ): Promise<{ res: Response; paidInit: RequestInit }> {
    const x402Client = await this.getX402Client();
    if (!x402Client) {
      throw new Error(
        "ArcRouter: received 402 Payment Required but no wallet is configured. " +
        "Pass a wallet to ArcRouter({ wallet: privateKeyToAccount('0x...') }) " +
        "and install @x402/core @x402/evm viem."
      );
    }

    // Parse payment requirements from 402 response
    const body = await res.json() as Record<string, unknown>;
    const paymentRequired = x402Client.getPaymentRequiredResponse(
      (name: string) => res.headers.get(name),
      body,
    );

    // Create signed payment payload
    const paymentPayload = await x402Client.createPaymentPayload(paymentRequired);

    // Encode as headers
    const paymentHeaders = x402Client.encodePaymentSignatureHeader(paymentPayload);

    // Build paid init — must be used for all subsequent retries
    const paidInit: RequestInit = {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        ...paymentHeaders,
      },
    };

    return { res: await fetch(url, paidInit), paidInit };
  }

  /**
   * Fetch with automatic x402 payment handling and retry on 5xx.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    let res = await fetch(url, init);

    // Handle x402 payment (one attempt).
    // Use paidInit for all subsequent 5xx retries — payment headers must be preserved
    // so the server doesn't issue a second 402 after the payment was already signed.
    let effectiveInit = init;
    if (res.status === 402 && this.wallet) {
      const { res: paidRes, paidInit } = await this.handleX402(res, url, init);
      res = paidRes;
      effectiveInit = paidInit; // carry payment headers into retry loop
    }

    // Retry on 5xx with exponential backoff
    if (res.status >= 500 && this.maxRetries > 0) {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
        res = await fetch(url, effectiveInit);
        if (res.status < 500) break;
      }
    }

    return res;
  }

  private async post(path: string, body: Record<string, unknown>, extra: Record<string, string> = {}): Promise<Response> {
    const url = `${this.baseURL}${path}`;
    const init: RequestInit = {
      method: "POST",
      headers: this.headers(extra),
      body: JSON.stringify(body),
    };
    return this.fetchWithRetry(url, init);
  }

  private buildChatBody(
    prompt: string,
    opts: ChatOptions,
    system?: string
  ): { body: Record<string, unknown>; extraHeaders: Record<string, string> } {
    const messages: Array<{ role: string; content: string }> = [];
    if (system ?? opts.system) {
      messages.push({ role: "system", content: (system ?? opts.system)! });
    }
    messages.push({ role: "user", content: prompt });

    const body: Record<string, unknown> = {
      model: opts.model ?? "arc-router",
      messages,
      budget: opts.budget ?? this.defaultBudget,
      stream: false,
    };

    if (opts.sessionId ?? this.defaultSessionId) body.session_id = opts.sessionId ?? this.defaultSessionId;
    if (opts.maxCost !== undefined) body.max_cost = opts.maxCost;
    if (opts.excludeModels?.length) body.exclude_models = opts.excludeModels;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts.workflowBudget) body.workflow_budget = opts.workflowBudget;

    const extraHeaders: Record<string, string> = {};
    if (opts.agentStep) extraHeaders["X-Agent-Step"] = opts.agentStep;

    return { body, extraHeaders };
  }

  /**
   * Route a prompt to the best model. Fast, single-model response.
   */
  async chat(prompt: string, opts: ChatOptions = {}): Promise<ArcRouterResponse> {
    const { body, extraHeaders } = this.buildChatBody(prompt, opts);
    const res = await this.post("/v1/chat/completions", body, extraHeaders);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ArcRouter API error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const raw = await res.json() as Record<string, unknown>;
    return {
      content: extractContent(raw),
      routing: extractRouting(raw),
      raw,
    };
  }

  /**
   * Multi-model consensus. Slower but higher confidence.
   */
  async council(prompt: string, opts: ChatOptions = {}): Promise<CouncilResponse> {
    const { body, extraHeaders } = this.buildChatBody(prompt, opts);
    body.mode = "council";

    const res = await this.post("/v1/chat/completions", body, extraHeaders);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ArcRouter council error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const raw = await res.json() as Record<string, unknown>;
    const consensus = (raw.consensus ?? {}) as Record<string, unknown>;

    return {
      content: extractContent(raw),
      confidence: Number(consensus.confidence ?? 0),
      votes: (consensus.votes as Vote[]) ?? [],
      synthesized: Boolean(consensus.synthesized ?? false),
      cached: Boolean(consensus.cached ?? false),
      raw,
    };
  }

  /**
   * Stream a response. Returns an async iterable of text chunks.
   */
  async *stream(prompt: string, opts: ChatOptions = {}): AsyncGenerator<string, void, unknown> {
    const { body, extraHeaders } = this.buildChatBody(prompt, opts);
    body.stream = true;

    const res = await this.post("/v1/chat/completions", body, extraHeaders);

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ArcRouter stream error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;

          try {
            const chunk = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) yield text;
          } catch {
            // Malformed chunk, skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * List models available in ArcRouter, filtered by topic and budget.
   */
  async models(opts: { topic?: string; budget?: Budget; limit?: number } = {}): Promise<ModelInfo[]> {
    const params = new URLSearchParams();
    if (opts.topic) params.set("topic", opts.topic);
    if (opts.budget) params.set("budget", opts.budget);
    if (opts.limit) params.set("limit", String(opts.limit));

    const res = await fetch(`${this.baseURL}/v1/models/scores?${params}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`ArcRouter models error ${res.status}`);
    }

    const data = await res.json() as Array<Record<string, unknown>>;
    return (Array.isArray(data) ? data : []).map(m => ({
      id: String(m.id ?? ""),
      name: String(m.name ?? ""),
      provider: String(m.provider ?? ""),
      inputPricePer1M: Number(m.input_price ?? 0),
      outputPricePer1M: Number(m.output_price ?? 0),
      contextLength: Number(m.context_length ?? 0),
      qualityScore: typeof m.quality_score === "number" ? m.quality_score : undefined,
      valueScore: typeof m.value_score === "number" ? m.value_score : undefined,
    }));
  }

  /**
   * Get usage statistics for your API key.
   */
  async usage(opts: { days?: number } = {}): Promise<UsageStats> {
    if (!this.apiKey) throw new Error("API key required for usage stats");

    const params = new URLSearchParams();
    if (opts.days) params.set("days", String(opts.days));

    const res = await fetch(`${this.baseURL}/v1/usage?${params}`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`ArcRouter usage error ${res.status}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const daily = (data.daily as Array<Record<string, unknown>> ?? []).map(d => ({
      date: String(d.date),
      requests: Number(d.requests ?? 0),
      costUsd: Number(d.cost_usd ?? 0),
    }));

    return {
      tier: String(data.tier ?? "unknown"),
      period: data.period as UsageStats["period"],
      totalRequests: Number(data.total_requests ?? 0),
      totalCostUsd: Number(data.total_cost_usd ?? 0),
      daily,
    };
  }

  /**
   * Get usage for a workflow session.
   */
  async workflowUsage(sessionId: string): Promise<WorkflowUsage> {
    const res = await fetch(`${this.baseURL}/v1/workflow/${encodeURIComponent(sessionId)}/usage`, {
      headers: this.headers(),
    });

    if (!res.ok) {
      throw new Error(`ArcRouter workflow usage error ${res.status}`);
    }

    return await res.json() as WorkflowUsage;
  }

  /**
   * Create a multi-step workflow with shared budget tracking.
   */
  workflow(opts: WorkflowOptions): ArcWorkflow {
    return new ArcWorkflow(this, opts);
  }

  /**
   * Returns a standard OpenAI client configured to use ArcRouter as the backend.
   * Drop-in replacement: just swap `new OpenAI(...)` for `arc.openai()`.
   */
  openai(): OpenAI {
    return new OpenAI({
      apiKey: this.apiKey ?? "no-key",
      baseURL: `${this.baseURL}/v1`,
      dangerouslyAllowBrowser: true,
    });
  }

  /**
   * Check ArcRouter system health.
   */
  async health(): Promise<{ healthy: boolean; checks: Record<string, string> }> {
    const res = await fetch(`${this.baseURL}/health`, { headers: this.headers() });
    return await res.json() as { healthy: boolean; checks: Record<string, string> };
  }
}

// ─── Default export + named exports ──────────────────────────────────────────

export default ArcRouter;
