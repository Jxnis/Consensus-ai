import { ComplexityScore, ComplexityTier } from "../types";

const COMPLEX_MARKERS = [
  /code/i, /function/i, /debug/i, /algorithm/i, /implement/i,
  /mathematics/i, /proof/i, /derive/i, /calculate/i,
  /architecture/i, /design/i, /refactor/i,
  /deep/i, /analyze/i, /exhaustive/i, /detailed/i,
  /summary/i, /essay/i, /write a/i,
  /\{/ , /\}/, /\[/, /\]/, // Often found in code/json
  /\b(if|else|for|while|return|class|def|async|await)\b/i
];

const MEDIUM_MARKERS = [
  /explain/i, /how to/i, /what is/i, /why/i,
  /compare/i, /difference/i, /pro/i, /con/i,
  /list/i, /steps/i, /guide/i,
  /relationship/i, /implication/i
];

/**
 * LocalScorer: Analyzes prompt complexity in <1ms without LLM calls.
 * Follows the "ClawRouter" pattern of fast, deterministic routing.
 */
export function scorePrompt(prompt: string): ComplexityScore {
  const length = prompt.length;
  let score = 0;

  // Length based scoring (improved)
  if (length > 1000) score += 40;
  else if (length > 200) score += 20;
  else if (length > 50) score += 5;
  else if (length < 20) score -= 5;

  // Complex markers (weighted higher)
  COMPLEX_MARKERS.forEach(marker => {
    if (marker.test(prompt)) score += 10;
  });

  // Medium markers (weighted higher)
  MEDIUM_MARKERS.forEach(marker => {
    if (marker.test(prompt)) score += 5;
  });

  // Determine Tier (Refined thresholds)
  let tier: ComplexityTier = "SIMPLE";
  if (score > 35) tier = "COMPLEX";      // Was 40
  else if (score > 12) tier = "MEDIUM";  // Raised from 8 to reduce over-classification

  return {
    tier,
    score,
    reason: `Self-scored ${tier} (score: ${score}) based on length and keyword density.`
  };
}
