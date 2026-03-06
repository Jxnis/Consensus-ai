/**
 * Value Score Calculation Algorithm
 *
 * Calculates composite quality and value scores per model per domain.
 * This is the core of the smart routing engine - models are selected based on value_score.
 *
 * Algorithm:
 * 1. Quality score = weighted average of benchmark scores for this (model, domain)
 * 2. Value score = quality / (1 + normalized_cost × cost_sensitivity)
 * 3. Rank models within each domain by value_score
 */

export interface SourceWeight {
  [source: string]: number;
}

export interface CompositeScore {
  model_id: string;
  domain: string;
  quality_score: number;
  value_score: number;
  rank: number;
  last_calculated: string;
}

// Source reliability weights
// Higher weight = more trustworthy
const SOURCE_WEIGHTS: SourceWeight = {
  our_benchmark: 3.0,   // Our own tested scores — highest trust
  livebench: 2.0,       // Rotated questions, anti-contamination
  huggingface: 1.5,     // Standard but potentially contaminated
  provider_claim: 0.5,  // Self-reported, lowest trust
};

// Cost sensitivity per budget tier
// Higher value = more penalty for expensive models
const COST_SENSITIVITY: Record<string, number> = {
  free: Infinity,     // Only free models (cost becomes infinite if not free)
  low: 2.0,          // Heavily penalize expensive models
  medium: 1.0,       // Balanced quality vs cost
  high: 0.3,         // Mostly ignore cost, optimize for quality
};

/**
 * Calculate quality score for a model in a domain
 * Quality = weighted average of all benchmark scores
 */
async function calculateQualityScore(
  db: D1Database,
  modelId: string,
  domain: string
): Promise<number | null> {
  // Get all benchmark scores for this (model, domain) or parent domain
  const scores = await db
    .prepare(
      `SELECT score, source
       FROM benchmark_scores
       WHERE model_id = ? AND (domain = ? OR domain LIKE ?)
       ORDER BY measured_at DESC`
    )
    .bind(modelId, domain, `${domain}/%`)
    .all();

  if (!scores.results || scores.results.length === 0) {
    return null;
  }

  // Calculate weighted average
  let weightedSum = 0;
  let totalWeight = 0;

  for (const row of scores.results as Array<{ score: number; source: string }>) {
    const weight = SOURCE_WEIGHTS[row.source] || 1.0;
    weightedSum += row.score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Calculate normalized cost for a model
 * Returns a value in [0, 1] where 1 = most expensive model
 */
async function calculateNormalizedCost(
  db: D1Database,
  modelId: string
): Promise<number> {
  const model = await db
    .prepare(`SELECT input_price_per_1m, output_price_per_1m, is_free FROM models WHERE id = ?`)
    .bind(modelId)
    .first<{ input_price_per_1m: number; output_price_per_1m: number; is_free: boolean }>();

  if (!model) {
    return 1.0; // Unknown model = treat as expensive
  }

  if (model.is_free) {
    return 0; // Free models have zero cost
  }

  // Average of input and output price (rough approximation)
  const avgPrice = (model.input_price_per_1m + model.output_price_per_1m) / 2;

  // Get max price across all models for normalization
  const maxPrice = await db
    .prepare(
      `SELECT MAX((input_price_per_1m + output_price_per_1m) / 2) as max_price FROM models WHERE is_free = 0`
    )
    .first<{ max_price: number }>();

  const maxPriceValue = maxPrice?.max_price || 10.0; // Fallback to $10/1M if empty

  return Math.min(avgPrice / maxPriceValue, 1.0);
}

/**
 * Calculate value score for a model in a domain
 * Value = quality / (1 + normalized_cost × cost_sensitivity)
 */
async function calculateValueScore(
  db: D1Database,
  modelId: string,
  domain: string,
  budget: string = 'medium'
): Promise<number | null> {
  const qualityScore = await calculateQualityScore(db, modelId, domain);
  if (qualityScore === null) {
    return null;
  }

  const normalizedCost = await calculateNormalizedCost(db, modelId);
  const sensitivity = COST_SENSITIVITY[budget] || 1.0;

  // For free tier, only free models get a score
  if (budget === 'free') {
    return normalizedCost === 0 ? qualityScore : null;
  }

  // Value score formula
  const valueScore = qualityScore / (1 + normalizedCost * sensitivity);

  return valueScore;
}

/**
 * Recalculate all composite scores for all models and domains
 * This should run:
 * 1. After any benchmark scrape completes
 * 2. After any pricing update
 * 3. On demand via /admin/recalculate-scores
 */
export async function recalculateScores(db: D1Database): Promise<void> {
  console.log('[score-calculator] Recalculating composite scores...');

  // Get all available models
  const models = await db
    .prepare(`SELECT id FROM models WHERE is_available = 1`)
    .all<{ id: string }>();

  if (!models.results || models.results.length === 0) {
    console.log('[score-calculator] No available models found');
    return;
  }

  // Get top-level domains only (we calculate for top-level, subcategories inherit)
  const topLevelDomains = await db
    .prepare(`SELECT id FROM domains WHERE parent IS NULL`)
    .all<{ id: string }>();

  if (!topLevelDomains.results || topLevelDomains.results.length === 0) {
    console.log('[score-calculator] No domains found');
    return;
  }

  // Clear existing composite scores
  await db.prepare(`DELETE FROM composite_scores`).run();

  const timestamp = new Date().toISOString();
  const compositeScores: CompositeScore[] = [];

  // Calculate scores for each (model, domain) combination
  for (const model of models.results) {
    for (const domain of topLevelDomains.results) {
      const qualityScore = await calculateQualityScore(db, model.id, domain.id);

      if (qualityScore === null) {
        continue; // Skip if no benchmark data
      }

      // Calculate value score for medium budget as default
      const valueScore = await calculateValueScore(db, model.id, domain.id, 'medium');

      if (valueScore === null) {
        continue;
      }

      compositeScores.push({
        model_id: model.id,
        domain: domain.id,
        quality_score: qualityScore,
        value_score: valueScore,
        rank: 0, // Will be calculated after sorting
        last_calculated: timestamp,
      });
    }
  }

  // Sort by domain and value_score to calculate ranks
  const scoresByDomain = new Map<string, CompositeScore[]>();
  for (const score of compositeScores) {
    if (!scoresByDomain.has(score.domain)) {
      scoresByDomain.set(score.domain, []);
    }
    scoresByDomain.get(score.domain)!.push(score);
  }

  // Assign ranks within each domain
  for (const [domain, scores] of scoresByDomain.entries()) {
    scores.sort((a, b) => b.value_score - a.value_score); // Descending order
    scores.forEach((score, index) => {
      score.rank = index + 1;
    });
  }

  // Insert all composite scores
  for (const score of compositeScores) {
    await db
      .prepare(
        `INSERT INTO composite_scores (model_id, domain, quality_score, value_score, rank, last_calculated)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        score.model_id,
        score.domain,
        score.quality_score,
        score.value_score,
        score.rank,
        score.last_calculated
      )
      .run();
  }

  console.log(`[score-calculator] Calculated ${compositeScores.length} composite scores`);
}
