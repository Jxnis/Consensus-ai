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

const REASONING_MARKERS = [
  /\b(step by step|chain of thought|think through|reason about|proof)\b/i,
  /\b(why does|explain why|prove that|derive|deduce|infer)\b/i,
  /\b(compare and contrast|trade.?offs?|pros?\s+and\s+cons?)\b/i,
  /\b(plan|strategy|architecture|system design)\b/i,
];

// Agentic request keywords — signals tool-use / file-system / execution context
const AGENTIC_KEYWORDS = [
  /\bread\s+file\b/i, /\bedit\s+file\b/i, /\bwrite\s+file\b/i, /\bdelete\s+file\b/i,
  /\brun\s+test/i, /\bexecute\s+code/i, /\brun\s+command/i, /\bbash\s+command/i,
  /\bdeploy\s+(to|app|service)/i, /\bgit\s+(commit|push|pull|checkout)/i,
  /\bcall\s+(function|tool|api)\b/i, /\buse\s+tool\b/i, /\btool\s+call/i,
  /\bfunction_call\b/i, /\btool_use\b/i,
];

/**
 * Detect if a request is agentic (tool-use, file-system operations, code execution).
 * Checks both the prompt text and the presence of a tools[] array in the request body.
 */
export function detectAgentic(prompt: string, hasToolsArray = false): boolean {
  if (hasToolsArray) return true;
  return AGENTIC_KEYWORDS.some(pattern => pattern.test(prompt));
}

/**
 * Sigmoid confidence calibration for tier classification.
 * Returns 0-1 confidence based on distance from tier boundaries.
 * Low confidence (<0.65) means the prompt is near a tier boundary.
 */
function computeTierConfidence(
  score: number,
  tier: ComplexityTier,
  reasoningHits: number
): number {
  let distance: number;

  if (tier === "SIMPLE") {
    // Boundary at score=12. Low score = high confidence in SIMPLE.
    distance = (12 - score) / 12; // 1.0 at score=0, 0 at score=12
  } else if (tier === "MEDIUM") {
    // Bounded between 12 and 35. Center ~23. Distance from nearest boundary.
    const distLower = score - 12;
    const distUpper = 35 - score;
    distance = Math.min(distLower, distUpper) / 12; // 0 at boundary, 1 at center
  } else {
    // COMPLEX or REASONING. Boundary at score=35.
    distance = Math.min((score - 35) / 40, 1); // 0 at boundary, 1 at score=75
    if (tier === "REASONING" && reasoningHits >= 3) {
      distance = Math.min(distance + 0.3, 1);
    }
  }

  // Sigmoid: sigmoid(8 * distance). Saturates quickly near ±1.
  return 1 / (1 + Math.exp(-8 * distance));
}

/**
 * LocalScorer: Analyzes prompt complexity in <1ms without LLM calls.
 * Follows the "ClawRouter" pattern of fast, deterministic routing.
 */
export function scorePrompt(prompt: string, hasToolsArray = false): ComplexityScore {
  const length = prompt.length;
  let score = 0;
  let reasoningHits = 0;

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

  REASONING_MARKERS.forEach(marker => {
    if (marker.test(prompt)) {
      reasoningHits += 1;
      score += 10;
    }
  });

  // Determine Tier (Refined thresholds)
  let tier: ComplexityTier = "SIMPLE";
  if (score > 35) tier = "COMPLEX";      // Was 40
  else if (score > 12) tier = "MEDIUM";  // Raised from 8 to reduce over-classification

  // REASONING tier: only for difficult prompts with explicit reasoning patterns.
  if (tier === "COMPLEX" && reasoningHits >= 2) {
    tier = "REASONING";
  }

  const confidence = computeTierConfidence(score, tier, reasoningHits);
  const isAgentic = detectAgentic(prompt, hasToolsArray);

  // Low-confidence near SIMPLE/MEDIUM boundary → default to MEDIUM (safer choice)
  if (confidence < 0.65 && tier === "SIMPLE" && score >= 8) {
    return {
      tier: "MEDIUM",
      score,
      confidence,
      isAgentic,
      reason: `Ambiguous (score: ${score}, confidence: ${confidence.toFixed(2)}) — defaulting to MEDIUM`,
    };
  }

  return {
    tier,
    score,
    confidence,
    isAgentic,
    reason: `Self-scored ${tier} (score: ${score}, confidence: ${confidence.toFixed(2)}) based on length and keyword density.`,
  };
}

/**
 * TASK-P4.8: Granular Topic Detection for Smart Routing
 * Two-pass detection: top-level category first, then subcategory refinement
 */
export type TopicCategory =
  | 'code' | 'code/frontend' | 'code/backend' | 'code/algorithms'
  | 'code/devops' | 'code/security' | 'code/debugging'
  | 'math' | 'math/calculus' | 'math/algebra' | 'math/statistics' | 'math/discrete'
  | 'science' | 'science/physics' | 'science/chemistry' | 'science/biology' | 'science/medicine'
  | 'writing' | 'writing/creative' | 'writing/technical' | 'writing/business' | 'writing/academic'
  | 'reasoning' | 'reasoning/logical' | 'reasoning/multistep'
  | 'general';

export interface TopicDetectionResult {
  primary: string;     // Top-level category: 'code', 'math', etc.
  secondary?: string;  // Subcategory: 'code/security', 'math/calculus', etc.
  confidence: number;  // 0-1, based on marker matches
}

// Top-level category markers (improved with better coverage)
const TOP_LEVEL_MARKERS = {
  code: [
    // Programming keywords
    /\b(function|class|def|import|const|let|var|async|await|return)\b/i,
    /\b(implement|debug|refactor|compile|runtime|script|program|algorithm)\b/i,
    // Languages and frameworks
    /\b(typescript|python|javascript|react|vue|angular|rust|go|java|c\+\+|ruby|php)\b/i,
    // Code-specific terms
    /\b(API|endpoint|SQL|query|database|server|frontend|backend|docker|kubernetes|dockerfile)\b/i,
    // CS/algorithm theory terms
    /\b(time complexity|space complexity|big[\s-]?o|O\(n|O\(log|merge sort|quicksort|binary search|hash\s?map|linked list|data structure)\b/i,
    // Syntax indicators
    /[{}\[\]();]/, // brackets/semicolons suggest code
    /```/, // markdown code blocks
    // Explicit code instructions (boosted scoring)
    /write\s+(a|an)\s+(python|javascript|typescript|rust|go|java|c\+\+|sql|bash|shell)/i,
    /\b(code review|pull request|git|github|commit|branch)\b/i,
    // DevOps/Infrastructure (strong signal)
    /\b(create|write|build)\s+(a|an)?\s*(dockerfile|kubernetes|terraform|helm|ansible)/i,
  ],
  math: [
    // Math operations - STRENGTHENED calculus terms
    /\b(calculate|compute|solve|equation|integral|integrate|derivative|differentiate|probability|statistical|algebra|proof|theorem)\b/i,
    /\b(matrix|vector|eigenvalue|polynomial|logarithm|factorial|limit|summation)\b/i,
    // Math topics
    /\b(calculus|geometry|trigonometry|arithmetic|quadratic|linear algebra|differential)\b/i,
    /\b(graph|function|formula|root|coefficient|exponent)\b/i,
    // Statistics - STRENGTHENED
    /\b(mean|median|mode|variance|standard deviation|distribution|regression|hypothesis|p-value)\b/i,
    /\b(dataset|correlation|normal distribution|statistical significance)\b/i,
    // Math notation and functions
    /[=+\-*/^].*\d/, // math operators with numbers
    /\b(sin|cos|tan|sqrt|log|exp|sum)\b/i,
    // Calculus-specific patterns (strong signal to avoid code misclassification)
    /\b(integrate|integral|derivative|differentiate).*(from|to|with respect to|dx|dy|dt|π|pi)\b/i,
  ],
  science: [
    // Physics - EXPANDED
    /\b(physics|force|energy|motion|velocity|acceleration|gravity|newton|mass|momentum|friction)\b/i,
    /\b(quantum|electron|photon|atom|nuclear|radiation|electromagnetic|wave|particle)\b/i,
    /\b(thermodynamic|heat|temperature|pressure|relativity|mechanics)\b/i,
    // Physics concepts (named principles/effects/phenomena)
    /\b(Heisenberg|Schrodinger|Schrödinger|uncertainty principle|entanglement|superposition|Bohr|Planck)\b/i,
    /\b(Doppler|refraction|diffraction|interference|polarization|induction|capacitance|impedance)\b/i,
    /\b(fission|fusion|decay|half-life|isotope|radioactiv)\b/i,
    // Chemistry - EXPANDED
    /\b(chemistry|molecule|element|compound|reaction|chemical|bond|catalyst|acid|base|ion)\b/i,
    /\b(periodic table|valence|oxidation|synthesis|solvent|solution)\b/i,
    // Biology - EXPANDED
    /\b(biology|cell|DNA|RNA|gene|protein|enzyme|organism|species|evolution)\b/i,
    /\b(photosynthesis|respiration|mitosis|meiosis|chromosome|inheritance|ecosystem|replication)\b/i,
    /\b(bacteria|virus|infection|immune|immunity|vaccine|antibody|tissue|organ)\b/i,
    // Astronomy/space
    /\b(black hole|star|galaxy|universe|cosmic|nebula|supernova|dark matter|dark energy|solar system|asteroid|comet)\b/i,
    // General science terms
    /\b(experiment|hypothesis|theory|scientific method|observation|data|measurement)\b/i,
    /\b(climate|atmosphere|earth|geology|earthquake|volcano|ocean|planet)\b/i,
    // "How does X work?" patterns for science topics (strong signal)
    /\b(how does|how do|what causes|what makes)\b.{0,30}\b(work|happen|occur|form|function)\b/i,
  ],
  writing: [
    /\b(write|essay|article|blog|summarize|paraphrase|rewrite|creative|story|poem|email|letter|caption)\b/i,
    /\b(tone|style|persuasive|narrative|draft|edit|proofread|proposal|report|document)\b/i,
    /\b(paragraph|sentence|grammar|vocabulary|rhetoric|composition)\b/i,
    // Marketing and content creation
    /\b(product description|marketing|content|copy|ad|advertisement|press release|whitepaper|newsletter)\b/i,
    /\b(headline|tagline|slogan|brand|pitch)\b/i,
  ],
  reasoning: [
    /\b(logic|puzzle|deduce|infer|strategy|plan|optimize|multi-step|reasoning|syllogism)\b/i,
    /\b(if.*then|premise|conclusion|argument|fallacy|contradict|valid|invalid)\b/i,
    /\b(problem.?solving|critical thinking|decision|workflow|sequence|stages|process)\b/i,
    /\ball\s+\w+\s+are\s+\w+/i,  // Logical statements like "all cats are animals"
    /\bgiven.*premises?\b/i,  // Premise-based reasoning
    /\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?|compare\s+and\s+contrast|trade.?offs?)\b/i,
    /\b(analyze|evaluate|assess)\s+(the\s+)?(pros|benefits|arguments|implications|impact)\b/i,
    /\bwhat\s+(can|do)\s+we\s+(conclude|infer|deduce)\b/i,
    /\b(logical|reasoning)\s+(fallacy|error|flaw)\b/i,
  ],
};

// Negative signals - reduce score if these conflict with detected category
const NEGATIVE_SIGNALS: Record<string, RegExp[]> = {
  // If "write" appears with code terms, it's code not writing
  writing: [
    /write\s+(a|an)\s+(function|class|script|program|code|algorithm)/i,
    /write.*python|javascript|typescript|sql|bash/i,
    // Simple translation is general, not writing
    /translate\s+["']?\w+["']?\s+(to|into|in)\s+\w+/i,
  ],
  // If asking "what is X" about a science topic, it's science not general
  general: [
    /\b(what is|explain|describe|how does|why does).*(physics|chemistry|biology|DNA|photosynthesis|gravity|evolution|quantum)/i,
  ],
};

// Subcategory markers (only checked if top-level confidence is high)
const SUBCATEGORY_MARKERS = {
  'code/frontend': [/react/i, /vue/i, /angular/i, /css/i, /html/i, /dom/i, /component/i, /\bui\b/i, /layout/i, /responsive/i, /tailwind/i, /next\.?js/i],
  'code/backend': [/api/i, /server/i, /database/i, /rest/i, /graphql/i, /middleware/i, /endpoint/i, /express/i, /django/i, /flask/i, /node/i],
  'code/algorithms': [/sort/i, /search/i, /tree/i, /graph/i, /dynamic programming/i, /big-?o/i, /complexity/i, /linked list/i, /recursion/i],
  'code/devops': [/docker/i, /kubernetes/i, /ci.?cd/i, /deploy/i, /terraform/i, /pipeline/i, /container/i, /cloudflare/i, /aws/i, /gcp/i],
  'code/security': [/auth/i, /encrypt/i, /vulnerab/i, /xss/i, /sql injection/i, /csrf/i, /oauth/i, /jwt/i, /password/i, /secure/i],
  'code/debugging': [/error/i, /bug/i, /stack trace/i, /debug/i, /crash/i, /undefined/i, /\bnull\b/i, /exception/i, /fix/i],

  'math/calculus': [/integral/i, /derivative/i, /limit/i, /differentiat/i, /taylor/i, /series/i],
  'math/algebra': [/equation/i, /linear algebra/i, /matrix/i, /eigenvalue/i, /polynomial/i, /quadratic/i],
  'math/statistics': [/probability/i, /distribution/i, /hypothesis/i, /p-value/i, /regression/i, /mean/i, /variance/i, /standard deviation/i, /\bhypothesis testing\b/i, /\bp-value\b/i],
  'math/discrete': [/combinatorics/i, /permutation/i, /graph theory/i, /set theory/i, /boolean/i, /proof/i],

  'science/physics': [/mechanics/i, /quantum/i, /thermodynamic/i, /electromagnetism/i, /relativity/i, /force/i, /energy/i, /momentum/i],
  'science/chemistry': [/reaction/i, /molecular/i, /organic/i, /inorganic/i, /bond/i, /catalyst/i, /synthesis/i, /compound/i],
  'science/biology': [/genetics/i, /cell/i, /ecology/i, /evolution/i, /dna/i, /rna/i, /protein/i, /organism/i],
  'science/medicine': [/clinical/i, /pharmacology/i, /diagnostic/i, /patient/i, /treatment/i, /disease/i, /symptom/i, /drug/i],

  'writing/creative': [/story/i, /poem/i, /narrative/i, /fiction/i, /character/i, /plot/i, /creative/i],
  'writing/technical': [/documentation/i, /manual/i, /api reference/i, /tutorial/i, /technical/i, /specification/i],
  'writing/business': [/email/i, /proposal/i, /report/i, /meeting/i, /professional/i, /corporate/i],
  'writing/academic': [/paper/i, /citation/i, /abstract/i, /research/i, /thesis/i, /journal/i, /scholarly/i],

  'reasoning/logical': [/logic/i, /deduce/i, /infer/i, /syllogism/i, /premise/i, /conclusion/i, /proof/i, /contradict/i, /fallacy/i, /if.*then/i, /boolean/i, /valid.*syllogism/i, /\bwet.*ground/i],
  'reasoning/multistep': [/multi-?step/i, /\bplan\b/i, /strategy/i, /sequence/i, /step-by-step/i, /chain/i, /\bprocess\b/i, /workflow/i, /stages/i, /create.*plan/i],
};

/**
 * Detect topic category with two-pass approach
 * Pass 1: Detect top-level category (code, math, science, writing, general, reasoning)
 * Pass 2: If high confidence, detect subcategory (code/security, math/calculus, etc.)
 */
export function detectTopic(prompt: string): TopicCategory {
  const result = detectTopicDetailed(prompt);
  return (result.secondary || result.primary) as TopicCategory;
}

/**
 * Detailed topic detection with confidence scores
 * Returns both primary and secondary categories
 */
export function detectTopicDetailed(prompt: string): TopicDetectionResult {
  // Pass 1: Detect top-level category
  const topLevelScores: Record<string, number> = {
    code: 0,
    math: 0,
    science: 0,
    writing: 0,
    reasoning: 0,
    general: 0,
  };

  // Score each category based on marker matches
  for (const [category, markers] of Object.entries(TOP_LEVEL_MARKERS)) {
    for (const marker of markers) {
      if (marker.test(prompt)) {
        // Boost code detection when "write a [language]" pattern appears
        if (category === 'code' && /write\s+(a|an)\s+(python|javascript|typescript|rust|go|java|sql|bash)/i.test(prompt)) {
          topLevelScores[category] += 20; // Strong signal
        } else {
          topLevelScores[category] += 10;
        }
      }
    }
  }

  // Apply negative signals
  for (const [category, negativeMarkers] of Object.entries(NEGATIVE_SIGNALS)) {
    for (const marker of negativeMarkers) {
      if (marker.test(prompt)) {
        topLevelScores[category] -= 15; // Penalize conflicting categories
      }
    }
  }

  // Boost science for explicit science questions that might be misclassified as general
  if (/\b(explain|describe|what is|how does|why does|how do|what causes|what makes)\b.*\b(physics|chemistry|biology|science|scientific|quantum|atom|molecule|cell|gene|black hole|star|galaxy|planet|gravity|evolution|photosynthesis|DNA|RNA|electron|proton|neutron|vaccine|immunity|immune|Doppler|fission|fusion|thermodynamic|electromagnetic|spectrum|replication|respiration|mitosis|ecosystem)\b/i.test(prompt)) {
    topLevelScores.science += 15;
  }

  // "laws of thermodynamics" style prompts should strongly bias to science.
  if (/\b(laws?\s+of)\b.{0,24}\b(thermodynamics?|motion|physics|conservation)\b/i.test(prompt)) {
    topLevelScores.science += 20;
  }

  // Matrix notation can look like code due to brackets. Boost math when matrix terms exist.
  if (/\[\[.*\]\]/.test(prompt) && /\b(matrix|inverse|determinant|eigenvalue|eigenvector)\b/i.test(prompt)) {
    topLevelScores.math += 20;
    topLevelScores.code -= 10;
  }

  // Find best top-level category
  const sortedTopLevel = Object.entries(topLevelScores)
    .sort((a, b) => b[1] - a[1])
    .filter(([_, score]) => score > 0); // Only consider positive scores

  if (sortedTopLevel.length === 0) {
    return {
      primary: 'general',
      confidence: 0,
    };
  }

  const [primaryCategory, primaryScore] = sortedTopLevel[0];

  // Calculate confidence (0-1 scale, saturates at score=50)
  const confidence = Math.min(primaryScore / 50, 1.0);

  // Pass 2: If confidence is high enough, try subcategory detection
  // Lowered from 0.4 to 0.3 to allow better subcategory detection
  if (confidence >= 0.3) {
    // Only check subcategories for this primary category
    const subcategoryPrefix = `${primaryCategory}/`;
    let bestSubcategory: string | null = null;
    let bestSubcategoryScore = 0;

    for (const [subcategory, markers] of Object.entries(SUBCATEGORY_MARKERS)) {
      if (!subcategory.startsWith(subcategoryPrefix)) {
        continue;
      }

      let score = 0;
      for (const marker of markers) {
        if (marker.test(prompt)) {
          score += 10;
        }
      }

      if (score > bestSubcategoryScore) {
        bestSubcategoryScore = score;
        bestSubcategory = subcategory;
      }
    }

    // Use subcategory if we have at least one match
    if (bestSubcategory && bestSubcategoryScore > 0) {
      return {
        primary: primaryCategory,
        secondary: bestSubcategory,
        confidence,
      };
    }
  }

  // Return top-level category only
  return {
    primary: primaryCategory,
    confidence,
  };
}
