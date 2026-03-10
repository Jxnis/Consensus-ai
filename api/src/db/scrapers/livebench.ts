/**
 * LiveBench Scraper
 *
 * Fetches LiveBench scores from static CSV files published at livebench.ai.
 * LiveBench is valuable because it rotates questions monthly to prevent contamination.
 *
 * Data source: livebench.ai publishes per-release CSV leaderboards as static files
 * on GitHub Pages (repo: LiveBench/livebench.github.io).
 *
 * URL pattern:
 *   CSV:  https://livebench.ai/table_YYYY_MM_DD.csv
 *   JSON: https://livebench.ai/categories_YYYY_MM_DD.json
 *
 * The CSV has per-task scores (23 tasks), and the categories JSON maps tasks
 * to 7 categories: Reasoning, Coding, Agentic Coding, Mathematics,
 * Data Analysis, Language, IF (Instruction Following).
 *
 * We average per-task scores within each category to get category-level scores,
 * then map categories to our domain taxonomy.
 *
 * Run via:
 * 1. Scheduled cron trigger (daily)
 * 2. Manual: POST /admin/sync-livebench
 */

/**
 * Known LiveBench release dates (newest first).
 * The scraper tries each until one succeeds.
 * Update this list when new releases are published.
 */
const KNOWN_RELEASES = [
  '2026_01_08',
  '2025_12_23',
  '2025_11_25',
  '2025_05_30',
  '2025_04_25',
  '2025_04_02',
  '2024_11_25',
  '2024_08_31',
  '2024_07_26',
  '2024_06_24',
];

/**
 * Map LiveBench category names (from categories JSON) to our domain taxonomy.
 */
const CATEGORY_TO_DOMAIN: Record<string, string> = {
  'Coding': 'code',
  'Agentic Coding': 'code',
  'Mathematics': 'math',
  'Reasoning': 'reasoning',
  'Data Analysis': 'math/statistics',
  'Language': 'writing',
  'IF': 'general',
};

/**
 * Map LiveBench category names to benchmark IDs for the benchmark_scores table.
 */
const CATEGORY_TO_BENCHMARK: Record<string, string> = {
  'Coding': 'livebench_coding',
  'Agentic Coding': 'livebench_agentic_coding',
  'Mathematics': 'livebench_math',
  'Reasoning': 'livebench_reasoning',
  'Data Analysis': 'livebench_data_analysis',
  'Language': 'livebench_language',
  'IF': 'livebench_instruction_following',
};

/**
 * Manual mapping of LiveBench model names to OpenRouter model IDs.
 * LiveBench uses its own naming conventions (e.g., version dates, effort levels).
 * We map base model variants and skip effort/thinking variants.
 */
const LIVEBENCH_TO_OPENROUTER: Record<string, string> = {
  // Anthropic
  'claude-3-5-sonnet-20241022': 'anthropic/claude-3.5-sonnet',
  'claude-3-5-haiku-20241022': 'anthropic/claude-3.5-haiku',
  'claude-3-opus-20240229': 'anthropic/claude-3-opus',
  'claude-4-sonnet-20250514-base': 'anthropic/claude-sonnet-4',
  'claude-4-1-opus-20250805-base': 'anthropic/claude-opus-4',
  'claude-sonnet-4-5-20250929': 'anthropic/claude-sonnet-4.5',

  // OpenAI
  'gpt-4o-2024-11-20': 'openai/gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06': 'openai/gpt-4o-2024-08-06',
  'gpt-4o-mini-2024-07-18': 'openai/gpt-4o-mini',
  'o1-2024-12-17': 'openai/o1',
  'o1-mini-2024-09-12': 'openai/o1-mini',
  'o3-mini-2025-01-31-high': 'openai/o3-mini',

  // Google
  'gemini-2.0-flash-001': 'google/gemini-2.0-flash-001',
  'gemini-2.5-flash-preview-04-17': 'google/gemini-2.5-flash-preview',
  'gemini-2.5-pro-preview-05-06': 'google/gemini-2.5-pro-preview',
  'gemini-1.5-pro-002': 'google/gemini-pro-1.5',

  // DeepSeek
  'deepseek-chat-v3-0324': 'deepseek/deepseek-chat',
  'deepseek-r1': 'deepseek/deepseek-r1',

  // Qwen
  'qwen3-235b-a22b-instruct-2507': 'qwen/qwen3-235b-a22b',
  'qwen3-32b-thinking': 'qwen/qwen3-32b',
  'qwen3-30b-a3b-thinking': 'qwen/qwen3-30b-a3b',
  'qwen2.5-72b-instruct': 'qwen/qwen-2.5-72b-instruct',

  // Mistral
  'mistral-large-2411': 'mistralai/mistral-large-2411',

  // Meta
  'llama-3.3-70b-instruct': 'meta-llama/llama-3.3-70b-instruct',
  'llama-4-maverick-17b-128e-instruct': 'meta-llama/llama-4-maverick',
  'llama-4-scout-17b-16e-instruct': 'meta-llama/llama-4-scout',

  // Grok
  'grok-3-mini-beta-high': 'x-ai/grok-3-mini-beta',

  // Other
  'command-a-03-2025': 'cohere/command-a',
  'command-r-plus-08-2024': 'cohere/command-r-plus-08-2024',
};

interface CategoriesMap {
  [category: string]: string[];
}

interface ModelCategoryScores {
  [category: string]: { sum: number; count: number };
}

function normalizeModelId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Build a lookup from normalized model names to OpenRouter IDs.
 * Combines the curated mapping with fuzzy matching against the DB.
 */
function buildModelResolver(
  dbModels: Array<{ id: string; name: string }>
): (livebenchName: string) => string | null {
  // Build normalized lookup from DB models
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

  return (livebenchName: string): string | null => {
    // 1. Try curated mapping first
    const mapped = LIVEBENCH_TO_OPENROUTER[livebenchName];
    if (mapped) return mapped;

    // 2. Try normalized fuzzy match against DB
    const normalized = normalizeModelId(livebenchName);
    if (dbLookup.has(normalized)) {
      return dbLookup.get(normalized)!;
    }

    return null;
  };
}

/**
 * Fetch the CSV and categories JSON for a given release.
 * Returns null if the release is not available.
 */
async function fetchRelease(
  releaseDate: string
): Promise<{ csv: string; categories: CategoriesMap; release: string } | null> {
  const csvUrl = `https://livebench.ai/table_${releaseDate}.csv`;
  const catUrl = `https://livebench.ai/categories_${releaseDate}.json`;

  const [csvResp, catResp] = await Promise.all([
    fetch(csvUrl, { headers: { Accept: 'text/csv, */*' } }),
    fetch(catUrl, { headers: { Accept: 'application/json, */*' } }),
  ]);

  if (!csvResp.ok || !catResp.ok) {
    return null;
  }

  const csv = await csvResp.text();
  const categories = (await catResp.json()) as CategoriesMap;

  return { csv, categories, release: releaseDate };
}

/**
 * Parse the CSV and compute per-model, per-category average scores.
 */
function computeCategoryScores(
  csvText: string,
  categories: CategoriesMap
): Map<string, ModelCategoryScores> {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return new Map();

  const header = lines[0].split(',').map((h) => h.trim());
  const modelIdx = header.indexOf('model');
  if (modelIdx === -1) return new Map();

  // Build task → column index lookup
  const taskColumnIdx = new Map<string, number>();
  for (let i = 0; i < header.length; i++) {
    if (i !== modelIdx) {
      taskColumnIdx.set(header[i], i);
    }
  }

  // Build task → category reverse map
  const taskToCategory = new Map<string, string>();
  for (const [category, tasks] of Object.entries(categories)) {
    for (const task of tasks) {
      taskToCategory.set(task, category);
    }
  }

  const result = new Map<string, ModelCategoryScores>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map((v) => v.trim());
    const modelName = values[modelIdx];
    if (!modelName) continue;

    const categoryScores: ModelCategoryScores = {};

    for (const [task, colIdx] of taskColumnIdx) {
      const category = taskToCategory.get(task);
      if (!category) continue;

      const score = parseFloat(values[colIdx]);
      if (isNaN(score)) continue;

      if (!categoryScores[category]) {
        categoryScores[category] = { sum: 0, count: 0 };
      }
      categoryScores[category].sum += score;
      categoryScores[category].count += 1;
    }

    result.set(modelName, categoryScores);
  }

  return result;
}

/**
 * Scrape LiveBench scores and update benchmark scores.
 */
export async function scrapeLiveBench(
  db: D1Database
): Promise<{ updated: number; errors: string[] }> {
  console.log('[livebench] Fetching leaderboard data from livebench.ai...');

  const errors: string[] = [];
  let updated = 0;

  try {
    // Try each known release date (newest first) until one works
    let releaseData: { csv: string; categories: CategoriesMap; release: string } | null = null;

    for (const release of KNOWN_RELEASES) {
      console.log(`[livebench] Trying release ${release}...`);
      releaseData = await fetchRelease(release);
      if (releaseData) {
        console.log(
          `[livebench] Found release ${release} (${releaseData.csv.length} bytes CSV, ${Object.keys(releaseData.categories).length} categories)`
        );
        break;
      }
    }

    if (!releaseData) {
      const error = 'No LiveBench release found at any known date';
      errors.push(error);
      console.error(`[livebench] ${error}`);
      return { updated: 0, errors };
    }

    // Compute per-model, per-category average scores
    const modelScores = computeCategoryScores(releaseData.csv, releaseData.categories);
    console.log(`[livebench] Parsed ${modelScores.size} models from CSV`);

    // Load available models from DB for fuzzy matching
    const dbModels = await db
      .prepare('SELECT id, name FROM models WHERE is_available = 1')
      .all<{ id: string; name: string }>();
    const resolveModel = buildModelResolver(dbModels.results || []);

    const timestamp = new Date().toISOString();
    const sourceUrl = `https://livebench.ai/#/?release=${releaseData.release}`;

    // Track which models matched for logging
    let matchedCount = 0;
    let skippedCount = 0;

    for (const [livebenchName, categoryScores] of modelScores) {
      const openrouterId = resolveModel(livebenchName);

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

      // Insert scores for each category
      for (const [category, scores] of Object.entries(categoryScores)) {
        if (scores.count === 0) continue;

        const domain = CATEGORY_TO_DOMAIN[category];
        const benchmark = CATEGORY_TO_BENCHMARK[category];
        if (!domain || !benchmark) continue;

        const avgScore = scores.sum / scores.count;

        try {
          await db
            .prepare(
              `INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at)
               VALUES (?, ?, ?, ?, ?, 'livebench', ?, ?)
               ON CONFLICT(model_id, benchmark, domain) DO UPDATE SET
                 score = excluded.score,
                 raw_score = excluded.raw_score,
                 source_url = excluded.source_url,
                 measured_at = excluded.measured_at`
            )
            .bind(openrouterId, benchmark, domain, avgScore, avgScore, sourceUrl, timestamp)
            .run();

          updated++;
        } catch (err) {
          const error = `Failed to insert score for ${openrouterId} / ${category}: ${err}`;
          errors.push(error);
          console.error(`[livebench] ${error}`);
        }
      }

      console.log(`[livebench] Updated scores for ${openrouterId} (${livebenchName})`);
    }

    console.log(
      `[livebench] Complete. Release: ${releaseData.release}. ` +
        `Models matched: ${matchedCount}, skipped: ${skippedCount}. ` +
        `Scores updated: ${updated}.`
    );

    return { updated, errors };
  } catch (err) {
    const error = `LiveBench scrape failed: ${err}`;
    errors.push(error);
    console.error(`[livebench] ${error}`);
    return { updated, errors };
  }
}
