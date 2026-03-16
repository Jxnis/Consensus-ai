/**
 * Base Scraper Framework
 *
 * Provides common utilities for all benchmark scrapers:
 * - Standardized error handling
 * - Model name normalization and matching
 * - Rate limiting and caching
 * - Logging and metrics
 *
 * All scrapers return { updated: number; errors: string[]; source: string }
 */

export interface ScraperResult {
  updated: number;
  errors: string[];
  source: string;
  models_matched?: number;
  models_skipped?: number;
}

export interface ModelRow {
  id: string;
  name: string;
}

/**
 * Normalize model identifier for fuzzy matching
 * Removes all non-alphanumeric characters and converts to lowercase
 */
export function normalizeModelId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Build a lookup map from model names/IDs to OpenRouter IDs
 * Supports fuzzy matching via multiple candidate strings per model
 */
export function buildModelLookup(
  dbModels: ModelRow[],
  curatedMappings?: Record<string, string>
): (sourceName: string) => string | null {
  // Build normalized lookup from DB
  const lookup = new Map<string, string>();
  for (const row of dbModels) {
    const candidates = [
      row.id,
      row.name,
      row.id.split('/').pop() || row.id,
      // Add common variations
      row.name.replace(' ', '-'),
      row.name.replace('-', ' '),
    ];

    for (const candidate of candidates) {
      const key = normalizeModelId(candidate);
      if (!lookup.has(key)) {
        lookup.set(key, row.id);
      }
    }
  }

  return (sourceName: string): string | null => {
    // 1. Try curated mapping first (highest priority)
    if (curatedMappings?.[sourceName]) {
      return curatedMappings[sourceName];
    }

    // 2. Try exact normalized match
    const normalized = normalizeModelId(sourceName);
    if (lookup.has(normalized)) {
      return lookup.get(normalized)!;
    }

    // 3. Try partial match (for versioned models)
    // e.g., "gpt-4o-2024-11-20" → "gpt-4o"
    const parts = sourceName.split(/[-_]/);
    for (let i = parts.length; i >= 2; i--) {
      const partial = normalizeModelId(parts.slice(0, i).join(''));
      if (lookup.has(partial)) {
        return lookup.get(partial)!;
      }
    }

    return null;
  };
}

/**
 * Fetch with timeout and retry logic
 * Retries on network errors but NOT on 4xx/5xx (those are likely permanent)
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  timeoutMs = 30000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Don't retry on HTTP errors - they're likely permanent
      if (!response.ok) {
        return response;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on AbortError (timeout)
      if (lastError.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
      }

      // Exponential backoff for network errors
      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[scraper] Retry ${attempt}/${maxRetries} after ${delayMs}ms: ${url}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch after ${maxRetries} retries: ${url}`);
}

/**
 * Insert or update a benchmark score
 * Returns true if successful, false if error (but doesn't throw)
 */
export async function upsertBenchmarkScore(
  db: D1Database,
  params: {
    modelId: string;
    benchmark: string;
    domain: string;
    score: number;
    rawScore?: number;
    source: string;
    sourceUrl?: string;
    measuredAt: string;
  }
): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(model_id, benchmark, domain) DO UPDATE SET
           score = excluded.score,
           raw_score = excluded.raw_score,
           source_url = excluded.source_url,
           measured_at = excluded.measured_at`
      )
      .bind(
        params.modelId,
        params.benchmark,
        params.domain,
        params.score,
        params.rawScore ?? params.score,
        params.source,
        params.sourceUrl ?? null,
        params.measuredAt
      )
      .run();

    return true;
  } catch (err) {
    console.error(`[scraper] Failed to upsert score for ${params.modelId}/${params.benchmark}:`, err);
    return false;
  }
}

/**
 * Load all available models from DB for fuzzy matching
 */
export async function loadAvailableModels(db: D1Database): Promise<ModelRow[]> {
  const result = await db
    .prepare('SELECT id, name FROM models WHERE is_available = 1')
    .all<ModelRow>();

  return result.results || [];
}

/**
 * Validate score value (must be 0-100, finite number)
 */
export function isValidScore(score: unknown): score is number {
  return (
    typeof score === 'number' &&
    !isNaN(score) &&
    isFinite(score) &&
    score >= 0 &&
    score <= 100
  );
}

/**
 * CSV parser utility (simple, no dependencies)
 * Handles quoted fields and commas within quotes
 */
export function parseCSV(text: string): string[][] {
  const lines = text.trim().split('\n');
  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    fields.push(current.trim());
    rows.push(fields);
  }

  return rows;
}
