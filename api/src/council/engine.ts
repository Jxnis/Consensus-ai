import OpenAI from "openai";
import { ConsensusRequest, ConsensusResponse, ComplexityTier, ModelInfo, CloudflareBindings } from "../types";
import { ModelCrawler } from "./crawler";
import { CouncilSelector } from "./selector";
import { ConsensusMatcher } from "./matcher";

export class CouncilEngine {
  private openai: OpenAI;
  private kv: KVNamespace;
  private apiKey: string;

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
      console.log(`[CouncilEngine] Cache HIT for prompt hash: ${cacheKey.slice(0, 8)}`);
      return { ...(JSON.parse(cached) as ConsensusResponse), cached: true };
    }

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
    const results = await this.raceModels(prompt, selectedModels, targetCount);

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
    }

    const consensusResponse: ConsensusResponse = {
      answer: finalAnswer,
      confidence,
      ...(synthesized ? { synthesized: true } : {}),
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

  private applyBudgetGuardrails(
    selectedModels: ModelInfo[],
    allModels: ModelInfo[],
    prompt: string,
    budget: "free" | "low" | "medium" | "high"
  ): ModelInfo[] {
    const capByBudget: Record<"free" | "low" | "medium" | "high", number> = {
      free: 0,
      low: 0.003,
      medium: 0.02,
      high: 0.08,
    };

    if (budget === "free") return selectedModels;

    const cap = capByBudget[budget];
    const estimated = this.estimateCouncilCost(selectedModels, prompt);
    if (estimated <= cap) return selectedModels;

    const minCouncilSize = 3;
    const candidatePool = [...allModels]
      .sort((a, b) => a.pricePer1M - b.pricePer1M);

    const downshifted: ModelInfo[] = [];
    for (const model of candidatePool) {
      if (downshifted.some(m => m.id === model.id)) continue;
      downshifted.push(model);
      if (downshifted.length >= selectedModels.length) break;
    }

    if (downshifted.length < minCouncilSize) {
      throw new Error("[BUDGET_GUARDRAIL] Budget policy cannot satisfy minimum council size.");
    }

    const trimmed = downshifted.slice(0, Math.max(minCouncilSize, Math.min(selectedModels.length, downshifted.length)));
    const trimmedEstimated = this.estimateCouncilCost(trimmed, prompt);
    if (trimmedEstimated > cap) {
      throw new Error("[BUDGET_GUARDRAIL] Estimated request cost exceeds budget policy.");
    }

    console.log(
      `[CouncilEngine] Budget guardrail downshift: est $${estimated.toFixed(6)} -> $${trimmedEstimated.toFixed(6)} for budget=${budget}.`
    );
    return trimmed;
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

  private async raceModels(
    prompt: string,
    models: ModelInfo[],
    targetCount: number
  ): Promise<{ model: string; answer: string }[]> {
    const results: { model: string; answer: string }[] = [];
    const controller = new AbortController();

    return new Promise((resolve) => {
      let activeRequests = models.length;
      let isResolved = false;

      // Hard timeout — resolve with whatever we have
      const timeout = setTimeout(() => {
        if (!isResolved) {
          console.log(`[CouncilEngine] Racing timeout after 20s. Got ${results.length}/${targetCount} results.`);
          controller.abort();
          isResolved = true;
          resolve(results);
        }
      }, 20000);

      const tryResolve = () => {
        if (isResolved) return;
        // Resolve immediately once we hit targetCount
        if (results.length >= targetCount) {
          clearTimeout(timeout);
          controller.abort();
          isResolved = true;
          resolve(results);
          return;
        }
        // All requests finished but below target — resolve with what we have
        if (activeRequests === 0) {
          clearTimeout(timeout);
          isResolved = true;
          console.log(`[CouncilEngine] All models finished. Got ${results.length}/${targetCount} results.`);
          resolve(results);
        }
      };

      models.forEach(model => {
        this.openai.chat.completions.create({
          model: model.id,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 1000,
        }, { signal: controller.signal }).then(response => {
          if (controller.signal.aborted) return;
          const content = response.choices[0]?.message?.content || "";
          if (content.trim()) {
            results.push({ model: model.name, answer: content });
          }
          tryResolve();
        }).catch(err => {
          if (err.name === "AbortError") return;
          console.error(`[CouncilEngine] Model ${model.name} failed:`, err.message);
        }).finally(() => {
          activeRequests--;
          tryResolve();
        });
      });
    });
  }

  private getFallbackModels(): ModelInfo[] {
    return [
      // Reliable free models (updated 2026-02-18)
      { id: "google/gemma-3-12b-it:free", name: "Gemma 3 12B", provider: "Google", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", provider: "Meta", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 131072 },
      { id: "meta-llama/llama-3.2-3b-instruct:free", name: "Llama 3.2 3B", provider: "Meta", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 8192 },
      { id: "qwen/qwen3-4b:free", name: "Qwen3 4B", provider: "Qwen", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 24B", provider: "Mistral", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      { id: "deepseek/deepseek-r1-0528:free", name: "DeepSeek R1", provider: "DeepSeek", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 65536 },
      { id: "nvidia/nemotron-nano-9b-v2:free", name: "Nemotron Nano 9B", provider: "NVIDIA", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      // Cheap paid models
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", pricePer1M: 0.15, inputPrice: 0.15, outputPrice: 0.60, isFree: false, contextLength: 128000 },
      { id: "google/gemini-flash-1.5", name: "Gemini 1.5 Flash", provider: "Google", pricePer1M: 0.075, inputPrice: 0.075, outputPrice: 0.30, isFree: false, contextLength: 1000000 },
      { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", pricePer1M: 0.25, inputPrice: 0.25, outputPrice: 1.25, isFree: false, contextLength: 200000 },
      { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B", provider: "Meta", pricePer1M: 0.35, inputPrice: 0.35, outputPrice: 0.40, isFree: false, contextLength: 131072 },
      { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", pricePer1M: 2.50, inputPrice: 2.50, outputPrice: 10.0, isFree: false, contextLength: 128000 },
      { id: "google/gemini-pro-1.5", name: "Gemini 1.5 Pro", provider: "Google", pricePer1M: 1.25, inputPrice: 1.25, outputPrice: 5.0, isFree: false, contextLength: 2000000 },
    ];
  }
}
