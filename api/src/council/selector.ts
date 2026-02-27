import { ModelInfo, ComplexityTier, ConsensusRequest } from "../types";

/**
 * CouncilSelector — Selects diversified model councils based on complexity and budget.
 * TASK-A3: Replaced random selection with quality-ranked selection.
 *
 * KEY DESIGN: Quality > diversity. Use the best models available within budget.
 * Model IDs verified against OpenRouter /models endpoint (Feb 27, 2026).
 */
export class CouncilSelector {
  // TASK-A3: Quality ranking map (1 = best, 5 = weakest)
  // Based on published benchmarks: GPQA Diamond, MMLU-Pro, reasoning capability
  private static MODEL_QUALITY_RANKING: Record<string, number> = {
    // === FREE TIER (quality-ranked) ===
    "nousresearch/hermes-3-llama-3.1-405b:free": 1,  // 405B, strong reasoning
    "meta-llama/llama-3.3-70b-instruct:free": 1,      // Best free model overall
    "qwen/qwen3-next-80b-a3b-instruct:free": 2,       // Strong reasoning
    "google/gemma-3-27b-it:free": 2,                  // Google's best free model
    "mistralai/mistral-small-3.1-24b-instruct:free": 3, // Good for coding/instruction

    // === PAID TIER (quality-ranked) ===
    "moonshotai/kimi-k2.5": 1,                        // 87.6% GPQA Diamond — frontier-class
    "z-ai/glm-5": 1,                                  // 86.0% GPQA Diamond — near-frontier
    "deepseek/deepseek-chat": 2,                      // 79.9% GPQA, strong reasoning, very cheap
    "qwen/qwen-2.5-72b-instruct": 2,                  // Excellent all-rounder
    "mistralai/mistral-large-2512": 2,                // Strong reasoning
  };

  static selectModels(
    allModels: ModelInfo[],
    tier: ComplexityTier,
    request: ConsensusRequest
  ): ModelInfo[] {
    const { budget } = request;

    // TASK-A3: Budget filtering (removed MAX_MODEL_PRICE ceiling — let budget handle it)
    let candidates: ModelInfo[];
    if (budget === "free") {
      candidates = allModels.filter(m => m.isFree);
    } else if (budget === "low") {
      candidates = allModels.filter(m => m.pricePer1M < 0.5);
    } else if (budget === "medium") {
      candidates = allModels.filter(m => m.pricePer1M < 5.0);
    } else {
      // "high" — use all models except premium ($10+)
      candidates = allModels.filter(m => m.pricePer1M < 10.0);
    }

    // TASK-A3: Quality-ranked selection
    let selected: ModelInfo[] = [];

    switch (tier) {
      case "SIMPLE":
        // Select 5 quality-ranked free/cheap models (targetCount=3 + 2 backups)
        selected = this.pickByQuality(
          candidates.filter(m => m.isFree || m.pricePer1M < 1.0),
          5  // CONCERN-1 FIX: Reduced from 10 to targetCount + 2
        );
        break;

      case "MEDIUM":
        // Select 5 quality-ranked models (targetCount=3 + 2 backups): prioritize cheap+smart over free
        const cheapAndSmart = candidates.filter(m => !m.isFree && m.pricePer1M < 5.0);
        selected = this.pickByQuality(
          cheapAndSmart.length >= 3 ? cheapAndSmart : candidates,
          5  // CONCERN-1 FIX: Reduced from 8 to targetCount + 2
        );
        break;

      case "COMPLEX":
        // Select 6 quality-ranked models (targetCount=4 + 2 backups): prioritize smart tier (1-5 $/1M)
        const smartTier = candidates.filter(m => m.pricePer1M >= 0.5 && m.pricePer1M < 5.0);
        selected = this.pickByQuality(
          smartTier.length >= 4 ? smartTier : candidates,
          6  // CONCERN-1 FIX: Reduced from 8 to targetCount + 2
        );
        break;
    }

    // Fallback: ensure minimum 3 models
    if (selected.length < 3) {
      const seen = new Set(selected.map(m => m.id));
      const remaining = candidates.filter(m => !seen.has(m.id));
      const needed = 3 - selected.length;
      selected.push(...this.pickByQuality(remaining, needed));
    }

    return selected;
  }

  /**
   * TASK-A3: Quality-ranked selection with provider diversity.
   * Replaces pickRandom() with intelligent selection.
   */
  private static pickByQuality(models: ModelInfo[], count: number): ModelInfo[] {
    if (models.length === 0) return [];

    // Sort by quality ranking (lower number = better quality)
    const sorted = [...models].sort((a, b) => {
      const qualityA = this.MODEL_QUALITY_RANKING[a.id] ?? 4; // Unknown models = tier 4
      const qualityB = this.MODEL_QUALITY_RANKING[b.id] ?? 4;

      if (qualityA !== qualityB) {
        return qualityA - qualityB; // Better quality first
      }
      // Tie-break: cheaper first (better value)
      return a.pricePer1M - b.pricePer1M;
    });

    // Select top N models with provider diversity
    const selected: ModelInfo[] = [];
    const providerCounts = new Map<string, number>();

    for (const model of sorted) {
      if (selected.length >= count) break;

      // Enforce diversity: max 2 models per provider (avoid 3× DeepSeek)
      const providerCount = providerCounts.get(model.provider) ?? 0;
      if (providerCount >= 2) continue;

      selected.push(model);
      providerCounts.set(model.provider, providerCount + 1);
    }

    // If still need more models (due to diversity constraint), add remaining
    if (selected.length < count) {
      const selectedIds = new Set(selected.map(m => m.id));
      const remaining = sorted.filter(m => !selectedIds.has(m.id));
      selected.push(...remaining.slice(0, count - selected.length));
    }

    return selected;
  }
}
