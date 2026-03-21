/**
 * Chatbot Arena (LMSYS) Scraper
 *
 * Fetches ELO ratings from the Chatbot Arena leaderboard (lmarena.ai).
 * This is the broadest coverage source with 100+ models actively ranked.
 *
 * Data source: https://lmarena.ai/leaderboard/table
 * Format: JSON array of model objects with ELO ratings and confidence intervals
 *
 * ELO ratings (1000-1500 scale):
 * - Overall ELO: general capability
 * - Task-specific ELOs: coding, instruction following, hard prompts, etc.
 *
 * We normalize ELO to 0-100 scale for consistency with other benchmarks:
 * normalized_score = (elo - 1000) / 5  (1000 ELO → 0, 1500 ELO → 100)
 *
 * Run via:
 * 1. Scheduled cron trigger (daily)
 * 2. Manual: POST /admin/sync-chatbot-arena
 */

import {
  ScraperResult,
  buildModelLookup,
  fetchWithRetry,
  upsertBenchmarkScore,
  loadAvailableModels,
  isValidScore,
} from './base';

interface ArenaModelEntry {
  model?: string;
  key?: string;  // Alternative model identifier
  arena_score?: number;  // Overall ELO
  coding_score?: number;  // Coding-specific ELO
  instruction_following_score?: number;
  hard_prompts_score?: number;
  creative_writing_score?: number;
  math_score?: number;
  // Additional fields we might encounter
  [key: string]: unknown;
}

/**
 * Curated mapping of Chatbot Arena model names to OpenRouter IDs
 * Arena uses display names that don't match API identifiers
 */
const ARENA_TO_OPENROUTER: Record<string, string> = {
  // Anthropic
  'Claude 3.5 Sonnet': 'anthropic/claude-3.5-sonnet',
  'Claude 3.5 Haiku': 'anthropic/claude-3.5-haiku',
  'Claude 3 Opus': 'anthropic/claude-3-opus',
  'Claude 4 Sonnet': 'anthropic/claude-sonnet-4',
  'Claude Sonnet 4.5': 'anthropic/claude-sonnet-4.5',
  'Claude 4.6 Opus': 'anthropic/claude-opus-4.6',

  // OpenAI
  'GPT-4o': 'openai/gpt-4o',
  'GPT-4o-mini': 'openai/gpt-4o-mini',
  'GPT-4 Turbo': 'openai/gpt-4-turbo',
  'GPT-4': 'openai/gpt-4',
  'GPT-3.5 Turbo': 'openai/gpt-3.5-turbo',
  'o1': 'openai/o1',
  'o1-mini': 'openai/o1-mini',
  'o1-preview': 'openai/o1-preview',
  'o3-mini': 'openai/o3-mini',

  // Google
  'Gemini 2.0 Flash': 'google/gemini-2.0-flash-001',
  'Gemini 2.5 Flash': 'google/gemini-2.5-flash-preview',
  'Gemini 2.5 Pro': 'google/gemini-2.5-pro-preview',
  'Gemini Pro 1.5': 'google/gemini-pro-1.5',
  'Gemini Flash 1.5': 'google/gemini-flash-1.5',
  'Gemini 3.0 Pro': 'google/gemini-3.0-pro-preview',
  'Gemini 3.1 Ultra': 'google/gemini-3.1-ultra-preview',

  // DeepSeek
  'DeepSeek-V3': 'deepseek/deepseek-chat',
  'DeepSeek-V3.2': 'deepseek/deepseek-chat',
  'DeepSeek-R1': 'deepseek/deepseek-r1',
  'DeepSeek Chat': 'deepseek/deepseek-chat',

  // Meta
  'Llama 3.3 70B': 'meta-llama/llama-3.3-70b-instruct',
  'Llama 3.1 405B': 'meta-llama/llama-3.1-405b-instruct',
  'Llama 3.1 70B': 'meta-llama/llama-3.1-70b-instruct',
  'Llama 4 Maverick': 'meta-llama/llama-4-maverick',
  'Llama 4 Scout': 'meta-llama/llama-4-scout',

  // Qwen
  'Qwen3 235B': 'qwen/qwen3-235b-a22b',
  'Qwen3 32B': 'qwen/qwen3-32b',
  'Qwen2.5 72B': 'qwen/qwen-2.5-72b-instruct',
  'Qwen2.5 32B': 'qwen/qwen-2.5-32b-instruct',

  // Mistral
  'Mistral Large 2': 'mistralai/mistral-large-2407',
  'Mistral Large': 'mistralai/mistral-large-2411',
  'Mistral Small': 'mistralai/mistral-small',

  // Cohere
  'Command R+': 'cohere/command-r-plus',
  'Command R': 'cohere/command-r',

  // X.AI
  'Grok 3 Mini': 'x-ai/grok-3-mini-beta',
  'Grok 2': 'x-ai/grok-2',

  // Others
  'GLM-5': 'z-ai/glm-5',
  'GLM-4': 'z-ai/glm-4',
  'Kimi-k2.5': 'moonshotai/kimi-k2.5',
  'Kimi': 'moonshotai/kimi',
};

/**
 * Map Arena score fields to our benchmark IDs and domains
 */
const SCORE_FIELD_MAPPING: Record<string, { benchmark: string; domain: string }> = {
  arena_score: { benchmark: 'chatbot_arena_overall', domain: 'general' },
  coding_score: { benchmark: 'chatbot_arena_coding', domain: 'code' },
  instruction_following_score: { benchmark: 'chatbot_arena_instruction', domain: 'general' },
  hard_prompts_score: { benchmark: 'chatbot_arena_hard', domain: 'reasoning' },
  creative_writing_score: { benchmark: 'chatbot_arena_writing', domain: 'writing' },
  math_score: { benchmark: 'chatbot_arena_math', domain: 'math' },
};

/**
 * Normalize ELO score (1000-1500) to 0-100 scale
 */
function normalizeElo(elo: number): number {
  // ELO baseline: 1000 = average model → score 0
  // ELO ceiling: 1500 = SOTA model → score 100
  // Linear interpolation
  const normalized = (elo - 1000) / 5;
  return Math.max(0, Math.min(100, normalized));
}

/**
 * Scrape Chatbot Arena leaderboard and update benchmark scores
 */
export async function scrapeChatbotArena(db: D1Database): Promise<ScraperResult> {
  console.log('[chatbot-arena] Fetching leaderboard data from lmarena.ai...');

  const errors: string[] = [];
  let updated = 0;
  let modelsMatched = 0;
  let modelsSkipped = 0;

  try {
    // Try multiple API endpoints (fallback if main endpoint changes)
    const endpoints = [
      'https://lmarena.ai/leaderboard/table',
      'https://lmarena.ai/api/leaderboard',
      'https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard/gradio_api/leaderboard',
    ];

    let response: Response | null = null;
    let data: ArenaModelEntry[] | null = null;

    for (const endpoint of endpoints) {
      try {
        response = await fetchWithRetry(endpoint, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'ArcRouter/1.0 (https://arcrouter.com)',
          },
        });

        if (response.ok) {
          const json = await response.json();
          // Handle different response formats
          data = Array.isArray(json) ? json : json.data || json.models || null;
          if (data && data.length > 0) {
            console.log(`[chatbot-arena] Fetched ${data.length} models from ${endpoint}`);
            break;
          }
        }
      } catch (err) {
        console.log(`[chatbot-arena] Endpoint ${endpoint} failed: ${err}`);
      }
    }

    if (!data || data.length === 0) {
      const error = 'No data available from any Chatbot Arena endpoint';
      errors.push(error);
      console.error(`[chatbot-arena] ${error}`);
      return { updated: 0, errors, source: 'chatbot_arena' };
    }

    const timestamp = new Date().toISOString();
    const dbModels = await loadAvailableModels(db);
    const resolveModel = buildModelLookup(dbModels, ARENA_TO_OPENROUTER);

    // Process each model
    for (const entry of data) {
      const modelName = entry.model || entry.key;
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
      let scoresInserted = 0;

      // Extract and insert all available scores
      for (const [field, mapping] of Object.entries(SCORE_FIELD_MAPPING)) {
        const eloValue = entry[field];
        if (typeof eloValue !== 'number' || !isFinite(eloValue)) {
          continue;
        }

        const normalizedScore = normalizeElo(eloValue);
        if (!isValidScore(normalizedScore)) {
          continue;
        }

        const success = await upsertBenchmarkScore(db, {
          modelId: openrouterId,
          benchmark: mapping.benchmark,
          domain: mapping.domain,
          score: normalizedScore,
          rawScore: eloValue,
          source: 'chatbot_arena',
          sourceUrl: 'https://lmarena.ai/leaderboard',
          measuredAt: timestamp,
        });

        if (success) {
          scoresInserted++;
          updated++;
        } else {
          errors.push(`Failed to insert ${field} score for ${openrouterId}`);
        }
      }

      if (scoresInserted > 0) {
        console.log(
          `[chatbot-arena] Updated ${scoresInserted} scores for ${openrouterId} (${modelName})`
        );
      }
    }

    console.log(
      `[chatbot-arena] Complete. Models matched: ${modelsMatched}, skipped: ${modelsSkipped}. ` +
        `Scores updated: ${updated}.`
    );

    return {
      updated,
      errors,
      source: 'chatbot_arena',
      models_matched: modelsMatched,
      models_skipped: modelsSkipped,
    };
  } catch (err) {
    const error = `Chatbot Arena scrape failed: ${err instanceof Error ? err.message : String(err)}`;
    errors.push(error);
    console.error(`[chatbot-arena] ${error}`);
    return {
      updated,
      errors,
      source: 'chatbot_arena',
      models_matched: modelsMatched,
      models_skipped: modelsSkipped,
    };
  }
}
