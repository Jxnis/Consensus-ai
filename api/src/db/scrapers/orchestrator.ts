/**
 * Scraper Orchestrator
 *
 * Coordinates all benchmark scrapers and score generation in the optimal order:
 * 1. Run all external scrapers in parallel (independent data sources)
 * 2. Generate synthetic scores for unscored models (depends on step 1)
 * 3. Recalculate composite scores (depends on all benchmark data)
 *
 * This is the main entry point for refreshing benchmark data.
 *
 * Run via:
 * 1. Scheduled cron trigger (daily at 6 AM UTC)
 * 2. Manual: POST /admin/sync-all-benchmarks
 */

import { scrapeHuggingFace } from './huggingface';
import { scrapeLiveBench } from './livebench';
import { scrapeChatbotArena } from './chatbot-arena';
import { scrapeBigCodeBench } from './bigcodebench';
import { scrapeAlpacaEval } from './alpaca-eval';
import { generateSyntheticScores } from './synthetic-scores';
import { recalculateScores } from '../score-calculator';
import type { ScraperResult } from './base';

export interface OrchestrationResult {
  success: boolean;
  duration_ms: number;
  scrapers: {
    [source: string]: ScraperResult;
  };
  synthetic: ScraperResult;
  composite_scores_calculated: number;
  total_scores_updated: number;
  errors: string[];
}

/**
 * Run all scrapers and recalculate composite scores
 *
 * @param db - D1 Database instance
 * @param options - Orchestration options
 * @returns Detailed result with timing and error information
 */
export async function syncAllBenchmarks(
  db: D1Database,
  options: {
    skipScrapers?: string[];  // Scrapers to skip (e.g., ['huggingface'] for testing)
    skipSynthetic?: boolean;  // Skip synthetic score generation
    skipRecalculation?: boolean;  // Skip composite score recalculation
  } = {}
): Promise<OrchestrationResult> {
  const startTime = Date.now();
  console.log('[orchestrator] Starting benchmark synchronization...');

  const result: OrchestrationResult = {
    success: false,
    duration_ms: 0,
    scrapers: {},
    synthetic: { updated: 0, errors: [], source: 'synthetic' },
    composite_scores_calculated: 0,
    total_scores_updated: 0,
    errors: [],
  };

  try {
    // Phase 1: Run all external scrapers in parallel
    console.log('[orchestrator] Phase 1: Scraping external sources...');

    const scraperPromises: Promise<[string, ScraperResult]>[] = [];

    if (!options.skipScrapers?.includes('huggingface')) {
      scraperPromises.push(
        scrapeHuggingFace(db).then(r => ['huggingface', r] as [string, ScraperResult])
      );
    }

    if (!options.skipScrapers?.includes('livebench')) {
      scraperPromises.push(
        scrapeLiveBench(db).then(r => ['livebench', r] as [string, ScraperResult])
      );
    }

    if (!options.skipScrapers?.includes('chatbot_arena')) {
      scraperPromises.push(
        scrapeChatbotArena(db).then(r => ['chatbot_arena', r] as [string, ScraperResult])
      );
    }

    if (!options.skipScrapers?.includes('bigcodebench')) {
      scraperPromises.push(
        scrapeBigCodeBench(db).then(r => ['bigcodebench', r] as [string, ScraperResult])
      );
    }

    if (!options.skipScrapers?.includes('alpaca_eval')) {
      scraperPromises.push(
        scrapeAlpacaEval(db).then(r => ['alpaca_eval', r] as [string, ScraperResult])
      );
    }

    // Run all scrapers in parallel, but don't fail if one scraper fails
    const scraperResults = await Promise.allSettled(scraperPromises);

    for (const promiseResult of scraperResults) {
      if (promiseResult.status === 'fulfilled') {
        const [source, scraperResult] = promiseResult.value;
        result.scrapers[source] = scraperResult;
        result.total_scores_updated += scraperResult.updated;

        if (scraperResult.errors.length > 0) {
          result.errors.push(...scraperResult.errors.map(e => `[${source}] ${e}`));
        }

        console.log(
          `[orchestrator] ${source}: ${scraperResult.updated} scores updated` +
            (scraperResult.errors.length > 0 ? `, ${scraperResult.errors.length} errors` : '')
        );
      } else {
        const error = `Scraper failed: ${promiseResult.reason}`;
        result.errors.push(error);
        console.error(`[orchestrator] ${error}`);
      }
    }

    console.log(
      `[orchestrator] Phase 1 complete: ${result.total_scores_updated} scores from ${Object.keys(result.scrapers).length} scrapers`
    );

    // Phase 2: Generate synthetic scores for unscored models
    if (!options.skipSynthetic) {
      console.log('[orchestrator] Phase 2: Generating synthetic scores...');
      try {
        result.synthetic = await generateSyntheticScores(db);
        result.total_scores_updated += result.synthetic.updated;

        if (result.synthetic.errors.length > 0) {
          result.errors.push(...result.synthetic.errors.map(e => `[synthetic] ${e}`));
        }

        console.log(
          `[orchestrator] Phase 2 complete: ${result.synthetic.updated} synthetic scores generated`
        );
      } catch (err) {
        const error = `Synthetic score generation failed: ${err}`;
        result.errors.push(error);
        console.error(`[orchestrator] ${error}`);
      }
    }

    // Phase 3: Recalculate composite scores
    if (!options.skipRecalculation) {
      console.log('[orchestrator] Phase 3: Recalculating composite scores...');
      try {
        await recalculateScores(db);

        // Count composite scores generated
        const countResult = await db
          .prepare('SELECT COUNT(*) as count FROM composite_scores')
          .first<{ count: number }>();

        result.composite_scores_calculated = countResult?.count || 0;

        console.log(
          `[orchestrator] Phase 3 complete: ${result.composite_scores_calculated} composite scores calculated`
        );
      } catch (err) {
        const error = `Composite score calculation failed: ${err}`;
        result.errors.push(error);
        console.error(`[orchestrator] ${error}`);
      }
    }

    // Success if at least one scraper succeeded
    result.success = Object.keys(result.scrapers).length > 0 || result.synthetic.updated > 0;
    result.duration_ms = Date.now() - startTime;

    console.log(
      `[orchestrator] Synchronization ${result.success ? 'completed' : 'failed'} in ${result.duration_ms}ms. ` +
        `Total scores updated: ${result.total_scores_updated}. ` +
        `Composite scores: ${result.composite_scores_calculated}. ` +
        (result.errors.length > 0 ? `Errors: ${result.errors.length}` : 'No errors.')
    );

    return result;
  } catch (err) {
    result.duration_ms = Date.now() - startTime;
    const error = `Orchestration failed: ${err instanceof Error ? err.message : String(err)}`;
    result.errors.push(error);
    console.error(`[orchestrator] ${error}`);
    return result;
  }
}

/**
 * Get current benchmark coverage statistics
 */
export async function getCoverageStats(db: D1Database): Promise<{
  total_models: number;
  scored_models: number;
  unscored_models: number;
  models_with_real_scores: number;
  models_with_synthetic_only: number;
  coverage_percentage: number;
  scores_by_source: Record<string, number>;
}> {
  const [totalModels, scoredModels, realScoredModels, syntheticOnlyModels, scoresBySource] =
    await Promise.all([
      // Total models
      db
        .prepare('SELECT COUNT(*) as count FROM models WHERE is_available = 1')
        .first<{ count: number }>(),

      // Models with any scores
      db
        .prepare(
          `SELECT COUNT(DISTINCT model_id) as count
           FROM benchmark_scores bs
           JOIN models m ON m.id = bs.model_id
           WHERE m.is_available = 1`
        )
        .first<{ count: number }>(),

      // Models with real (non-synthetic) scores
      db
        .prepare(
          `SELECT COUNT(DISTINCT model_id) as count
           FROM benchmark_scores bs
           JOIN models m ON m.id = bs.model_id
           WHERE m.is_available = 1 AND bs.source != 'synthetic'`
        )
        .first<{ count: number }>(),

      // Models with ONLY synthetic scores
      db
        .prepare(
          `SELECT COUNT(DISTINCT m.id) as count
           FROM models m
           WHERE m.is_available = 1
           AND EXISTS (SELECT 1 FROM benchmark_scores bs WHERE bs.model_id = m.id AND bs.source = 'synthetic')
           AND NOT EXISTS (SELECT 1 FROM benchmark_scores bs WHERE bs.model_id = m.id AND bs.source != 'synthetic')`
        )
        .first<{ count: number }>(),

      // Scores by source
      db
        .prepare(
          `SELECT source, COUNT(*) as count
           FROM benchmark_scores
           GROUP BY source`
        )
        .all<{ source: string; count: number }>(),
    ]);

  const total = totalModels?.count || 0;
  const scored = scoredModels?.count || 0;
  const realScored = realScoredModels?.count || 0;
  const syntheticOnly = syntheticOnlyModels?.count || 0;

  const scoresBySourceMap: Record<string, number> = {};
  for (const row of scoresBySource.results || []) {
    scoresBySourceMap[row.source] = row.count;
  }

  return {
    total_models: total,
    scored_models: scored,
    unscored_models: total - scored,
    models_with_real_scores: realScored,
    models_with_synthetic_only: syntheticOnly,
    coverage_percentage: total > 0 ? (scored / total) * 100 : 0,
    scores_by_source: scoresBySourceMap,
  };
}
