/**
 * OpenRouter Pricing Scraper
 *
 * Fetches current pricing for all models from OpenRouter's /models API
 * and updates the models table in SCORE_DB.
 *
 * This is the ONLY place models get their pricing data.
 * If OpenRouter changes prices, our routing adapts automatically.
 *
 * Run via:
 * 1. Scheduled cron trigger (daily)
 * 2. Manual: POST /admin/sync-pricing
 */

import { recalculateScores } from '../score-calculator';

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string; // Price per token (e.g., "0.00000028")
    completion: string;
  };
  context_length: number;
  architecture?: {
    modality?: string;
  };
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

/**
 * Scrape OpenRouter models API and update pricing in SCORE_DB
 */
export async function scrapeOpenRouterPricing(
  db: D1Database,
  openrouterApiKey: string
): Promise<{ updated: number; errors: string[] }> {
  console.log('[openrouter-pricing] Fetching models from OpenRouter...');

  const errors: string[] = [];
  let updated = 0;

  try {
    // Fetch all models from OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        'HTTP-Referer': 'https://councilrouter.ai',
        'X-Title': 'CouncilRouter',
      },
    });

    if (!response.ok) {
      const error = `OpenRouter API error: ${response.status} ${response.statusText}`;
      errors.push(error);
      console.error(`[openrouter-pricing] ${error}`);
      return { updated: 0, errors };
    }

    const data = (await response.json()) as OpenRouterModelsResponse;
    console.log(`[openrouter-pricing] Fetched ${data.data.length} models from OpenRouter`);

    // Get all models currently in our database
    const dbModels = await db
      .prepare(`SELECT id FROM models`)
      .all<{ id: string }>();

    const dbModelIds = new Set(dbModels.results?.map((m) => m.id) || []);

    // Insert or update models from OpenRouter
    // This will populate the database with all available models, not just the initial 5
    for (const orModel of data.data) {
      try {
        // Convert per-token price to per-1M-tokens price
        const inputPricePer1M = parseFloat(orModel.pricing.prompt) * 1_000_000;
        const outputPricePer1M = parseFloat(orModel.pricing.completion) * 1_000_000;

        // Determine if free (both prices are zero)
        const isFree = inputPricePer1M === 0 && outputPricePer1M === 0;

        // Extract provider from model ID (e.g., 'anthropic/claude-3-5-sonnet' → 'anthropic')
        const provider = orModel.id.includes('/') ? orModel.id.split('/')[0] : 'Unknown';

        // Use INSERT OR REPLACE to handle both new and existing models
        await db
          .prepare(
            `INSERT INTO models (id, name, provider, input_price_per_1m, output_price_per_1m,
                                 context_length, is_free, is_available, latency_p50_ms,
                                 reliability_pct, last_updated)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               provider = excluded.provider,
               input_price_per_1m = excluded.input_price_per_1m,
               output_price_per_1m = excluded.output_price_per_1m,
               context_length = excluded.context_length,
               is_free = excluded.is_free,
               is_available = 1,
               last_updated = excluded.last_updated`
          )
          .bind(
            orModel.id,
            orModel.name,
            provider,
            inputPricePer1M,
            outputPricePer1M,
            orModel.context_length,
            isFree ? 1 : 0,
            new Date().toISOString()
          )
          .run();

        updated++;

        // Only log if it's a new model or if we're in verbose mode
        if (!dbModelIds.has(orModel.id)) {
          console.log(
            `[openrouter-pricing] NEW model added: ${orModel.id} (${orModel.name}): $${inputPricePer1M.toFixed(2)}/$${outputPricePer1M.toFixed(2)} per 1M`
          );
        } else if (updated % 50 === 0) {
          // Log progress every 50 models
          console.log(`[openrouter-pricing] Progress: ${updated} models processed...`);
        }
      } catch (err) {
        const error = `Failed to upsert ${orModel.id}: ${err}`;
        errors.push(error);
        console.error(`[openrouter-pricing] ${error}`);
      }
    }

    // Mark models as unavailable if they're in our DB but not in OpenRouter response
    const orModelIds = new Set(data.data.map((m) => m.id));
    for (const dbModelId of dbModelIds) {
      if (!orModelIds.has(dbModelId)) {
        await db
          .prepare(`UPDATE models SET is_available = 0, last_updated = ? WHERE id = ?`)
          .bind(new Date().toISOString(), dbModelId)
          .run();

        console.log(`[openrouter-pricing] Marked ${dbModelId} as unavailable`);
      }
    }

    // Recalculate value scores after pricing update
    console.log('[openrouter-pricing] Recalculating value scores...');
    await recalculateScores(db);

    console.log(`[openrouter-pricing] Complete. Updated ${updated} models.`);
    return { updated, errors };
  } catch (err) {
    const error = `OpenRouter pricing scrape failed: ${err}`;
    errors.push(error);
    console.error(`[openrouter-pricing] ${error}`);
    return { updated, errors };
  }
}

/**
 * Get pricing summary for a specific model
 */
export async function getModelPricing(
  db: D1Database,
  modelId: string
): Promise<{
  id: string;
  name: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
  is_available: boolean;
  last_updated: string;
} | null> {
  const result = await db
    .prepare(
      `SELECT id, name, input_price_per_1m, output_price_per_1m, is_available, last_updated
       FROM models
       WHERE id = ?`
    )
    .bind(modelId)
    .first<{
      id: string;
      name: string;
      input_price_per_1m: number;
      output_price_per_1m: number;
      is_available: boolean;
      last_updated: string;
    }>();

  return result || null;
}
