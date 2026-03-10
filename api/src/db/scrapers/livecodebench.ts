/**
 * LiveCodeBench Scraper
 *
 * Fetches coding benchmark scores from LiveCodeBench's public JSON endpoint.
 * LiveCodeBench evaluates LLMs on competitive programming problems from
 * LeetCode, Codeforces, and AtCoder, with contamination-free questions.
 *
 * Data source: https://livecodebench.github.io/performances_generation.json
 * - 28+ models with per-question pass@1 scores
 * - 1000+ questions across easy/medium/hard difficulties
 * - Very fresh data (includes latest frontier models)
 *
 * We compute average pass@1 per model and store as a `code` domain benchmark.
 *
 * Run via:
 * 1. Scheduled cron trigger (daily)
 * 2. Manual: POST /admin/sync-livecodebench
 */

const LIVECODEBENCH_URL = 'https://livecodebench.github.io/performances_generation.json';

/**
 * Map LiveCodeBench model names to OpenRouter model IDs.
 */
const LCB_TO_OPENROUTER: Record<string, string> = {
  // Anthropic
  'Claude-3-Haiku': 'anthropic/claude-3-haiku',
  'Claude-3.5-Sonnet-20241022': 'anthropic/claude-3.5-sonnet',
  'Claude-Opus-4': 'anthropic/claude-opus-4',
  'Claude-Sonnet-4': 'anthropic/claude-sonnet-4',

  // OpenAI
  'GPT-4-Turbo-2024-04-09': 'openai/gpt-4-turbo',
  'GPT-4O-2024-08-06': 'openai/gpt-4o-2024-08-06',
  'GPT-4O-mini-2024-07-18': 'openai/gpt-4o-mini',
  'O3-Mini-2025-01-31 (High)': 'openai/o3-mini',

  // Google
  'Gemini-2.5-Flash-05-20': 'google/gemini-2.5-flash-preview',
  'Gemini-2.5-Pro-06-05': 'google/gemini-2.5-pro-preview',

  // DeepSeek
  'DeepSeek-V3': 'deepseek/deepseek-chat',
  'DeepSeek-R1-0528': 'deepseek/deepseek-r1',

  // Qwen
  'Qwen3-235B-A22B': 'qwen/qwen3-235b-a22b',
};

interface LCBPerformance {
  question_id: string;
  model: string;
  date: number;
  difficulty: string;
  'pass@1': number;
  platform: string;
}

interface LCBData {
  performances: LCBPerformance[];
  models: string[];
  date_marks: unknown[];
}

function normalizeModelId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Build a resolver that maps LiveCodeBench model names to OpenRouter IDs.
 */
function buildModelResolver(
  dbModels: Array<{ id: string; name: string }>
): (lcbName: string) => string | null {
  const dbLookup = new Map<string, string>();
  for (const row of dbModels) {
    const candidates = [row.id, row.name, row.id.split('/').pop() || row.id];
    for (const c of candidates) {
      const key = normalizeModelId(c);
      if (!dbLookup.has(key)) {
        dbLookup.set(key, row.id);
      }
    }
  }

  return (lcbName: string): string | null => {
    // Skip thinking/reasoning variants — use base model scores
    if (lcbName.includes('(Thinking)') || lcbName.includes('(Low)') || lcbName.includes('(Med)')) {
      return null;
    }

    const mapped = LCB_TO_OPENROUTER[lcbName];
    if (mapped) return mapped;

    const normalized = normalizeModelId(lcbName);
    if (dbLookup.has(normalized)) {
      return dbLookup.get(normalized)!;
    }

    return null;
  };
}

/**
 * Scrape LiveCodeBench scores and update benchmark scores for the code domain.
 */
export async function scrapeLiveCodeBench(
  db: D1Database
): Promise<{ updated: number; errors: string[] }> {
  console.log('[livecodebench] Fetching performance data...');

  const errors: string[] = [];
  let updated = 0;

  try {
    const response = await fetch(LIVECODEBENCH_URL, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const error = `LiveCodeBench fetch failed: ${response.status} ${response.statusText}`;
      errors.push(error);
      console.error(`[livecodebench] ${error}`);
      return { updated: 0, errors };
    }

    const data = (await response.json()) as LCBData;
    const performances = data.performances;
    console.log(`[livecodebench] Fetched ${performances.length} performance entries`);

    // Aggregate: average pass@1 per model
    const modelScores = new Map<string, { sum: number; count: number }>();
    for (const p of performances) {
      const score = p['pass@1'];
      if (typeof score !== 'number' || isNaN(score)) continue;

      const existing = modelScores.get(p.model) || { sum: 0, count: 0 };
      existing.sum += score;
      existing.count += 1;
      modelScores.set(p.model, existing);
    }

    console.log(`[livecodebench] Computed averages for ${modelScores.size} models`);

    // Load available models from DB for matching
    const dbModels = await db
      .prepare('SELECT id, name FROM models WHERE is_available = 1')
      .all<{ id: string; name: string }>();
    const resolveModel = buildModelResolver(dbModels.results || []);

    const timestamp = new Date().toISOString();
    let matchedCount = 0;
    let skippedCount = 0;

    for (const [lcbName, scores] of modelScores) {
      if (scores.count === 0) continue;

      const openrouterId = resolveModel(lcbName);
      if (!openrouterId) {
        skippedCount++;
        continue;
      }

      // Verify model exists in DB
      const modelExists = await db
        .prepare('SELECT id FROM models WHERE id = ?')
        .bind(openrouterId)
        .first();

      if (!modelExists) {
        skippedCount++;
        continue;
      }

      matchedCount++;
      const avgScore = scores.sum / scores.count;

      try {
        await db
          .prepare(
            `INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at)
             VALUES (?, 'livecodebench', 'code', ?, ?, 'livecodebench', 'https://livecodebench.github.io', ?)
             ON CONFLICT(model_id, benchmark, domain) DO UPDATE SET
               score = excluded.score,
               raw_score = excluded.raw_score,
               measured_at = excluded.measured_at`
          )
          .bind(openrouterId, avgScore, avgScore, timestamp)
          .run();

        updated++;
      } catch (err) {
        const error = `Failed to insert score for ${openrouterId}: ${err}`;
        errors.push(error);
        console.error(`[livecodebench] ${error}`);
      }

      console.log(
        `[livecodebench] ${openrouterId} (${lcbName}): pass@1 = ${avgScore.toFixed(1)}%`
      );
    }

    console.log(
      `[livecodebench] Complete. Models matched: ${matchedCount}, skipped: ${skippedCount}. Scores updated: ${updated}.`
    );

    return { updated, errors };
  } catch (err) {
    const error = `LiveCodeBench scrape failed: ${err}`;
    errors.push(error);
    console.error(`[livecodebench] ${error}`);
    return { updated, errors };
  }
}
