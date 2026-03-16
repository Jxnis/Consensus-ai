/**
 * BigCodeBench Scraper
 *
 * Fetches code benchmark scores from BigCodeBench leaderboard.
 * BigCodeBench is a more comprehensive code benchmark than HumanEval/MBPP,
 * with 1,140 real-world programming tasks covering more libraries and complexity.
 *
 * Data source: https://huggingface.co/spaces/bigcode/bigcodebench-leaderboard
 * Format: JSON API from HuggingFace Spaces
 *
 * Metrics:
 * - Complete: Full solution pass rate
 * - Instruct: Instruction-following in code generation
 * - Average: Overall score
 *
 * Run via:
 * 1. Scheduled cron trigger (daily)
 * 2. Manual: POST /admin/sync-bigcodebench
 */

import {
  ScraperResult,
  buildModelLookup,
  fetchWithRetry,
  upsertBenchmarkScore,
  loadAvailableModels,
  isValidScore,
} from './base';

interface BigCodeBenchEntry {
  model?: string;
  model_name?: string;
  pass_at_1?: number;  // Pass@1 for Complete
  instruct_pass_at_1?: number;  // Pass@1 for Instruct
  average?: number;  // Average score
  complete?: number;  // Complete score
  instruct?: number;  // Instruct score
  // Additional fields
  [key: string]: unknown;
}

/**
 * Curated mapping of BigCodeBench model names to OpenRouter IDs
 */
const BIGCODEBENCH_TO_OPENROUTER: Record<string, string> = {
  // OpenAI
  'gpt-4o-2024-11-20': 'openai/gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06': 'openai/gpt-4o-2024-08-06',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'o1-2024-12-17': 'openai/o1',
  'o1-mini': 'openai/o1-mini',
  'o3-mini': 'openai/o3-mini',

  // Anthropic
  'claude-3-5-sonnet-20241022': 'anthropic/claude-3.5-sonnet',
  'claude-sonnet-4-5': 'anthropic/claude-sonnet-4.5',
  'claude-4-opus': 'anthropic/claude-opus-4',

  // Google
  'gemini-2.0-flash': 'google/gemini-2.0-flash-001',
  'gemini-2.5-flash': 'google/gemini-2.5-flash-preview',
  'gemini-2.5-pro': 'google/gemini-2.5-pro-preview',
  'gemini-pro-1.5': 'google/gemini-pro-1.5',

  // DeepSeek
  'deepseek-chat': 'deepseek/deepseek-chat',
  'deepseek-coder-v2': 'deepseek/deepseek-coder',
  'deepseek-r1': 'deepseek/deepseek-r1',

  // Qwen
  'qwen3-235b': 'qwen/qwen3-235b-a22b',
  'qwen3-32b': 'qwen/qwen3-32b',
  'qwen2.5-coder-32b': 'qwen/qwen2.5-coder-32b-instruct',
  'qwen2.5-72b': 'qwen/qwen-2.5-72b-instruct',

  // Meta
  'llama-3.3-70b': 'meta-llama/llama-3.3-70b-instruct',
  'llama-3.1-405b': 'meta-llama/llama-3.1-405b-instruct',
  'llama-4-maverick': 'meta-llama/llama-4-maverick',

  // Mistral
  'mistral-large-2411': 'mistralai/mistral-large-2411',
  'codestral': 'mistralai/codestral',

  // Others
  'command-r-plus': 'cohere/command-r-plus',
};

/**
 * Scrape BigCodeBench leaderboard and update benchmark scores
 */
export async function scrapeBigCodeBench(db: D1Database): Promise<ScraperResult> {
  console.log('[bigcodebench] Fetching leaderboard data from BigCodeBench...');

  const errors: string[] = [];
  let updated = 0;
  let modelsMatched = 0;
  let modelsSkipped = 0;

  try {
    // HuggingFace Spaces Gradio API endpoint
    const apiUrl = 'https://huggingface.co/spaces/bigcode/bigcodebench-leaderboard/api/data';

    const response = await fetchWithRetry(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ArcRouter/1.0 (https://arcrouter.ai)',
      },
    });

    if (!response.ok) {
      const error = `BigCodeBench API error: ${response.status} ${response.statusText}`;
      errors.push(error);
      console.error(`[bigcodebench] ${error}`);
      return { updated: 0, errors, source: 'bigcodebench' };
    }

    const json = await response.json();
    const data = json.data || json;

    if (!Array.isArray(data) || data.length === 0) {
      const error = 'No data available from BigCodeBench API';
      errors.push(error);
      console.error(`[bigcodebench] ${error}`);
      return { updated: 0, errors, source: 'bigcodebench' };
    }

    console.log(`[bigcodebench] Fetched ${data.length} models from leaderboard`);

    const timestamp = new Date().toISOString();
    const dbModels = await loadAvailableModels(db);
    const resolveModel = buildModelLookup(dbModels, BIGCODEBENCH_TO_OPENROUTER);

    // Process each model
    for (const entry of data) {
      const modelName = entry.model || entry.model_name;
      if (!modelName || typeof modelName !== 'string') {
        continue;
      }

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

      // Extract scores (BigCodeBench uses 0-100 scale)
      const scores: Array<{ field: string; value: number; benchmark: string; domain: string }> = [];

      // Complete score
      const completeScore = entry.complete ?? entry.pass_at_1;
      if (typeof completeScore === 'number' && isValidScore(completeScore)) {
        scores.push({
          field: 'complete',
          value: completeScore,
          benchmark: 'bigcodebench_complete',
          domain: 'code',
        });
      }

      // Instruct score
      const instructScore = entry.instruct ?? entry.instruct_pass_at_1;
      if (typeof instructScore === 'number' && isValidScore(instructScore)) {
        scores.push({
          field: 'instruct',
          value: instructScore,
          benchmark: 'bigcodebench_instruct',
          domain: 'code',
        });
      }

      // Average score (overall coding capability)
      const avgScore = entry.average;
      if (typeof avgScore === 'number' && isValidScore(avgScore)) {
        scores.push({
          field: 'average',
          value: avgScore,
          benchmark: 'bigcodebench_average',
          domain: 'code',
        });
      }

      // Insert all scores
      for (const score of scores) {
        const success = await upsertBenchmarkScore(db, {
          modelId: openrouterId,
          benchmark: score.benchmark,
          domain: score.domain,
          score: score.value,
          rawScore: score.value,
          source: 'bigcodebench',
          sourceUrl: 'https://huggingface.co/spaces/bigcode/bigcodebench-leaderboard',
          measuredAt: timestamp,
        });

        if (success) {
          updated++;
        } else {
          errors.push(`Failed to insert ${score.field} score for ${openrouterId}`);
        }
      }

      if (scores.length > 0) {
        console.log(
          `[bigcodebench] Updated ${scores.length} scores for ${openrouterId} (${modelName})`
        );
      }
    }

    console.log(
      `[bigcodebench] Complete. Models matched: ${modelsMatched}, skipped: ${modelsSkipped}. ` +
        `Scores updated: ${updated}.`
    );

    return {
      updated,
      errors,
      source: 'bigcodebench',
      models_matched: modelsMatched,
      models_skipped: modelsSkipped,
    };
  } catch (err) {
    const error = `BigCodeBench scrape failed: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(error);
    console.error(`[bigcodebench] ${error}`);
    return {
      updated,
      errors,
      source: 'bigcodebench',
      models_matched: modelsMatched,
      models_skipped: modelsSkipped,
    };
  }
}
