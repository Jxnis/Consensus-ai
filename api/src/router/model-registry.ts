// TASK-2: Model Performance Registry for Smart Routing (mode=default)
import { TopicCategory } from './scorer';
import type { ComplexityTier } from '../types';

export interface ModelProfile {
  id: string;                              // OpenRouter model ID
  name: string;                            // Human readable
  inputPricePer1M: number;                 // USD per 1M input tokens
  outputPricePer1M: number;                // USD per 1M output tokens
  contextLength: number;                   // Max tokens
  isFree: boolean;
  strengths: Partial<Record<TopicCategory, number>>;  // 0-100 score per topic
  overall: number;                         // 0-100 composite score
}

// Hardcoded for v1 — replace with DB lookup + benchmark data later
export const MODEL_REGISTRY: ModelProfile[] = [
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3.2',
    inputPricePer1M: 0.14,
    outputPricePer1M: 0.28,
    contextLength: 64000,
    isFree: false,
    strengths: { science: 80, math: 85, code: 89, writing: 75, general: 80 },
    overall: 82,
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    inputPricePer1M: 3.00,
    outputPricePer1M: 15.00,
    contextLength: 200000,
    isFree: false,
    strengths: { science: 83, math: 88, code: 93, writing: 90, general: 87 },
    overall: 88,
  },
  {
    id: 'moonshotai/kimi-k2.5',
    name: 'Kimi K2.5',
    inputPricePer1M: 0.35,
    outputPricePer1M: 0.35,
    contextLength: 128000,
    isFree: false,
    strengths: { science: 88, math: 87, code: 91, writing: 85, general: 87 },
    overall: 88,
  },
  {
    id: 'z-ai/glm-5',
    name: 'GLM-5',
    inputPricePer1M: 0.10,
    outputPricePer1M: 0.10,
    contextLength: 128000,
    isFree: false,
    strengths: { science: 86, math: 83, code: 85, writing: 80, general: 83 },
    overall: 83,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    inputPricePer1M: 0.04,
    outputPricePer1M: 0.04,
    contextLength: 128000,
    isFree: false,
    strengths: { science: 47, math: 70, code: 81, writing: 65, general: 66 },
    overall: 66,
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-instruct',
    name: 'Qwen3 Next 80B',
    inputPricePer1M: 0.04,
    outputPricePer1M: 0.04,
    contextLength: 128000,
    isFree: false,
    strengths: { science: 71, math: 78, code: 85, writing: 70, general: 75 },
    overall: 76,
  },
  {
    id: 'google/gemma-3-27b-it:free',
    name: 'Gemma 3 27B (Free)',
    inputPricePer1M: 0,
    outputPricePer1M: 0,
    contextLength: 8192,
    isFree: true,
    strengths: { science: 45, math: 60, code: 72, writing: 62, general: 60 },
    overall: 60,
  },
];

/**
 * Select best model based on topic, complexity, and budget constraints
 */
export function selectBestModel(
  topic: TopicCategory,
  complexity: ComplexityTier,
  budget: string
): ModelProfile {
  let candidates = MODEL_REGISTRY;

  // Budget filter
  if (budget === 'free' || budget === '') {
    candidates = candidates.filter(m => m.isFree);
  } else if (budget === 'low') {
    candidates = candidates.filter(m => m.inputPricePer1M < 0.5);
  } else if (budget === 'medium') {
    candidates = candidates.filter(m => m.inputPricePer1M < 5.0);
  }
  // 'high' = all models

  // If no candidates match budget, fallback to all models
  if (candidates.length === 0) {
    candidates = MODEL_REGISTRY;
  }

  // Sort by topic-specific score (descending), then by price (ascending) as tiebreaker
  candidates.sort((a, b) => {
    const scoreA = a.strengths[topic] ?? a.overall;
    const scoreB = b.strengths[topic] ?? b.overall;
    if (scoreB !== scoreA) return scoreB - scoreA;  // Higher score first
    return a.inputPricePer1M - b.inputPricePer1M;   // Cheaper first on tie
  });

  return candidates[0]; // Best model for this topic+budget combo
}
