/**
 * HuggingFace Open LLM Leaderboard Scraper
 *
 * Fetches benchmark scores from HuggingFace Open LLM Leaderboard v2
 * and updates the benchmark_scores table in SCORE_DB.
 *
 * HF Leaderboard v2 benchmarks (as of 2026):
 * - GPQA (science reasoning)
 * - MMLU-PRO (multi-domain knowledge)
 * - MATH (mathematical reasoning)
 * - BBH (Big Bench Hard - reasoning)
 * - MUSR (Multi-Step Reasoning)
 * - IFEval (Instruction Following)
 *
 * Run via:
 * 1. Scheduled cron trigger (daily)
 * 2. Manual: POST /admin/sync-huggingface
 */

import { recalculateScores } from '../score-calculator';

interface HFLeaderboardEntry {
  model_name_for_query: string; // e.g., "meta-llama/Llama-3.3-70B-Instruct"
  fullname: string;              // Display name
  // Benchmark scores (0-100 scale)
  GPQA?: number;
  'MMLU-PRO'?: number;
  MATH?: number;
  BBH?: number;
  MUSR?: number;
  IFEval?: number;
  // Could have other fields, but we only need scores
}

/**
 * Manual mapping of HuggingFace model names to OpenRouter model IDs
 * This is necessary because HF uses different naming conventions
 * (e.g., "meta-llama/Llama-3.3-70B-Instruct" vs "meta-llama/llama-3.3-70b-instruct")
 */
const HF_TO_OPENROUTER_MAPPING: Record<string, string> = {
  // Llama models
  'meta-llama/Llama-3.3-70B-Instruct': 'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/Llama-3.1-405B-Instruct': 'meta-llama/llama-3.1-405b-instruct',
  'meta-llama/Llama-3.1-70B-Instruct': 'meta-llama/llama-3.1-70b-instruct',
  'meta-llama/Llama-3.1-8B-Instruct': 'meta-llama/llama-3.1-8b-instruct',

  // Qwen models
  'Qwen/Qwen2.5-72B-Instruct': 'qwen/qwen-2.5-72b-instruct',
  'Qwen/Qwen2.5-32B-Instruct': 'qwen/qwen-2.5-32b-instruct',
  'Qwen/Qwen2.5-14B-Instruct': 'qwen/qwen-2.5-14b-instruct',
  'Qwen/Qwen2.5-7B-Instruct': 'qwen/qwen-2.5-7b-instruct',

  // DeepSeek models
  'deepseek-ai/DeepSeek-V3': 'deepseek/deepseek-chat',
  'deepseek-ai/DeepSeek-V2.5': 'deepseek/deepseek-chat',

  // Mistral models
  'mistralai/Mistral-Large-Instruct-2411': 'mistralai/mistral-large-2411',
  'mistralai/Mistral-Large-Instruct-2407': 'mistralai/mistral-large-2407',

  // Anthropic models (if they appear on HF leaderboard)
  'anthropic/claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
  'anthropic/claude-sonnet-4.5': 'anthropic/claude-sonnet-4.5',

  // Google models
  'google/gemini-pro-1.5': 'google/gemini-pro-1.5',
  'google/gemini-flash-1.5': 'google/gemini-flash-1.5',

  // Add more mappings as needed
};

/**
 * Map HF benchmark names to our domain taxonomy
 */
const BENCHMARK_TO_DOMAIN: Record<string, string> = {
  'GPQA': 'science',           // Graduate-level science questions
  'MMLU-PRO': 'general',       // Multi-domain knowledge (covers many topics)
  'MATH': 'math',              // Mathematical reasoning
  'BBH': 'reasoning',          // Big Bench Hard (logic, reasoning)
  'MUSR': 'reasoning',         // Multi-Step Reasoning
  'IFEval': 'general',         // Instruction following (general capability)
};

/**
 * Scrape HuggingFace Open LLM Leaderboard and update benchmark scores
 */
export async function scrapeHuggingFace(db: D1Database): Promise<{ updated: number; errors: string[] }> {
  console.log('[huggingface] Fetching leaderboard data from HuggingFace...');

  const errors: string[] = [];
  let updated = 0;

  try {
    // Fetch leaderboard data from HF API
    const response = await fetch(
      'https://open-llm-leaderboard-open-llm-leaderboard.hf.space/api/leaderboard/formatted',
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = `HuggingFace API error: ${response.status} ${response.statusText}`;
      errors.push(error);
      console.error(`[huggingface] ${error}`);
      return { updated: 0, errors };
    }

    const data = (await response.json()) as HFLeaderboardEntry[];
    console.log(`[huggingface] Fetched ${data.length} models from leaderboard`);

    const timestamp = new Date().toISOString();

    // Process each model
    for (const entry of data) {
      // Map HF model name to OpenRouter ID
      const openrouterId = HF_TO_OPENROUTER_MAPPING[entry.model_name_for_query];

      if (!openrouterId) {
        // Skip models not in our mapping (most HF models aren't available via OpenRouter)
        continue;
      }

      // Check if this model exists in our database
      const modelExists = await db
        .prepare(`SELECT id FROM models WHERE id = ?`)
        .bind(openrouterId)
        .first();

      if (!modelExists) {
        console.log(`[huggingface] Skipping ${entry.model_name_for_query} - not in models table (run sync-pricing first)`);
        continue;
      }

      // Insert scores for each benchmark
      const benchmarks: Array<{ name: string; score: number | undefined }> = [
        { name: 'GPQA', score: entry.GPQA },
        { name: 'MMLU-PRO', score: entry['MMLU-PRO'] },
        { name: 'MATH', score: entry.MATH },
        { name: 'BBH', score: entry.BBH },
        { name: 'MUSR', score: entry.MUSR },
        { name: 'IFEval', score: entry.IFEval },
      ];

      for (const benchmark of benchmarks) {
        if (benchmark.score === undefined || benchmark.score === null) {
          continue; // Skip if score not available
        }

        const domain = BENCHMARK_TO_DOMAIN[benchmark.name];
        if (!domain) {
          continue; // Skip if domain mapping not defined
        }

        try {
          // Upsert benchmark score
          await db
            .prepare(
              `INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at)
               VALUES (?, ?, ?, ?, ?, 'huggingface', 'https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard', ?)
               ON CONFLICT(model_id, benchmark, domain) DO UPDATE SET
                 score = excluded.score,
                 raw_score = excluded.raw_score,
                 measured_at = excluded.measured_at`
            )
            .bind(
              openrouterId,
              benchmark.name.toLowerCase(),
              domain,
              benchmark.score,
              benchmark.score, // raw_score = score (HF already normalizes to 0-100)
              timestamp
            )
            .run();

          updated++;
        } catch (err) {
          const error = `Failed to insert score for ${openrouterId} / ${benchmark.name}: ${err}`;
          errors.push(error);
          console.error(`[huggingface] ${error}`);
        }
      }

      console.log(`[huggingface] Updated scores for ${openrouterId} (${entry.fullname})`);
    }

    // Recalculate composite scores after updating benchmark data
    console.log('[huggingface] Recalculating composite scores...');
    await recalculateScores(db);

    console.log(`[huggingface] Complete. Updated ${updated} benchmark scores.`);
    return { updated, errors };
  } catch (err) {
    const error = `HuggingFace scrape failed: ${err}`;
    errors.push(error);
    console.error(`[huggingface] ${error}`);
    return { updated, errors };
  }
}
