/**
 * LiveBench Scraper
 *
 * Fetches LiveBench scores from CSV files published on GitHub/HuggingFace.
 * LiveBench is valuable because it rotates questions monthly to prevent contamination.
 *
 * LiveBench categories:
 * - coding
 * - math
 * - reasoning
 * - language
 * - data_analysis
 * - instruction_following
 *
 * NOTE: LiveBench has NO REST API. The website is a client-rendered SPA.
 * We download all_groups.csv from the GitHub repo or HuggingFace datasets.
 *
 * Run via:
 * 1. Scheduled cron trigger (daily)
 * 2. Manual: POST /admin/sync-livebench
 */

import { recalculateScores } from '../score-calculator';

interface LiveBenchEntry {
  model: string;            // Model name
  coding?: number;          // Score 0-100
  math?: number;
  reasoning?: number;
  language?: number;
  data_analysis?: number;
  instruction_following?: number;
}

/**
 * Manual mapping of LiveBench model names to OpenRouter model IDs
 * LiveBench uses various naming conventions, so we need to map manually
 */
const LIVEBENCH_TO_OPENROUTER_MAPPING: Record<string, string> = {
  // Llama models
  'Llama-3.3-70B-Instruct': 'meta-llama/llama-3.3-70b-instruct',
  'Llama-3.1-405B-Instruct': 'meta-llama/llama-3.1-405b-instruct',
  'Llama-3.1-70B-Instruct': 'meta-llama/llama-3.1-70b-instruct',
  'Meta-Llama-3.3-70B-Instruct': 'meta-llama/llama-3.3-70b-instruct',

  // Qwen models
  'Qwen2.5-72B-Instruct': 'qwen/qwen-2.5-72b-instruct',
  'Qwen2.5-32B-Instruct': 'qwen/qwen-2.5-32b-instruct',
  'QwQ-32B-Preview': 'qwen/qwq-32b-preview',

  // DeepSeek models
  'DeepSeek-V3': 'deepseek/deepseek-chat',
  'DeepSeek-V2.5': 'deepseek/deepseek-chat',
  'deepseek-chat': 'deepseek/deepseek-chat',

  // Mistral models
  'Mistral-Large-Instruct-2411': 'mistralai/mistral-large-2411',

  // Anthropic models
  'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
  'claude-sonnet-4.5': 'anthropic/claude-sonnet-4.5',

  // Google models
  'gemini-pro-1.5': 'google/gemini-pro-1.5',
  'gemini-flash-1.5': 'google/gemini-flash-1.5',
  'gemini-2.0-flash': 'google/gemini-2.0-flash-exp:free',

  // Add more mappings as needed
};

/**
 * Map LiveBench category names to our domain taxonomy
 */
const LIVEBENCH_CATEGORY_TO_DOMAIN: Record<string, string> = {
  'coding': 'code',
  'math': 'math',
  'reasoning': 'reasoning',
  'language': 'writing',
  'data_analysis': 'math/statistics',
  'instruction_following': 'general',
};

/**
 * Parse CSV manually (simple parser for LiveBench CSV format)
 * Returns array of { model, coding, math, reasoning, language, data_analysis, instruction_following }
 */
function parseCSV(csvText: string): LiveBenchEntry[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return [];
  }

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const modelIndex = header.indexOf('model');

  if (modelIndex === -1) {
    console.error('[livebench] CSV header does not contain "model" column');
    return [];
  }

  const entries: LiveBenchEntry[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
    const modelName = values[modelIndex];

    if (!modelName) continue;

    const entry: LiveBenchEntry = { model: modelName };

    // Extract scores for each category
    for (let j = 0; j < header.length; j++) {
      const columnName = header[j];
      const value = values[j];

      if (columnName === 'model') continue;

      // Try to parse as number
      const score = parseFloat(value);
      if (!isNaN(score)) {
        // Map column name to our category names
        if (columnName.includes('coding')) {
          entry.coding = score;
        } else if (columnName.includes('math')) {
          entry.math = score;
        } else if (columnName.includes('reasoning')) {
          entry.reasoning = score;
        } else if (columnName.includes('language')) {
          entry.language = score;
        } else if (columnName.includes('data') && columnName.includes('analysis')) {
          entry.data_analysis = score;
        } else if (columnName.includes('instruction')) {
          entry.instruction_following = score;
        }
      }
    }

    entries.push(entry);
  }

  return entries;
}

/**
 * Scrape LiveBench scores and update benchmark scores
 */
export async function scrapeLiveBench(db: D1Database): Promise<{ updated: number; errors: string[] }> {
  console.log('[livebench] Fetching leaderboard data from LiveBench...');

  const errors: string[] = [];
  let updated = 0;

  try {
    // Try GitHub raw URL first
    const githubUrl = 'https://raw.githubusercontent.com/LiveBench/LiveBench/main/livebench/data/all_groups.csv';

    let response = await fetch(githubUrl, {
      headers: {
        'Accept': 'text/csv, text/plain, */*',
      },
    });

    // If GitHub fails, try HuggingFace datasets API
    if (!response.ok) {
      console.log('[livebench] GitHub fetch failed, trying HuggingFace datasets...');
      const hfUrl = 'https://huggingface.co/datasets/livebench/LiveBench/resolve/main/all_groups.csv';
      response = await fetch(hfUrl, {
        headers: {
          'Accept': 'text/csv, text/plain, */*',
        },
      });
    }

    if (!response.ok) {
      const error = `LiveBench data fetch error: ${response.status} ${response.statusText}`;
      errors.push(error);
      console.error(`[livebench] ${error}`);
      return { updated: 0, errors };
    }

    const csvText = await response.text();
    console.log(`[livebench] Downloaded CSV (${csvText.length} bytes)`);

    // Parse CSV
    const entries = parseCSV(csvText);
    console.log(`[livebench] Parsed ${entries.length} models from CSV`);

    const timestamp = new Date().toISOString();

    // Process each model
    for (const entry of entries) {
      // Map LiveBench model name to OpenRouter ID
      const openrouterId = LIVEBENCH_TO_OPENROUTER_MAPPING[entry.model];

      if (!openrouterId) {
        // Skip models not in our mapping
        continue;
      }

      // Check if this model exists in our database
      const modelExists = await db
        .prepare(`SELECT id FROM models WHERE id = ?`)
        .bind(openrouterId)
        .first();

      if (!modelExists) {
        console.log(`[livebench] Skipping ${entry.model} - not in models table (run sync-pricing first)`);
        continue;
      }

      // Insert scores for each category
      const categories: Array<{ name: string; score: number | undefined }> = [
        { name: 'coding', score: entry.coding },
        { name: 'math', score: entry.math },
        { name: 'reasoning', score: entry.reasoning },
        { name: 'language', score: entry.language },
        { name: 'data_analysis', score: entry.data_analysis },
        { name: 'instruction_following', score: entry.instruction_following },
      ];

      for (const category of categories) {
        if (category.score === undefined || category.score === null) {
          continue; // Skip if score not available
        }

        const domain = LIVEBENCH_CATEGORY_TO_DOMAIN[category.name];
        if (!domain) {
          continue; // Skip if domain mapping not defined
        }

        try {
          // Upsert benchmark score
          await db
            .prepare(
              `INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at)
               VALUES (?, ?, ?, ?, ?, 'livebench', 'https://livebench.ai', ?)
               ON CONFLICT(model_id, benchmark, domain) DO UPDATE SET
                 score = excluded.score,
                 raw_score = excluded.raw_score,
                 measured_at = excluded.measured_at`
            )
            .bind(
              openrouterId,
              `livebench_${category.name}`,
              domain,
              category.score,
              category.score, // raw_score = score (LiveBench already normalizes)
              timestamp
            )
            .run();

          updated++;
        } catch (err) {
          const error = `Failed to insert score for ${openrouterId} / ${category.name}: ${err}`;
          errors.push(error);
          console.error(`[livebench] ${error}`);
        }
      }

      console.log(`[livebench] Updated scores for ${openrouterId} (${entry.model})`);
    }

    // Recalculate composite scores after updating benchmark data
    console.log('[livebench] Recalculating composite scores...');
    await recalculateScores(db);

    console.log(`[livebench] Complete. Updated ${updated} benchmark scores.`);
    return { updated, errors };
  } catch (err) {
    const error = `LiveBench scrape failed: ${err}`;
    errors.push(error);
    console.error(`[livebench] ${error}`);
    return { updated, errors };
  }
}
