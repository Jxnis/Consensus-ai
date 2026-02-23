import OpenAI from "openai";
import { ConsensusRequest, ConsensusResponse, ComplexityTier, ModelInfo, CloudflareBindings } from "../types";
import { ModelCrawler } from "./crawler";
import { CouncilSelector } from "./selector";
import { ConsensusMatcher } from "./matcher";

export class CouncilEngine {
  private openai: OpenAI;
  private kv: KVNamespace;
  private apiKey: string;
  private static METRICS_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

  constructor(env: CloudflareBindings) {
    this.apiKey = env.OPENROUTER_API_KEY;
    this.kv = env.CONSENSUS_CACHE;
    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: this.apiKey,
    });
  }

  async runConsensus(
    request: ConsensusRequest,
    tier: ComplexityTier
  ): Promise<ConsensusResponse> {
    const { prompt } = request;
    const normalizedBudget = request.budget ?? "free";

    // 0. Cache lookup
    const cacheScope = `${prompt}::${normalizedBudget}::${tier}`;
    const cacheKey = await this.hashPrompt(cacheScope);
    const cached = await this.kv.get(cacheKey);
    if (cached) {
      await this.incrementCounter(`metrics:${this.getUtcDayKey()}:cache_hit`);
      console.log(`[CouncilEngine] Cache HIT for prompt hash: ${cacheKey.slice(0, 8)}`);
      return { ...(JSON.parse(cached) as ConsensusResponse), cached: true };
    }
    await this.incrementCounter(`metrics:${this.getUtcDayKey()}:cache_miss`);

    // 1. Get model registry — merge crawled + reliable fallback models
    let allModels: ModelInfo[];
    try {
      const crawledModels = await ModelCrawler.getModels(this.kv, this.apiKey);
      // Merge: fallback models ensure reliability, crawled models add variety
      const fallbackModels = this.getFallbackModels();
      const crawledIds = new Set(crawledModels.map(m => m.id));
      const uniqueFallbacks = fallbackModels.filter(m => !crawledIds.has(m.id));
      allModels = [...crawledModels, ...uniqueFallbacks];
    } catch (error) {
      console.error("[CouncilEngine] OpenRouter API failed. Using fallback model list.", error);
      allModels = this.getFallbackModels();
    }

    // 2. Select council
    let selectedModels = CouncilSelector.selectModels(allModels, tier, request);

    if (selectedModels.length === 0) {
      throw new Error("No suitable models found for this request.");
    }

    // 2.5 Budget guardrails — downshift to cheaper models if estimated cost breaches budget policy.
    selectedModels = this.applyBudgetGuardrails(selectedModels, allModels, prompt, normalizedBudget);

    // 3. Race models in parallel
    console.log(`[CouncilEngine] Council for "${tier}" request (${selectedModels.length} models):`);
    selectedModels.forEach(m => console.log(`  - ${m.name} | $${m.pricePer1M.toFixed(4)}/1M`));

    // Minimum 3 responses for all tiers — a "council" of 1-2 is meaningless
    const baseTargetCount = tier === "COMPLEX" ? 4 : 3;
    const targetCount = Math.min(baseTargetCount, selectedModels.length);

    // 31-FIX-2: Prepare backup models for Wave 2 racing
    const selectedIds = new Set(selectedModels.map(m => m.id));
    const budgetFilter = normalizedBudget === "free"
      ? (m: ModelInfo) => m.isFree
      : (m: ModelInfo) => true;
    const backupModels = allModels
      .filter(m => !selectedIds.has(m.id) && budgetFilter(m))
      .sort((a, b) => a.pricePer1M - b.pricePer1M)
      .slice(0, 4);

    const results = await this.raceModels(prompt, selectedModels, targetCount, tier, backupModels);

    if (results.length === 0) {
      throw new Error("All models in the council failed. Please check connectivity.");
    }

    // 4. Semantic grouping
    // Use request-scoped embedding cache to prevent memory leak across Worker requests
    const embeddingCache = new Map<string, number[]>();
    const isFreeTier = request.budget === "free";

    const groups = await ConsensusMatcher.groupSimilarResponses(
      results,
      this.openai,
      embeddingCache,
      isFreeTier
    );

    // Guard: if grouping returns empty (should not happen but defensive)
    if (!groups.length) {
      console.warn("[CouncilEngine] Grouping returned no groups. Falling back to first result.");
      const fallback = results[0];
      return {
        answer: fallback.answer,
        confidence: 1 / results.length,
        votes: results.map(r => ({ model: r.model, answer: r.answer, agrees: r.model === fallback.model })),
        complexity: tier,
        cached: false,
        model_used: fallback.model
      };
    }

    const topGroup = groups[0];

    // 5. Compute votes — reuse grouping results (no extra embedding calls)
    const agreingModelNames = new Set(topGroup.models);
    const votesWithAgreement = results.map(r => ({
      model: r.model,
      answer: r.answer,
      agrees: agreingModelNames.has(r.model)
    }));

    // 6. Chairman synthesis if confidence is low (paid tiers only)
    let finalAnswer = topGroup.answer;
    let confidence = topGroup.count / results.length;
    let modelUsed = topGroup.models[0];
    let synthesized = false;
    let usedChairman = false;

    if (confidence < 0.6 && tier !== "SIMPLE" && request.budget !== "free") {
      console.log(`[CouncilEngine] Low confidence (${confidence.toFixed(2)}). Escalating to Chairman...`);

      const chairmanResponse = await this.openai.chat.completions.create({
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "system",
            content: "You are the Chairman of an AI Council. Analyze multiple conflicting responses and synthesize the most accurate, neutral, and helpful answer. Return ONLY the final synthesized answer."
          },
          {
            role: "user",
            content: `Prompt: ${prompt}\n\nCouncil Responses:\n${results.map((r, i) => `Model ${i + 1} (${r.model}): ${r.answer}`).join("\n\n")}`
          }
        ],
        temperature: 0.1
      });

      finalAnswer = chairmanResponse.choices[0]?.message?.content || finalAnswer;
      modelUsed = "CHAIRMAN (Gemini 2.0 Flash)";
      synthesized = true;
      usedChairman = true;
    }

    const estimatedInputTokens = Math.max(1, Math.ceil(prompt.length / 4));
    const estimateOutputTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));
    const selectedByName = new Map(selectedModels.map(m => [m.name, m]));

    const estimatedModelCostUsd = results.reduce((sum, r) => {
      const model = selectedByName.get(r.model);
      if (!model) return sum;
      const inputCost = (estimatedInputTokens / 1_000_000) * model.inputPrice;
      const outputCost = (estimateOutputTokens(r.answer) / 1_000_000) * model.outputPrice;
      return sum + inputCost + outputCost;
    }, 0);

    const usedEmbeddings = !isFreeTier;
    // Approximate embedding cost for text-embedding-3-small input pricing.
    const embeddingPricePer1M = 0.02;
    const estimatedEmbeddingTokens = usedEmbeddings
      ? results.reduce((sum, r) => sum + Math.max(1, Math.ceil(r.answer.length / 4)), 0)
      : 0;
    const estimatedEmbeddingCostUsd = usedEmbeddings
      ? (estimatedEmbeddingTokens / 1_000_000) * embeddingPricePer1M
      : 0;

    const estimatedChairmanCostUsd = usedChairman ? 0.0002 : 0;
    const estimatedTotalCostUsd = estimatedModelCostUsd + estimatedEmbeddingCostUsd + estimatedChairmanCostUsd;

    const consensusResponse: ConsensusResponse = {
      answer: finalAnswer,
      confidence,
      ...(synthesized ? { synthesized: true } : {}),
      monitoring: {
        selectedModels: selectedModels.map(m => m.name),
        respondedModels: results.map(r => r.model),
        usedChairman,
        usedEmbeddings,
        estimatedModelCostUsd,
        estimatedEmbeddingCostUsd,
        estimatedChairmanCostUsd,
        estimatedTotalCostUsd,
      },
      votes: votesWithAgreement,
      complexity: tier,
      cached: false,
      model_used: modelUsed
    };

    // 7. Cache high-confidence results
    if (consensusResponse.confidence > 0.8) {
      await this.kv.put(cacheKey, JSON.stringify(consensusResponse), {
        expirationTtl: 86400 // 24 hours
      });
    }

    return consensusResponse;
  }

  private async hashPrompt(prompt: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(prompt.trim().toLowerCase());
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // 31-FIX-3: Fixed budget guardrails — raised caps and added graceful degradation
  private applyBudgetGuardrails(
    selectedModels: ModelInfo[],
    allModels: ModelInfo[],
    prompt: string,
    budget: "free" | "low" | "medium" | "high"
  ): ModelInfo[] {
    const capByBudget: Record<"free" | "low" | "medium" | "high", number> = {
      free: 0,
      low: 0.01,     // 31-FIX-3: was 0.003 — too tight for 3-model councils
      medium: 0.03,  // 31-FIX-3: raised proportionally
      high: 0.10,    // 31-FIX-3: raised from 0.08
    };

    if (budget === "free") return selectedModels;

    const cap = capByBudget[budget];
    const estimated = this.estimateCouncilCost(selectedModels, prompt);
    if (estimated <= cap) return selectedModels;

    console.warn(`[BUDGET_GUARDRAIL] budget=${budget}, cap=$${cap}, estimated=$${estimated.toFixed(6)}, models=${selectedModels.map(m => m.id).join(', ')}`);

    const minCouncilSize = 2; // 31-FIX-3: reduced from 3 to allow graceful degradation
    const candidatePool = [...allModels]
      .filter(m => !m.isFree) // paid models only for paid budget
      .sort((a, b) => a.pricePer1M - b.pricePer1M);

    const downshifted: ModelInfo[] = [];
    for (const model of candidatePool) {
      if (downshifted.some(m => m.id === model.id)) continue;
      downshifted.push(model);
      if (downshifted.length >= selectedModels.length) break;
    }

    if (downshifted.length < minCouncilSize) {
      console.error(`[BUDGET_GUARDRAIL] Cannot satisfy even minimum council size of ${minCouncilSize}.`);
      throw new Error("[BUDGET_GUARDRAIL] Budget policy cannot satisfy minimum council size.");
    }

    // Try with full downshifted set first, then progressively reduce
    for (let size = Math.min(selectedModels.length, downshifted.length); size >= minCouncilSize; size--) {
      const trimmed = downshifted.slice(0, size);
      const trimmedEstimated = this.estimateCouncilCost(trimmed, prompt);
      if (trimmedEstimated <= cap) {
        console.log(
          `[CouncilEngine] Budget guardrail: est $${estimated.toFixed(6)} -> $${trimmedEstimated.toFixed(6)} (${trimmed.length} models) for budget=${budget}.`
        );
        return trimmed;
      }
    }

    // 31-FIX-3: Last resort — try with just the single cheapest model instead of throwing 500
    const cheapest = downshifted.slice(0, 1);
    const cheapestEstimate = this.estimateCouncilCost(cheapest, prompt);
    if (cheapestEstimate <= cap) {
      console.warn(`[BUDGET_GUARDRAIL] Reduced to single cheapest model to fit budget.`);
      return cheapest;
    }

    console.error(`[BUDGET_GUARDRAIL] Even single cheapest model ($${cheapestEstimate.toFixed(6)}) exceeds cap ($${cap}). Rejecting.`);
    throw new Error("[BUDGET_GUARDRAIL] Estimated request cost exceeds budget policy.");
  }

  private estimateCouncilCost(models: ModelInfo[], prompt: string): number {
    const estimatedInputTokens = Math.max(1, Math.ceil(prompt.length / 4));
    const estimatedOutputTokens = 600;

    return models.reduce((sum, model) => {
      const inputCost = (estimatedInputTokens / 1_000_000) * model.inputPrice;
      const outputCost = (estimatedOutputTokens / 1_000_000) * model.outputPrice;
      return sum + inputCost + outputCost;
    }, 0);
  }

  // 31-FIX-2: Two-wave racing strategy to guarantee council formation
  // 31-FIX-4: Complexity-aware max_tokens to reduce latency
  private async raceModels(
    prompt: string,
    models: ModelInfo[],
    targetCount: number,
    tier: ComplexityTier = "SIMPLE",
    backupModels: ModelInfo[] = []
  ): Promise<{ model: string; answer: string }[]> {
    const results: { model: string; answer: string }[] = [];
    const controller = new AbortController();

    // 31-FIX-4: Reduce max_tokens for simple questions
    const maxTokens = tier === "SIMPLE" ? 500 : tier === "MEDIUM" ? 800 : 1200;

    return new Promise((resolve) => {
      let activeRequests = 0; // fireModel() increments this per call
      let isResolved = false;
      let wave2Fired = false;
      let minWaitElapsed = false;

      // Hard timeout — resolve with whatever we have (25s to give Wave 2 time)
      const hardTimeout = setTimeout(() => {
        if (!isResolved) {
          console.log(`[CouncilEngine] Racing timeout after 25s. Got ${results.length}/${targetCount} results.`);
          controller.abort();
          isResolved = true;
          resolve(results);
        }
      }, 25000);

      // 31-FIX-4: Minimum wait of 3s before resolving, even if targetCount hit early.
      // Collects extra votes for better consensus without adding latency (most models take >3s).
      setTimeout(() => {
        minWaitElapsed = true;
        tryResolve();
      }, 3000);

      const tryResolve = () => {
        if (isResolved) return;

        // Only resolve after minimum wait + enough results
        if (results.length >= targetCount && minWaitElapsed) {
          clearTimeout(hardTimeout);
          controller.abort();
          isResolved = true;
          console.log(`[CouncilEngine] Council formed: ${results.length} models responded (target was ${targetCount}).`);
          resolve(results);
          return;
        }

        // All requests finished (both waves) but below target
        if (activeRequests === 0 && (wave2Fired || backupModels.length === 0)) {
          clearTimeout(hardTimeout);
          isResolved = true;
          console.log(`[CouncilEngine] All models finished. Got ${results.length}/${targetCount} results.`);
          resolve(results);
        }
      };

      // Fire a single model request
      const fireModel = (model: ModelInfo) => {
        activeRequests++;
        this.openai.chat.completions.create({
          model: model.id,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: maxTokens,
        }, { signal: controller.signal }).then(response => {
          if (controller.signal.aborted) return;
          const content = response.choices[0]?.message?.content || "";
          if (content.trim()) {
            results.push({ model: model.name, answer: content });
          } else {
            void this.incrementCounter(`model_failure:${model.id}:empty_response`);
          }
          tryResolve();
        }).catch(err => {
          if (err.name === "AbortError") {
            void this.incrementCounter(`model_failure:${model.id}:timeout`);
            return;
          }
          void this.incrementCounter(`model_failure:${model.id}:provider_error`);
          console.error(`[CouncilEngine] Model ${model.name} failed:`, err.message);
        }).finally(() => {
          activeRequests--;
          tryResolve();
        });
      };

      // Wave 1: Fire all selected models
      models.forEach(model => fireModel(model));

      // 31-FIX-2: Wave 2 — if after 8s we still don't have enough responses, fire backups
      if (backupModels.length > 0) {
        setTimeout(() => {
          if (isResolved) return;
          if (results.length < targetCount) {
            wave2Fired = true;
            console.log(`[CouncilEngine] Wave 2: ${results.length}/${targetCount} responses. Firing ${backupModels.length} backup models.`);
            backupModels.forEach(model => fireModel(model));
          } else {
            wave2Fired = true; // Mark as done so tryResolve works
          }
        }, 8000);
      }
    });
  }

  private getUtcDayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async incrementCounter(key: string): Promise<void> {
    const current = await this.kv.get(key);
    const count = current ? parseInt(current, 10) : 0;
    await this.kv.put(key, String(count + 1), { expirationTtl: CouncilEngine.METRICS_TTL_SECONDS });
  }

  // 31-FIX-5: Updated fallback models list (verified 2026-02-23 against OpenRouter /models)
  private getFallbackModels(): ModelInfo[] {
    return [
      // Reliable free models — 10 models to ensure ≥3 always respond
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", provider: "Meta", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 131072 },
      { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B", provider: "Google", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 131072 },
      { id: "google/gemma-3-12b-it:free", name: "Gemma 3 12B", provider: "Google", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      { id: "qwen/qwen3-4b:free", name: "Qwen3 4B", provider: "Qwen", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen3 Next 80B", provider: "Qwen", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 262144 },
      { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 24B", provider: "Mistral", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      { id: "deepseek/deepseek-r1-0528:free", name: "DeepSeek R1", provider: "DeepSeek", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 163840 },
      { id: "nvidia/nemotron-nano-9b-v2:free", name: "Nemotron Nano 9B", provider: "NVIDIA", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      { id: "nvidia/nemotron-3-nano-30b-a3b:free", name: "Nemotron 3 Nano 30B", provider: "NVIDIA", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 256000 },
      { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Llama 3.2 3B", provider: "Meta", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 131072 },
      // Cheap paid models — 31-FIX-5: fixed stale model IDs
      { id: "google/gemini-2.0-flash-lite-001", name: "Gemini 2.0 Flash Lite", provider: "Google", pricePer1M: 0.075, inputPrice: 0.075, outputPrice: 0.30, isFree: false, contextLength: 1048576 },
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", pricePer1M: 0.15, inputPrice: 0.15, outputPrice: 0.60, isFree: false, contextLength: 128000 },
      { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", provider: "Google", pricePer1M: 0.10, inputPrice: 0.10, outputPrice: 0.40, isFree: false, contextLength: 1048576 },
      { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", pricePer1M: 0.25, inputPrice: 0.25, outputPrice: 1.25, isFree: false, contextLength: 200000 },
      { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B", provider: "Meta", pricePer1M: 0.35, inputPrice: 0.35, outputPrice: 0.40, isFree: false, contextLength: 131072 },
      { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", pricePer1M: 2.50, inputPrice: 2.50, outputPrice: 10.0, isFree: false, contextLength: 128000 },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", pricePer1M: 1.25, inputPrice: 1.25, outputPrice: 10.0, isFree: false, contextLength: 1048576 },
    ];
  }
}
