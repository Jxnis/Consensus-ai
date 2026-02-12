import { ModelInfo, ComplexityTier, ConsensusRequest } from "../types";

/**
 * CouncilSelector — Selects diversified model councils based on complexity and budget.
 * 
 * KEY DESIGN: We never select premium-tier models ($10+/1M).
 * The whole point of consensus is achieving premium accuracy 
 * with cheaper models voting together. Using Opus/o1 in the council
 * defeats the purpose AND costs us money.
 */
export class CouncilSelector {
  // Cost ceiling per model — never select models above this
  private static MAX_MODEL_PRICE = 5.0; // $/1M tokens

  static selectModels(
    allModels: ModelInfo[],
    tier: ComplexityTier,
    request: ConsensusRequest
  ): ModelInfo[] {
    const { budget } = request;

    // Hard ceiling: exclude premium models entirely
    let candidates = allModels.filter(m => m.pricePer1M < this.MAX_MODEL_PRICE);

    // Filter by budget
    if (budget === "free") {
      candidates = candidates.filter(m => m.isFree);
    } else if (budget === "low") {
      candidates = candidates.filter(m => m.pricePer1M < 0.5);
    } else if (budget === "medium") {
      candidates = candidates.filter(m => m.pricePer1M < 5.0);
    }
    // "high" uses all candidates (up to smart tier, no premium)

    // Tier buckets
    const freeModels = candidates.filter(m => m.isFree);
    const cheapModels = candidates.filter(m => !m.isFree && m.pricePer1M < 1.0);
    const smartModels = candidates.filter(m => m.pricePer1M >= 1.0 && m.pricePer1M < 5.0);

    let selected: ModelInfo[] = [];

    switch (tier) {
      case "SIMPLE":
        // 2-3 cheap/free models
        selected = this.pickRandom(
          freeModels.length >= 3 ? freeModels : [...freeModels, ...cheapModels], 
          3
        );
        break;

      case "MEDIUM":
        // 4-5 models: mix of cheap + 1 smart
        selected = [
          ...this.pickRandom(cheapModels.length > 0 ? cheapModels : freeModels, 3),
          ...this.pickRandom(smartModels.length > 0 ? smartModels : cheapModels, 1),
          ...this.pickRandom(freeModels, 1),
        ];
        break;

      case "COMPLEX":
        // 5 models: 2 cheap + 3 smart — NO premium models
        selected = [
          ...this.pickRandom(cheapModels.length > 0 ? cheapModels : freeModels, 2),
          ...this.pickRandom(smartModels.length > 0 ? smartModels : cheapModels, 3),
        ];
        break;
    }

    // Deduplicate (in case same model was picked from overlapping pools)
    const seen = new Set<string>();
    selected = selected.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    // Fallback: if logic fails, grab cheapest available
    if (selected.length < 2) {
      selected = candidates.sort((a, b) => a.pricePer1M - b.pricePer1M).slice(0, 3);
    }

    return selected;
  }

  private static pickRandom(models: ModelInfo[], count: number): ModelInfo[] {
    if (models.length === 0) return [];
    const shuffled = [...models].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
}
