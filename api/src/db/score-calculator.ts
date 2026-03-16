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
  our_benchmark: 3.0,      // Our own tested scores — highest trust
  livebench: 2.0,          // Rotated questions, anti-contamination
  livecodebench: 2.0,      // Contamination-free coding benchmark
  chatbot_arena: 2.0,      // LMSYS crowdsourced rankings — large sample size
  bigcodebench: 2.0,       // Comprehensive real-world code tasks
  alpaca_eval: 1.8,        // Instruction-following quality (GPT-4 baseline)
  huggingface: 1.5,        // Standard but potentially contaminated
  provider_claim: 0.5,     // Self-reported, lowest trust
  synthetic: 0.3,          // Estimated scores, lowest weight
};

// Cost sensitivity per budget tier
// Higher value = more penalty for expensive models
const COST_SENSITIVITY: Record<string, number> = {
  free: Infinity,     // Only free models (cost becomes infinite if not free)
  low: 2.0,          // Heavily penalize expensive models
  medium: 1.0,       // Balanced quality vs cost
  high: 0.3,         // Mostly ignore cost, optimize for quality
};

interface ModelCostInfo {
  id: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
  is_free: number;
}

function getTopLevelDomain(domain: string): string {
  return domain.split("/")[0];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
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
  const INSERT_BATCH_SIZE = 200;

  // Get all available model cost metadata in one query.
  const models = await db
    .prepare(
      `SELECT id, input_price_per_1m, output_price_per_1m, is_free
       FROM models
       WHERE is_available = 1`
    )
    .all<ModelCostInfo>();

  if (!models.results || models.results.length === 0) {
    console.log('[score-calculator] No available models found');
    return;
  }

  const modelRows = models.results;

  // Top-level domains only (subcategories inherit).
  const topLevelDomains = await db
    .prepare(`SELECT id FROM domains WHERE parent IS NULL`)
    .all<{ id: string }>();

  if (!topLevelDomains.results || topLevelDomains.results.length === 0) {
    console.log('[score-calculator] No domains found');
    return;
  }
  const topLevelDomainSet = new Set(topLevelDomains.results.map((d) => d.id));

  // Pull benchmark rows once to avoid O(models * domains) query explosion.
  const benchmarkRows = await db
    .prepare(
      `SELECT bs.model_id, bs.domain, bs.score, bs.source
       FROM benchmark_scores bs
       JOIN models m ON m.id = bs.model_id
       WHERE m.is_available = 1`
    )
    .all<{ model_id: string; domain: string; score: number; source: string }>();

  // Aggregate weighted quality by (model, topLevelDomain).
  const qualityAccumulator = new Map<string, { weightedSum: number; totalWeight: number }>();
  for (const row of benchmarkRows.results || []) {
    const topLevelDomain = getTopLevelDomain(row.domain);
    if (!topLevelDomainSet.has(topLevelDomain)) continue;

    const key = `${row.model_id}::${topLevelDomain}`;
    const current = qualityAccumulator.get(key) || { weightedSum: 0, totalWeight: 0 };
    const weight = SOURCE_WEIGHTS[row.source] || 1.0;
    current.weightedSum += row.score * weight;
    current.totalWeight += weight;
    qualityAccumulator.set(key, current);
  }

  const nonFreeAveragePrices = modelRows
    .filter((m) => m.is_free !== 1)
    .map((m) => (m.input_price_per_1m + m.output_price_per_1m) / 2);
  const maxPrice = nonFreeAveragePrices.length > 0
    ? Math.max(...nonFreeAveragePrices)
    : 10.0;

  const modelNormalizedCost = new Map<string, number>();
  for (const model of modelRows) {
    if (model.is_free === 1) {
      modelNormalizedCost.set(model.id, 0);
      continue;
    }
    const avgPrice = (model.input_price_per_1m + model.output_price_per_1m) / 2;
    modelNormalizedCost.set(model.id, Math.min(avgPrice / maxPrice, 1.0));
  }

  // Medium budget is the default ranking used by the router.
  const sensitivity = COST_SENSITIVITY.medium ?? 1.0;

  const timestamp = new Date().toISOString();
  const compositeScores: CompositeScore[] = [];

  for (const [key, quality] of qualityAccumulator.entries()) {
    if (quality.totalWeight <= 0) continue;

    const [modelId, domain] = key.split("::");
    const qualityScore = quality.weightedSum / quality.totalWeight;
    const normalizedCost = modelNormalizedCost.get(modelId) ?? 1.0;
    const valueScore = qualityScore / (1 + normalizedCost * sensitivity);

    compositeScores.push({
      model_id: modelId,
      domain,
      quality_score: qualityScore,
      value_score: valueScore,
      rank: 0,
      last_calculated: timestamp,
    });
  }

  // Sort and rank by domain.
  const scoresByDomain = new Map<string, CompositeScore[]>();
  for (const score of compositeScores) {
    if (!scoresByDomain.has(score.domain)) {
      scoresByDomain.set(score.domain, []);
    }
    scoresByDomain.get(score.domain)!.push(score);
  }

  for (const [domain, scores] of scoresByDomain.entries()) {
    scores.sort((a, b) => b.value_score - a.value_score); // Descending order
    scores.forEach((score, index) => {
      score.rank = index + 1;
    });
  }

  // Replace all scores atomically-ish (delete then batched inserts).
  await db.prepare(`DELETE FROM composite_scores`).run();

  for (const batch of chunkArray(compositeScores, INSERT_BATCH_SIZE)) {
    const statements = batch.map((score) =>
      db
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
    );
    await db.batch(statements);
  }

  console.log(`[score-calculator] Calculated ${compositeScores.length} composite scores`);
}
