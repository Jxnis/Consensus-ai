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

/**
 * TASK-2: Topic Detection for Smart Routing (mode=default)
 */
export type TopicCategory = 'code' | 'math' | 'science' | 'writing' | 'general';

export function detectTopic(prompt: string): TopicCategory {
  // Score each category with weighted keyword matches
  const scores: Record<TopicCategory, number> = {
    code: 0, math: 0, science: 0, writing: 0, general: 0
  };

  // CODE markers
  const codeMarkers = [
    /\b(function|class|def|import|const|let|var|async|await|return)\b/i,
    /\b(implement|debug|refactor|compile|runtime|typescript|python|javascript|react|API|endpoint|SQL|query|database)\b/i,
    /[{}\[\]();]/, // brackets/semicolons suggest code
    /```/, // markdown code blocks
  ];

  // MATH markers
  const mathMarkers = [
    /\b(calculate|compute|solve|equation|integral|derivative|probability|statistical|algebra|proof|theorem)\b/i,
    /\b(matrix|vector|eigenvalue|polynomial|logarithm|factorial)\b/i,
    /[=+\-*/^].*\d/, // math operators with numbers
  ];

  // SCIENCE markers
  const scienceMarkers = [
    /\b(molecule|enzyme|protein|phenotype|genome|quantum|electron|photon|thermodynamic|reaction|catalyst|spectroscopy)\b/i,
    /\b(hypothesis|experiment|observation|empirical|physics|chemistry|biology|neuroscience)\b/i,
  ];

  // WRITING markers
  const writingMarkers = [
    /\b(write|essay|article|blog|summarize|paraphrase|rewrite|translate|creative|story|poem|email|letter)\b/i,
    /\b(tone|style|persuasive|narrative|draft|edit|proofread)\b/i,
  ];

  codeMarkers.forEach(m => { if (m.test(prompt)) scores.code += 10; });
  mathMarkers.forEach(m => { if (m.test(prompt)) scores.math += 10; });
  scienceMarkers.forEach(m => { if (m.test(prompt)) scores.science += 10; });
  writingMarkers.forEach(m => { if (m.test(prompt)) scores.writing += 10; });

  // Find highest scoring category (default to 'general')
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return (best[1] > 0 ? best[0] : 'general') as TopicCategory;
}
