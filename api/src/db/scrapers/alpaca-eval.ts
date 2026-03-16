/**
 * AlpacaEval 2.0 Scraper
 *
 * Fetches instruction-following quality scores from AlpacaEval 2.0 leaderboard.
 * AlpacaEval measures how well models follow instructions compared to GPT-4 Turbo baseline.
 *
 * Data source: https://tatsu-lab.github.io/alpaca_eval/
 * Leaderboard: https://github.com/tatsu-lab/alpaca_eval#leaderboard
 * Raw data: https://raw.githubusercontent.com/tatsu-lab/alpaca_eval/main/results/alpaca_eval_gpt4_turbo_fn/leaderboard.csv
 *
 * Metrics:
 * - Win Rate: % of responses preferred over baseline (0-100)
 * - Length-controlled Win Rate: Adjusted for response length
 *
 * Run via:
 * 1. Scheduled cron trigger (daily)
 * 2. Manual: POST /admin/sync-alpaca-eval
 */

import {
  ScraperResult,
  buildModelLookup,
  fetchWithRetry,
  upsertBenchmarkScore,
  loadAvailableModels,
  isValidScore,
  parseCSV,
} from './base';

/**
 * Curated mapping of AlpacaEval model names to OpenRouter IDs
 */
const ALPACAEVAL_TO_OPENROUTER: Record<string, string> = {
  // OpenAI
  'gpt-4o-2024-11-20': 'openai/gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06': 'openai/gpt-4o-2024-08-06',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4-turbo-2024-04-09': 'openai/gpt-4-turbo',
  'gpt-4-1106-preview': 'openai/gpt-4-1106-preview',
  'gpt-3.5-turbo-0613': 'openai/gpt-3.5-turbo',

  // Anthropic
  'claude-3-5-sonnet-20241022': 'anthropic/claude-3.5-sonnet',
  'claude-3-5-haiku-20241022': 'anthropic/claude-3.5-haiku',
  'claude-3-opus-20240229': 'anthropic/claude-3-opus',
  'claude-sonnet-4-5': 'anthropic/claude-sonnet-4.5',

  // Google
  'gemini-2.0-flash-001': 'google/gemini-2.0-flash-001',
  'gemini-2.5-flash': 'google/gemini-2.5-flash-preview',
  'gemini-2.5-pro': 'google/gemini-2.5-pro-preview',
  'gemini-pro-1.5': 'google/gemini-pro-1.5',

  // Meta
  'llama-3.3-70b-instruct': 'meta-llama/llama-3.3-70b-instruct',
  'llama-3.1-405b-instruct': 'meta-llama/llama-3.1-405b-instruct',
  'llama-3.1-70b-instruct': 'meta-llama/llama-3.1-70b-instruct',
  'llama-4-maverick': 'meta-llama/llama-4-maverick',

  // Qwen
  'qwen3-235b': 'qwen/qwen3-235b-a22b',
  'qwen2.5-72b-instruct': 'qwen/qwen-2.5-72b-instruct',
  'qwen2.5-32b-instruct': 'qwen/qwen-2.5-32b-instruct',

  // DeepSeek
  'deepseek-chat': 'deepseek/deepseek-chat',
  'deepseek-r1': 'deepseek/deepseek-r1',

  // Mistral
  'mistral-large-2411': 'mistralai/mistral-large-2411',
  'mistral-large-2407': 'mistralai/mistral-large-2407',

  // Others
  'command-r-plus-08-2024': 'cohere/command-r-plus-08-2024',
};

/**
 * Scrape AlpacaEval 2.0 leaderboard and update benchmark scores
 */
export async function scrapeAlpacaEval(db: D1Database): Promise<ScraperResult> {
  console.log('[alpaca-eval] Fetching leaderboard data from AlpacaEval...');

  const errors: string[] = [];
  let updated = 0;
  let modelsMatched = 0;
  let modelsSkipped = 0;

  try {
    // Fetch CSV from GitHub
    const csvUrl =
      'https://raw.githubusercontent.com/tatsu-lab/alpaca_eval/main/results/alpaca_eval_gpt4_turbo_fn/leaderboard.csv';

    const response = await fetchWithRetry(csvUrl, {
      headers: {
        'Accept': 'text/csv, text/plain, */*',
        'User-Agent': 'ArcRouter/1.0 (https://arcrouter.ai)',
      },
    });

    if (!response.ok) {
      const error = `AlpacaEval API error: ${response.status} ${response.statusText}`;
      errors.push(error);
      console.error(`[alpaca-eval] ${error}`);
      return { updated: 0, errors, source: 'alpaca_eval' };
    }

    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      const error = 'No data in AlpacaEval CSV';
      errors.push(error);
      console.error(`[alpaca-eval] ${error}`);
      return { updated: 0, errors, source: 'alpaca_eval' };
    }

    console.log(`[alpaca-eval] Parsed ${rows.length - 1} models from CSV`);

    // Parse header
    const header = rows[0].map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'));
    const modelIdx = header.findIndex((h) => h.includes('model') || h === 'name');
    const winRateIdx = header.findIndex((h) => h.includes('win_rate') && !h.includes('lc'));
    const lcWinRateIdx = header.findIndex((h) => h.includes('lc_win_rate') || h.includes('length'));

    if (modelIdx === -1) {
      const error = 'Could not find model column in CSV';
      errors.push(error);
      console.error(`[alpaca-eval] ${error}`);
      return { updated: 0, errors, source: 'alpaca_eval' };
    }

    const timestamp = new Date().toISOString();
    const dbModels = await loadAvailableModels(db);
    const resolveModel = buildModelLookup(dbModels, ALPACAEVAL_TO_OPENROUTER);

    // Process each row (skip header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue;

      const modelName = row[modelIdx]?.trim();
      if (!modelName) continue;

      const openrouterId = resolveModel(modelName);
      if (!openrouterId) {
        modelsSkipped++;
        continue;
      }

      // Verify model exists in DB
      const modelExists = await db
        .prepare('SELECT id FROM models WHERE id = ?')
        .bind(openrouterId)
        .first();

      if (!modelExists) {
        modelsSkipped++;
        continue;
      }

      modelsMatched++;

      // Extract win rate (already 0-100 scale)
      if (winRateIdx !== -1) {
        const winRateStr = row[winRateIdx]?.trim();
        const winRate = parseFloat(winRateStr);

        if (isValidScore(winRate)) {
          const success = await upsertBenchmarkScore(db, {
            modelId: openrouterId,
            benchmark: 'alpaca_eval_winrate',
            domain: 'general',
            score: winRate,
            rawScore: winRate,
            source: 'alpaca_eval',
            sourceUrl: 'https://tatsu-lab.github.io/alpaca_eval/',
            measuredAt: timestamp,
          });

          if (success) {
            updated++;
          } else {
            errors.push(`Failed to insert win_rate for ${openrouterId}`);
          }
        }
      }

      // Extract length-controlled win rate
      if (lcWinRateIdx !== -1) {
        const lcWinRateStr = row[lcWinRateIdx]?.trim();
        const lcWinRate = parseFloat(lcWinRateStr);

        if (isValidScore(lcWinRate)) {
          const success = await upsertBenchmarkScore(db, {
            modelId: openrouterId,
            benchmark: 'alpaca_eval_lc_winrate',
            domain: 'general',
            score: lcWinRate,
            rawScore: lcWinRate,
            source: 'alpaca_eval',
            sourceUrl: 'https://tatsu-lab.github.io/alpaca_eval/',
            measuredAt: timestamp,
          });

          if (success) {
            updated++;
          } else {
            errors.push(`Failed to insert lc_win_rate for ${openrouterId}`);
          }
        }
      }

      console.log(`[alpaca-eval] Updated scores for ${openrouterId} (${modelName})`);
    }

    console.log(
      `[alpaca-eval] Complete. Models matched: ${modelsMatched}, skipped: ${modelsSkipped}. ` +
        `Scores updated: ${updated}.`
    );

    return {
      updated,
      errors,
      source: 'alpaca_eval',
      models_matched: modelsMatched,
      models_skipped: modelsSkipped,
    };
  } catch (err) {
    const error = `AlpacaEval scrape failed: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(error);
    console.error(`[alpaca-eval] ${error}`);
    return {
      updated,
      errors,
      source: 'alpaca_eval',
      models_matched: modelsMatched,
      models_skipped: modelsSkipped,
    };
  }
}
