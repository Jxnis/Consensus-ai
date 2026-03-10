import OpenAI from "openai";
import { ConsensusRequest, ConsensusResponse, ComplexityTier, ModelInfo, CloudflareBindings } from "../types";
import { CouncilSelector } from "./selector";
import { ConsensusMatcher } from "./matcher";
// NOTE: ModelCrawler intentionally NOT imported — we use whitelist-only selection now

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

    // 1. WHITELIST-ONLY model selection — NO crawler, NO dynamic discovery
    // The crawler was pulling in 200+ models including garbage like openrouter/bodybuilder
    // that returns JSON routing instructions instead of actual answers.
    const allModels: ModelInfo[] = this.getWhitelistedModels();

    // 2. Select council from whitelist
    let selectedModels = CouncilSelector.selectModels(allModels, tier, request);

    if (selectedModels.length === 0) {
      throw new Error("No suitable models found for this request.");
    }

    // 2.5 Budget guardrails — downshift to cheaper models if estimated cost breaches budget policy.
    selectedModels = this.applyBudgetGuardrails(selectedModels, allModels, prompt, normalizedBudget);

    // 3. Race models in parallel — NO Wave 2, NO backup models
    // Every model in the council is verified to work. If one fails, we proceed with fewer.
    console.log(`[CouncilEngine] Council for "${tier}" request (${selectedModels.length} models):`);
    selectedModels.forEach(m => console.log(`  - ${m.name} (${m.id}) | $${m.pricePer1M.toFixed(4)}/1M`));

    // Target 3 responses for all tiers
    const targetCount = Math.min(3, selectedModels.length);

    let results = await this.raceModels(prompt, selectedModels, targetCount, tier, []);  // NO backups
    let isDegraded = false;

    // If fewer than 2 models responded from whitelist, mark as degraded
    // NO emergency fallback — only whitelisted models are allowed
    if (results.length < 2) {
      isDegraded = true;
      console.warn(`[CouncilEngine] Council degraded — only ${results.length} model(s) responded from whitelist. No emergency fallback.`);
    }

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

    // TASK-A4: Deliberation round logic
    let topGroup = groups[0];
    const round1Groups = groups.length;
    let round2GroupCount: number | undefined = undefined;
    let deliberationTriggered = false;
    let deliberationRounds = 1;
    let finalAnswer = topGroup.answer;
    let confidence = topGroup.count / results.length;
    let modelUsed = topGroup.models[0];
    let synthesized = false;
    let usedChairman = false;
    let round1ResultsForCost: typeof results = []; // COST-BUG FIX: Track Round 1 for accurate cost telemetry

    // 5. Check agreement: if top group has majority, skip deliberation (FAST PATH)
    // True majority = more than 50%. floor(n/2) + 1 ensures >50% for all n:
    // n=3: floor(1.5)+1 = 2 (66.7%) | n=4: floor(2)+1 = 3 (75%) | n=5: floor(2.5)+1 = 3 (60%)
    // Previous bugs: ceil(n/2+1) required unanimity; ceil(n/2) accepted 50% ties
    const majorityThreshold = Math.floor(results.length / 2) + 1;
    const hasMajority = topGroup.count >= majorityThreshold;

    if (hasMajority) {
      console.log(`[CouncilEngine] FAST PATH: ${topGroup.count}/${results.length} models agree (≥${majorityThreshold}). Skipping deliberation.`);
    } else {
      // TASK-A4: DELIBERATION ROUND — models disagree, give them a second chance
      deliberationTriggered = true;
      deliberationRounds = 2;
      console.log(`[CouncilEngine] DELIBERATION: ${topGroup.count}/${results.length} models agree (<${majorityThreshold}). Firing Round 2...`);

      // Build deliberation prompt with all Round 1 answers (anonymized)
      const deliberationPrompt = this.buildDeliberationPrompt(prompt, results);

      // Fire SAME models again with deliberation context (reuse existing models)
      const respondedModels = results.map(r =>
        selectedModels.find(m => m.id === r.model)  // BUG-1 FIX: Use ID for reliable lookups
      ).filter((m): m is ModelInfo => m !== undefined);

      const round2Results = await this.raceModels(deliberationPrompt, respondedModels, respondedModels.length, tier, []);  // BUG-2 FIX: Try to get ALL Round 1 respondents back

      if (round2Results.length > 0) {
        console.log(`[CouncilEngine] Round 2: ${round2Results.length} models responded.`);

        // Re-group Round 2 responses
        const round2GroupsArray = await ConsensusMatcher.groupSimilarResponses(
          round2Results,
          this.openai,
          embeddingCache,
          isFreeTier
        );

        if (round2GroupsArray.length > 0) {
          topGroup = round2GroupsArray[0];
          confidence = topGroup.count / round2Results.length;
          modelUsed = topGroup.models[0];
          finalAnswer = topGroup.answer;
          round2GroupCount = round2GroupsArray.length;
          // COST-BUG FIX: Save Round 1 results before overwriting (needed for accurate cost telemetry)
          round1ResultsForCost = [...results];
          results = round2Results; // Use Round 2 for final votes
          console.log(`[CouncilEngine] Round 2 result: ${topGroup.count}/${round2Results.length} models agree.`);
        }
      } else {
        console.warn(`[CouncilEngine] Round 2 failed: no models responded. Using Round 1 results.`);
      }
    }

    // 6. Compute final votes
    const agreingModelNames = new Set(topGroup.models);
    const votesWithAgreement = results.map(r => ({
      model: r.model,
      answer: r.answer,
      agrees: agreingModelNames.has(r.model)
    }));

    // 7. Chairman synthesis if still no clear consensus (after deliberation)
    if (confidence < 0.6 && tier !== "SIMPLE" && request.budget !== "free") {
      console.log(`[CouncilEngine] Still low confidence (${confidence.toFixed(2)}) after ${deliberationRounds} rounds. Escalating to Chairman...`);

      const chairmanResponse = await this.openai.chat.completions.create({
        model: "deepseek/deepseek-chat",  // BUG-3 FIX: Stronger model for synthesis (79.9% GPQA, cheap at $0.27/M)
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
      modelUsed = "CHAIRMAN (DeepSeek V3.2)";  // LEFTOVER-1 FIX: Update label to match model
      synthesized = true;
      usedChairman = true;
    }

    const estimatedInputTokens = Math.max(1, Math.ceil(prompt.length / 4));
    const estimateOutputTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));
    const selectedById = new Map(selectedModels.map(m => [m.id, m]));  // LEFTOVER-2 FIX: Use ID not name (results now store model.id)

    // COST-BUG FIX: Accumulate costs across ALL rounds (Round 1 + Round 2 if deliberation happened)
    const allResultsForCost = deliberationTriggered
      ? [...round1ResultsForCost, ...results]
      : results;

    const estimatedModelCostUsd = allResultsForCost.reduce((sum, r) => {
      const model = selectedById.get(r.model);  // LEFTOVER-2 FIX: Lookup by ID
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

    // COST-BUG FIX: Calculate actual chairman cost based on tokens (DeepSeek: $0.14/M input, $0.28/M output)
    let estimatedChairmanCostUsd = 0;
    if (usedChairman) {
      const chairmanSystemPrompt = "You are the Chairman of an AI Council. Analyze multiple conflicting responses and synthesize the most accurate, neutral, and helpful answer. Return ONLY the final synthesized answer.";
      const chairmanUserPrompt = `Prompt: ${prompt}\n\nCouncil Responses:\n${results.map((r, i) => `Model ${i + 1} (${r.model}): ${r.answer}`).join("\n\n")}`;
      const chairmanInputTokens = Math.ceil((chairmanSystemPrompt.length + chairmanUserPrompt.length) / 4);
      const chairmanOutputTokens = estimateOutputTokens(finalAnswer);
      estimatedChairmanCostUsd = (chairmanInputTokens / 1_000_000) * 0.14 + (chairmanOutputTokens / 1_000_000) * 0.28;
    }
    const estimatedTotalCostUsd = estimatedModelCostUsd + estimatedEmbeddingCostUsd + estimatedChairmanCostUsd;

    const consensusResponse: ConsensusResponse = {
      answer: finalAnswer,
      confidence,
      ...(synthesized ? { synthesized: true } : {}),
      ...(isDegraded ? { degraded: true } : {}),  // FIX-10: Flag degraded councils
      deliberation: {  // TASK-A4: Deliberation metadata
        triggered: deliberationTriggered,
        rounds: deliberationRounds,
        round1_groups: round1Groups,
        ...(round2GroupCount !== undefined ? { round2_groups: round2GroupCount } : {}),
        chairman_used: usedChairman,
      },
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
      try {
        await this.kv.put(cacheKey, JSON.stringify(consensusResponse), {
          expirationTtl: 86400 // 24 hours
        });
      } catch (err) {
        console.error("[ResultCache] Failed to cache consensus result (non-critical):", err instanceof Error ? err.message : err);
      }
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
      let activeRequests = 0;
      let isResolved = false;
      let minWaitElapsed = false;

      // Hard timeout — 25s max, then resolve with whatever we have
      const hardTimeout = setTimeout(() => {
        if (!isResolved) {
          console.log(`[CouncilEngine] Racing timeout after 25s. Got ${results.length}/${targetCount} results.`);
          controller.abort();
          isResolved = true;
          resolve(results);
        }
      }, 25000);

      // Minimum wait of 3s before resolving, even if targetCount hit early.
      setTimeout(() => {
        minWaitElapsed = true;
        tryResolve();
      }, 3000);

      const tryResolve = () => {
        if (isResolved) return;

        // Resolve after minimum wait + enough results
        if (results.length >= targetCount && minWaitElapsed) {
          clearTimeout(hardTimeout);
          controller.abort();
          isResolved = true;
          console.log(`[CouncilEngine] Council formed: ${results.length} models responded (target was ${targetCount}).`);
          resolve(results);
          return;
        }

        // All requests finished but below target — no Wave 2, just accept what we got
        if (activeRequests === 0) {
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
            results.push({ model: model.id, answer: content });  // BUG-1 FIX: Use ID for reliable lookups
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

      // Wave 1: Fire all selected models (Wave 2 REMOVED — only whitelisted models)
      models.forEach(model => fireModel(model));
    });
  }

  /**
   * TASK-A4: Build deliberation prompt with Round 1 answers.
   * Models see all other responses (anonymized) and reconsider.
   */
  private buildDeliberationPrompt(
    originalPrompt: string,
    round1Results: { model: string; answer: string }[]
  ): string {
    const anonymizedResponses = round1Results
      .map((r, i) => `Model ${String.fromCharCode(65 + i)}: ${r.answer}`)
      .join("\n\n");

    return `You were asked: "${originalPrompt}"

Here are the responses from other AI models (anonymized):

${anonymizedResponses}

Some of these responses disagree. Please carefully consider all perspectives, identify which reasoning is strongest, and provide your final answer.
Focus on accuracy and correctness over agreeing with the majority.`;
  }

  private getUtcDayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async incrementCounter(key: string): Promise<void> {
    try {
      const current = await this.kv.get(key);
      const count = current ? parseInt(current, 10) : 0;
      await this.kv.put(key, String(count + 1), { expirationTtl: CouncilEngine.METRICS_TTL_SECONDS });
    } catch (err) {
      // Don't crash requests if metrics KV writes fail (e.g., daily write limit exceeded)
      console.error(`[Metrics] Failed to increment counter ${key}:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * WHITELIST-ONLY model registry.
   * Every model here has been verified to:
   * 1. Return actual content (not JSON routing instructions)
   * 2. Respond within 25s
   * 3. Follow the system prompt format
   * 
   * DO NOT add models without testing them first.
   * The crawler was pulling in garbage like openrouter/bodybuilder.
   */
  private getWhitelistedModels(): ModelInfo[] {
    return [
      // === FREE TIER (verified working) ===
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", provider: "Meta", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 131072 },
      { id: "qwen/qwen3-next-80b-a3b-instruct:free", name: "Qwen3 Next 80B", provider: "Qwen", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 262144 },
      { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B", provider: "Google", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 131072 },
      { id: "mistralai/mistral-small-3.1-24b-instruct:free", name: "Mistral Small 3.1 24B", provider: "Mistral", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      { id: "deepseek/deepseek-r1-0528:free", name: "DeepSeek R1", provider: "DeepSeek", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 163840 },

      // === PAID TIER (verified working, quality-ranked) ===
      // Tier 1: Frontier-class
      { id: "z-ai/glm-5", name: "GLM-5", provider: "Zhipu AI", pricePer1M: 1.0, inputPrice: 1.0, outputPrice: 1.0, isFree: false, contextLength: 131072 },

      // Tier 2: Strong reasoning, verified benchmarks
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3.2", provider: "DeepSeek", pricePer1M: 0.27, inputPrice: 0.14, outputPrice: 0.28, isFree: false, contextLength: 65536 },
      { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", provider: "Qwen", pricePer1M: 0.50, inputPrice: 0.40, outputPrice: 0.60, isFree: false, contextLength: 131072 },
      { id: "mistralai/mistral-large-2512", name: "Mistral Large", provider: "Mistral", pricePer1M: 2.0, inputPrice: 2.0, outputPrice: 6.0, isFree: false, contextLength: 131072 },

      // NOTE: Kimi K2.5 EXCLUDED — 600s/question, always times out in 25s race
      // NOTE: inception/mercury* EXCLUDED — unverified quality, short answers
      // NOTE: kwaipilot/kat-coder-pro EXCLUDED — unverified, coder-oriented
      // NOTE: openrouter/bodybuilder EXCLUDED — returns JSON, not answers
      // NOTE: google/gemini-3.1-pro EXCLUDED — $0.015/call, way too expensive for council
    ];
  }
}
