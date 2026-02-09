import { ModelInfo, ComplexityTier, ConsensusRequest } from "../types";

export class CouncilSelector {
  /**
   * Selects a diversified pool of models based on complexity, budget, and reliability
   */
  static selectModels(
    allModels: ModelInfo[],
    tier: ComplexityTier,
    request: ConsensusRequest
  ): ModelInfo[] {
    const { budget, reliability } = request;

    // 1. Filter by Budget
    let candidates = allModels;
    if (budget === "free") {
      candidates = allModels.filter(m => m.isFree);
    } else if (budget === "low") {
      candidates = allModels.filter(m => m.pricePer1M < 0.5);
    } else if (budget === "medium") {
      candidates = allModels.filter(m => m.pricePer1M < 5.0);
    }

    // 2. Identify Tier Buckets
    const freeModels = candidates.filter(m => m.isFree);
    const cheapModels = candidates.filter(m => !m.isFree && m.pricePer1M < 1.0);
    const smartModels = candidates.filter(m => m.pricePer1M >= 1.0 && m.pricePer1M < 10.0);
    const premiumModels = candidates.filter(m => m.pricePer1M >= 10.0);

    // 3. Diversified Selection Logic
    let selected: ModelInfo[] = [];

    switch (tier) {
      case "SIMPLE":
        // 3 Cheap/Free models
        selected = this.pickRandom(candidates.filter(m => m.pricePer1M < 0.2), 3);
        break;

      case "MEDIUM":
        // 5 Models: mix of cheap and 1 smart
        selected = [
          ...this.pickRandom(cheapModels.length > 0 ? cheapModels : freeModels, 4),
          ...this.pickRandom(smartModels.length > 0 ? smartModels : cheapModels, 1)
        ];
        break;

      case "COMPLEX":
        // 5-7 Models: Heavy on smart models
        if (reliability === "high") {
            selected = [
                ...this.pickRandom(smartModels, 3),
                ...this.pickRandom(premiumModels.length > 0 ? premiumModels : smartModels, 2)
            ];
        } else {
            selected = [
                ...this.pickRandom(cheapModels, 2),
                ...this.pickRandom(smartModels, 3)
            ];
        }
        break;
    }

    // Fallback: If logic fails to pick enough, just grab the cheapest safest ones
    if (selected.length < 3) {
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
