/**
 * Database Query Layer for Smart Routing
 *
 * Provides high-level query functions for the routing engine.
 * These functions abstract away SQL details and provide clean interfaces.
 */
import type { ComplexityTier } from "../types";
import { normalizeRoutingBudget, type RoutingBudget } from "../router/budget";

export type { RoutingBudget };

export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  input_price: number;
  output_price: number;
  context_length: number;
  quality_score?: number;
  value_score?: number;
  rank?: number;
}

const COMPLEXITY_WEIGHTS: Record<ComplexityTier, { quality: number; value: number }> = {
  SIMPLE: { quality: 0.3, value: 0.7 },
  MEDIUM: { quality: 0.5, value: 0.5 },
  COMPLEX: { quality: 0.8, value: 0.2 },
  REASONING: { quality: 0.9, value: 0.1 },
};

function getBudgetFilter(budget: RoutingBudget): string {
  // Free is a hard constraint. Paid budgets are preferences handled in ranking.
  if (budget === "free") {
    return " AND m.is_free = 1";
  }
  return " AND m.is_free = 0";
}

function getReasoningFilter(complexity: ComplexityTier): string {
  if (complexity !== "REASONING") {
    return "";
  }

  // Schema-safe heuristic until supports_reasoning is added as a real model column.
  return ` AND (
    lower(m.id) LIKE '%o3%' OR
    lower(m.id) LIKE '%o4%' OR
    lower(m.id) LIKE '%r1%' OR
    lower(m.id) LIKE '%qwq%' OR
    lower(m.id) LIKE '%reason%' OR
    lower(m.id) LIKE '%deepthink%'
  )`;
}

/**
 * Get the best model for a domain and budget
 * Returns null if no suitable model found
 *
 * Fallback logic:
 * 1. Try exact domain (e.g., 'code/security')
 * 2. If no results, try parent domain (e.g., 'code')
 * 3. If still no results, try 'general'
 */
export async function getBestModel(
  db: D1Database,
  domain: string,
  budget: string,
  complexity: ComplexityTier = "MEDIUM"
): Promise<ModelProfile | null> {
  const normalizedBudget = normalizeRoutingBudget(budget);

  // Try exact domain first
  let result = await queryBestModel(db, domain, normalizedBudget, complexity);

  // If no results and domain has a subcategory (e.g., 'code/security'), try parent
  if (!result && domain.includes('/')) {
    const parentDomain = domain.split('/')[0];
    result = await queryBestModel(db, parentDomain, normalizedBudget, complexity);
  }

  // If still no results, fall back to 'general'
  if (!result && domain !== 'general') {
    result = await queryBestModel(db, 'general', normalizedBudget, complexity);
  }

  return result;
}

/**
 * Query helper for getBestModel
 * Queries composite_scores table filtered by budget constraints
 */
async function queryBestModel(
  db: D1Database,
  domain: string,
  budget: RoutingBudget,
  complexity: ComplexityTier
): Promise<ModelProfile | null> {
  const { quality, value } = COMPLEXITY_WEIGHTS[complexity];

  let query = `
    SELECT
      m.id,
      m.name,
      m.provider,
      m.input_price_per_1m as input_price,
      m.output_price_per_1m as output_price,
      m.context_length,
      cs.quality_score,
      cs.value_score,
      cs.rank
    FROM composite_scores cs
    JOIN models m ON cs.model_id = m.id
    WHERE cs.domain = ?
      AND m.is_available = 1
  `;

  query += getBudgetFilter(budget);
  query += getReasoningFilter(complexity);
  query += ` ORDER BY (cs.quality_score * ? + cs.value_score * ?) DESC LIMIT 1`;

  const bindings: (string | number)[] = [domain, quality, value];

  const result = await db.prepare(query).bind(...bindings).first<ModelProfile>();

  return result || null;
}

/**
 * Get all models with their scores for a specific domain
 * Useful for showing alternatives or debugging
 */
export async function getModelsForDomain(
  db: D1Database,
  domain: string,
  budget?: string,
  complexity: ComplexityTier = "MEDIUM"
): Promise<ModelProfile[]> {
  const resolvedBudget = normalizeRoutingBudget(budget);

  let models = await queryModelsForDomain(db, domain, resolvedBudget, complexity);

  if (models.length === 0 && domain.includes("/")) {
    const parentDomain = domain.split("/")[0];
    console.log(`[queries] No models for '${domain}', trying parent '${parentDomain}'`);
    models = await queryModelsForDomain(db, parentDomain, resolvedBudget, complexity);
  }

  if (models.length === 0 && domain !== "general") {
    console.log(`[queries] No models for '${domain}', trying fallback 'general'`);
    models = await queryModelsForDomain(db, "general", resolvedBudget, complexity);
  }

  return models;
}

async function queryModelsForDomain(
  db: D1Database,
  domain: string,
  budget: RoutingBudget,
  complexity: ComplexityTier
): Promise<ModelProfile[]> {
  const { quality, value } = COMPLEXITY_WEIGHTS[complexity];

  let query = `
    SELECT
      m.id,
      m.name,
      m.provider,
      m.input_price_per_1m as input_price,
      m.output_price_per_1m as output_price,
      m.context_length,
      cs.quality_score,
      cs.value_score,
      cs.rank
    FROM composite_scores cs
    JOIN models m ON cs.model_id = m.id
    WHERE cs.domain = ?
      AND m.is_available = 1
  `;

  query += getBudgetFilter(budget);
  query += getReasoningFilter(complexity);
  query += ` ORDER BY (cs.quality_score * ? + cs.value_score * ?) DESC LIMIT 10`;

  const bindings: (string | number)[] = [domain, quality, value];

  const results = await db.prepare(query).bind(...bindings).all<ModelProfile>();

  return results.results || [];
}

/**
 * Get all available models (for /v1/models endpoint)
 */
export async function getAllModels(db: D1Database): Promise<ModelProfile[]> {
  const results = await db
    .prepare(
      `SELECT
        id,
        name,
        provider,
        input_price_per_1m as input_price,
        output_price_per_1m as output_price,
        context_length
      FROM models
      WHERE is_available = 1
      ORDER BY name`
    )
    .all<ModelProfile>();

  return results.results || [];
}

/**
 * Get a specific model by ID
 */
export async function getModelById(
  db: D1Database,
  modelId: string
): Promise<ModelProfile | null> {
  const result = await db
    .prepare(
      `SELECT
        id,
        name,
        provider,
        input_price_per_1m as input_price,
        output_price_per_1m as output_price,
        context_length
      FROM models
      WHERE id = ? AND is_available = 1`
    )
    .bind(modelId)
    .first<ModelProfile>();

  return result || null;
}

/**
 * Health check: verify database has data
 */
export async function checkDatabaseHealth(db: D1Database): Promise<{
  models: number;
  domains: number;
  scores: number;
  composite_scores: number;
}> {
  const models = await db.prepare(`SELECT COUNT(*) as count FROM models`).first<{ count: number }>();
  const domains = await db.prepare(`SELECT COUNT(*) as count FROM domains`).first<{ count: number }>();
  const scores = await db.prepare(`SELECT COUNT(*) as count FROM benchmark_scores`).first<{ count: number }>();
  const composite = await db.prepare(`SELECT COUNT(*) as count FROM composite_scores`).first<{ count: number }>();

  return {
    models: models?.count || 0,
    domains: domains?.count || 0,
    scores: scores?.count || 0,
    composite_scores: composite?.count || 0,
  };
}

/**
 * Get all models with their composite scores (for public API)
 * Returns structured data with scores grouped by domain
 */
export async function getAllModelsWithScores(db: D1Database): Promise<{
  models: Array<{
    id: string;
    name: string;
    provider: string;
    pricing: {
      input_per_1m: number;
      output_per_1m: number;
      is_free: boolean;
    };
    scores: Record<string, {
      quality: number;
      value: number;
      rank: number;
    }>;
    benchmarks: string[];
  }>;
  last_updated: string;
}> {
  // Get all models with their composite scores
  const results = await db
    .prepare(
      `SELECT
        m.id,
        m.name,
        m.provider,
        m.input_price_per_1m,
        m.output_price_per_1m,
        m.is_free,
        m.last_updated,
        cs.domain,
        cs.quality_score,
        cs.value_score,
        cs.rank
      FROM models m
      LEFT JOIN composite_scores cs ON m.id = cs.model_id
      WHERE m.is_available = 1
      ORDER BY m.name, cs.domain`
    )
    .all<{
      id: string;
      name: string;
      provider: string;
      input_price_per_1m: number;
      output_price_per_1m: number;
      is_free: boolean;
      last_updated: string;
      domain: string | null;
      quality_score: number | null;
      value_score: number | null;
      rank: number | null;
    }>();

  // Get benchmarks for each model
  const benchmarkResults = await db
    .prepare(
      `SELECT DISTINCT model_id, benchmark
       FROM benchmark_scores
       ORDER BY model_id, benchmark`
    )
    .all<{ model_id: string; benchmark: string }>();

  // Build lookup map for benchmarks
  const benchmarksByModel = new Map<string, string[]>();
  for (const row of benchmarkResults.results || []) {
    if (!benchmarksByModel.has(row.model_id)) {
      benchmarksByModel.set(row.model_id, []);
    }
    benchmarksByModel.get(row.model_id)!.push(row.benchmark);
  }

  // Group scores by model
  const modelMap = new Map<string, {
    id: string;
    name: string;
    provider: string;
    pricing: {
      input_per_1m: number;
      output_per_1m: number;
      is_free: boolean;
    };
    scores: Record<string, {
      quality: number;
      value: number;
      rank: number;
    }>;
    benchmarks: string[];
    last_updated: string;
  }>();

  for (const row of results.results || []) {
    if (!modelMap.has(row.id)) {
      modelMap.set(row.id, {
        id: row.id,
        name: row.name,
        provider: row.provider,
        pricing: {
          input_per_1m: row.input_price_per_1m,
          output_per_1m: row.output_price_per_1m,
          is_free: Boolean(row.is_free),
        },
        scores: {},
        benchmarks: benchmarksByModel.get(row.id) || [],
        last_updated: row.last_updated,
      });
    }

    // Add score for this domain
    if (row.domain && row.quality_score !== null && row.value_score !== null && row.rank !== null) {
      modelMap.get(row.id)!.scores[row.domain] = {
        quality: row.quality_score,
        value: row.value_score,
        rank: row.rank,
      };
    }
  }

  // Find most recent update timestamp
  const allModels = Array.from(modelMap.values());
  const lastUpdated = allModels.length > 0
    ? allModels.reduce((latest, model) =>
        model.last_updated > latest ? model.last_updated : latest,
        allModels[0].last_updated
      )
    : new Date().toISOString();

  return {
    models: allModels,
    last_updated: lastUpdated,
  };
}
