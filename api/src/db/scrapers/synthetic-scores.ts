/**
 * Synthetic Score Generator
 *
 * Generates estimated benchmark scores for models without real benchmark data.
 * This ensures ALL models in the registry can be selected by smart routing.
 *
 * Estimation strategies (applied in order of reliability):
 * 1. **Model family inference:** If a base model has scores, estimate variants
 *    proportionally (e.g., GPT-4o → GPT-4o-mini, Llama-3.1-405B → Llama-3.1-70B)
 * 2. **Price-quality correlation:** Fit a linear model from existing scored models
 * 3. **Parameter count correlation:** Larger models tend to score higher
 * 4. **Provider average:** Use average score of other models from same provider
 *
 * All synthetic scores are:
 * - Tagged with source='synthetic' (lowest weight in composite score calculation)
 * - Flagged in API responses
 * - Overwritten when real benchmark data becomes available
 *
 * Run via:
 * 1. After all scrapers complete
 * 2. Manual: POST /admin/generate-synthetic-scores
 */

import {
  ScraperResult,
  upsertBenchmarkScore,
} from './base';

interface ModelWithPricing {
  id: string;
  name: string;
  provider: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
  is_free: number;
}

interface ModelWithScores extends ModelWithPricing {
  avg_score: number;
  score_count: number;
}

/**
 * Model family relationships for inference
 * Maps model pattern → scaling factor relative to base model
 */
const FAMILY_SCALING: Record<string, number> = {
  // Size-based scaling
  'mini': 0.70,
  'small': 0.75,
  'medium': 0.85,
  'large': 1.00,
  'xl': 1.05,
  'xxl': 1.10,

  // Parameter-based scaling (relative to flagship)
  '7b': 0.65,
  '8b': 0.68,
  '14b': 0.75,
  '32b': 0.82,
  '70b': 0.90,
  '405b': 1.05,

  // Version numbers (newer = slight boost)
  'v2': 0.98,
  'v3': 1.00,
  'v3.2': 1.02,
  'v4': 1.05,
  'v5': 1.08,
};

/**
 * Provider quality tiers (baseline scores when no data available)
 * Based on historical performance of each provider's models
 */
const PROVIDER_BASELINES: Record<string, number> = {
  'Anthropic': 78,
  'OpenAI': 76,
  'Google': 74,
  'DeepSeek': 72,
  'Qwen': 70,
  'Meta': 68,
  'Mistral': 67,
  'Cohere': 65,
  'X.AI': 64,
  'Default': 60,  // Unknown providers
};

/**
 * Extract model family and variant info from model ID
 */
function parseModelId(modelId: string): {
  provider: string;
  family: string;
  variant: string;
  fullName: string;
} {
  const parts = modelId.split('/');
  const provider = parts[0] || '';
  const fullName = parts[1] || '';

  // Extract family (e.g., "gpt-4o" from "gpt-4o-mini")
  // Common patterns: name-variant, name-size, name-version
  const nameParts = fullName.toLowerCase().split(/[-_]/);
  const family = nameParts.slice(0, 2).join('-');
  const variant = nameParts.slice(2).join('-');

  return { provider, family, variant, fullName };
}

/**
 * Find scaling factor based on model variant
 */
function getVariantScaling(variant: string): number {
  const lower = variant.toLowerCase();

  // Check for exact matches first
  for (const [pattern, scale] of Object.entries(FAMILY_SCALING)) {
    if (lower.includes(pattern)) {
      return scale;
    }
  }

  return 1.0;  // No scaling if variant unknown
}

/**
 * Strategy 1: Infer score from model family
 */
function inferFromFamily(
  model: ModelWithPricing,
  domain: string,
  familyScores: Map<string, number>
): number | null {
  const { provider, family, variant } = parseModelId(model.id);
  const key = `${provider}::${family}::${domain}`;
  const baseScore = familyScores.get(key);
  if (baseScore === undefined) {
    return null;
  }

  const scaling = getVariantScaling(variant);
  return Math.max(0, Math.min(100, baseScore * scaling));
}

/**
 * Strategy 2: Price-quality correlation
 */
function inferFromPrice(
  model: ModelWithPricing,
  scoredModels: ModelWithScores[]
): number | null {
  if (scoredModels.length < 10) {
    return null;  // Need sufficient data for reliable correlation
  }

  const avgPrice = (model.input_price_per_1m + model.output_price_per_1m) / 2;

  // Free models get lower baseline
  if (model.is_free === 1) {
    return 50;
  }

  // Fit simple linear regression: score = a * log(price) + b
  // (Using log scale because price-quality is not linear)
  const validModels = scoredModels.filter(m => m.input_price_per_1m > 0);
  if (validModels.length < 10) {
    return null;
  }

  const prices = validModels.map(m => (m.input_price_per_1m + m.output_price_per_1m) / 2);
  const scores = validModels.map(m => m.avg_score);

  const logPrices = prices.map(p => Math.log(p + 0.001));
  const avgLogPrice = logPrices.reduce((sum, p) => sum + p, 0) / logPrices.length;
  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < logPrices.length; i++) {
    numerator += (logPrices[i] - avgLogPrice) * (scores[i] - avgScore);
    denominator += (logPrices[i] - avgLogPrice) ** 2;
  }

  if (denominator === 0) return null;

  const slope = numerator / denominator;
  const intercept = avgScore - slope * avgLogPrice;

  const predictedScore = slope * Math.log(avgPrice + 0.001) + intercept;
  return Math.max(0, Math.min(100, predictedScore));
}

/**
 * Strategy 3: Provider average
 */
function inferFromProvider(
  model: ModelWithPricing,
  domain: string,
  providerScores: Map<string, { avg: number; count: number }>
): number | null {
  const key = `${model.provider}::${domain}`;
  const entry = providerScores.get(key);
  if (!entry || entry.count < 3) {
    return null;
  }
  return entry.avg;
}

/**
 * Strategy 4: Provider baseline fallback
 */
function inferFromProviderBaseline(model: ModelWithPricing): number {
  return PROVIDER_BASELINES[model.provider] || PROVIDER_BASELINES.Default;
}

/**
 * Generate synthetic scores for all unscored models
 */
export async function generateSyntheticScores(db: D1Database): Promise<ScraperResult> {
  console.log('[synthetic] Generating synthetic scores for unscored models...');

  const errors: string[] = [];
  let updated = 0;

  try {
    // Get all models without scores
    const unscoredModels = await db
      .prepare(
        `SELECT m.id, m.name, m.provider, m.input_price_per_1m, m.output_price_per_1m, m.is_free
         FROM models m
         WHERE m.is_available = 1
         AND NOT EXISTS (
           SELECT 1 FROM benchmark_scores bs
           WHERE bs.model_id = m.id AND bs.source != 'synthetic'
         )`
      )
      .all<ModelWithPricing>();

    if (!unscoredModels.results || unscoredModels.results.length === 0) {
      console.log('[synthetic] No unscored models found. All models have real benchmarks.');
      return { updated: 0, errors, source: 'synthetic' };
    }

    console.log(`[synthetic] Found ${unscoredModels.results.length} unscored models`);

    // Get scored models for correlation analysis
    const scoredModels = await db
      .prepare(
        `SELECT m.id, m.name, m.provider, m.input_price_per_1m, m.output_price_per_1m, m.is_free,
                AVG(bs.score) as avg_score, COUNT(*) as score_count
         FROM models m
         JOIN benchmark_scores bs ON m.id = bs.model_id
         WHERE m.is_available = 1 AND bs.source != 'synthetic'
         GROUP BY m.id
         HAVING COUNT(*) >= 2`
      )
      .all<ModelWithScores>();

    const scoredModelsList = scoredModels.results || [];
    console.log(`[synthetic] Reference set: ${scoredModelsList.length} models with real scores`);

    // Precompute family scores by domain (max avg score per family)
    const scoredByModelDomain = await db
      .prepare(
        `SELECT m.id, bs.domain, AVG(bs.score) as avg_score
         FROM models m
         JOIN benchmark_scores bs ON m.id = bs.model_id
         WHERE m.is_available = 1 AND bs.source != 'synthetic'
         GROUP BY m.id, bs.domain`
      )
      .all<{ id: string; domain: string; avg_score: number }>();

    const familyScores = new Map<string, number>();
    for (const row of scoredByModelDomain.results || []) {
      const { provider, family } = parseModelId(row.id);
      const key = `${provider}::${family}::${row.domain}`;
      const existing = familyScores.get(key);
      if (existing === undefined || row.avg_score > existing) {
        familyScores.set(key, row.avg_score);
      }
    }

    // Precompute provider averages by domain
    const providerAverages = await db
      .prepare(
        `SELECT m.provider, bs.domain, AVG(bs.score) as avg_score, COUNT(*) as count
         FROM models m
         JOIN benchmark_scores bs ON m.id = bs.model_id
         WHERE m.is_available = 1 AND bs.source != 'synthetic'
         GROUP BY m.provider, bs.domain`
      )
      .all<{ provider: string; domain: string; avg_score: number; count: number }>();

    const providerScores = new Map<string, { avg: number; count: number }>();
    for (const row of providerAverages.results || []) {
      providerScores.set(`${row.provider}::${row.domain}`, { avg: row.avg_score, count: row.count });
    }

    // Top-level domains to generate scores for
    const domains = ['general', 'code', 'math', 'science', 'writing', 'reasoning'];
    const timestamp = new Date().toISOString();

    for (const model of unscoredModels.results) {
      for (const domain of domains) {
        let syntheticScore: number | null = null;
        let strategy = 'baseline';

        // Try strategies in order of reliability
        syntheticScore = inferFromFamily(model, domain, familyScores);
        if (syntheticScore !== null) {
          strategy = 'family';
        } else {
          syntheticScore = inferFromPrice(model, scoredModelsList);
          if (syntheticScore !== null) {
            strategy = 'price';
          } else {
            syntheticScore = inferFromProvider(model, domain, providerScores);
            if (syntheticScore !== null) {
              strategy = 'provider_avg';
            } else {
              syntheticScore = inferFromProviderBaseline(model);
              strategy = 'provider_baseline';
            }
          }
        }

        if (syntheticScore === null || isNaN(syntheticScore)) {
          continue;
        }

        // Insert synthetic score
        const success = await upsertBenchmarkScore(db, {
          modelId: model.id,
          benchmark: `synthetic_${domain}`,
          domain,
          score: syntheticScore,
          rawScore: syntheticScore,
          source: 'synthetic',
          sourceUrl: `strategy:${strategy}`,
          measuredAt: timestamp,
        });

        if (success) {
          updated++;
        } else {
          errors.push(`Failed to insert synthetic score for ${model.id}/${domain}`);
        }
      }

      console.log(`[synthetic] Generated scores for ${model.id} (${model.name})`);
    }

    console.log(
      `[synthetic] Complete. Generated ${updated} synthetic scores for ${unscoredModels.results.length} models.`
    );

    return {
      updated,
      errors,
      source: 'synthetic',
      models_matched: unscoredModels.results.length,
    };
  } catch (err) {
    const error = `Synthetic score generation failed: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(error);
    console.error(`[synthetic] ${error}`);
    return {
      updated,
      errors,
      source: 'synthetic',
    };
  }
}
