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

interface HFLeaderboardEntry {
  id?: string;
  model?: {
    name?: string;
  };
  evaluations?: Record<string, {
    name?: string;
    value?: number;
    normalized_score?: number;
  }>;
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
 * Map HF evaluation keys to our benchmark ids + domain taxonomy
 */
const HF_EVAL_MAPPING: Record<string, { benchmark: string; domain: string }> = {
  gpqa: { benchmark: "gpqa", domain: "science" },
  mmlu_pro: { benchmark: "mmlu_pro", domain: "general" },
  math: { benchmark: "math", domain: "math" },
  bbh: { benchmark: "bbh", domain: "reasoning" },
  musr: { benchmark: "musr", domain: "reasoning" },
  ifeval: { benchmark: "ifeval", domain: "general" },
};

function normalizeModelIdentifier(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildModelLookup(rows: Array<{ id: string; name: string }>): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const row of rows) {
    const candidates = [
      row.id,
      row.name,
      row.id.split("/").pop() || row.id,
    ];

    for (const candidate of candidates) {
      const key = normalizeModelIdentifier(candidate);
      if (!lookup.has(key)) {
        lookup.set(key, row.id);
      }
    }
  }

  return lookup;
}

function resolveOpenRouterId(
  entry: HFLeaderboardEntry,
  modelLookup: Map<string, string>
): string | null {
  const modelName = entry.model?.name;
  if (!modelName) return null;

  // Prefer curated hard mappings for known naming mismatches.
  const mapped = HF_TO_OPENROUTER_MAPPING[modelName];
  if (mapped) return mapped;

  const normalized = normalizeModelIdentifier(modelName);
  if (modelLookup.has(normalized)) {
    return modelLookup.get(normalized)!;
  }

  return null;
}

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
    const dbModels = await db
      .prepare(`SELECT id, name FROM models WHERE is_available = 1`)
      .all<{ id: string; name: string }>();
    const modelLookup = buildModelLookup(dbModels.results || []);

    // Process each model
    for (const entry of data) {
      // Resolve HF model name to OpenRouter model id.
      const openrouterId = resolveOpenRouterId(entry, modelLookup);

      if (!openrouterId) {
        // Skip models that are not available in our OpenRouter-backed registry.
        continue;
      }

      const evaluations = entry.evaluations || {};
      for (const [evalKey, evalValue] of Object.entries(evaluations)) {
        const mapping = HF_EVAL_MAPPING[evalKey];
        if (!mapping) continue;

        const normalizedScore = evalValue.normalized_score;
        const rawValue = evalValue.value;
        const score = typeof normalizedScore === "number"
          ? normalizedScore
          : (typeof rawValue === "number" ? rawValue * 100 : undefined);
        if (score === undefined || Number.isNaN(score)) continue;

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
              mapping.benchmark,
              mapping.domain,
              score,
              score,
              timestamp
            )
            .run();

          updated++;
        } catch (err) {
          const error = `Failed to insert score for ${openrouterId} / ${evalKey}: ${err}`;
          errors.push(error);
          console.error(`[huggingface] ${error}`);
        }
      }

      console.log(`[huggingface] Updated scores for ${openrouterId} (${entry.model?.name || "unknown"})`);
    }

    console.log(`[huggingface] Complete. Updated ${updated} benchmark scores.`);
    return { updated, errors };
  } catch (err) {
    const error = `HuggingFace scrape failed: ${err}`;
    errors.push(error);
    console.error(`[huggingface] ${error}`);
    return { updated, errors };
  }
}
