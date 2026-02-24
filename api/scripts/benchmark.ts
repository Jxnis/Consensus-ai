#!/usr/bin/env tsx
/**
 * CouncilRouter Benchmark Runner
 *
 * Tests confidence calibration and quality metrics across multiple models
 * Usage: tsx api/scripts/benchmark.ts <dataset_name> --model <model_name>
 * Example: tsx api/scripts/benchmark.ts factual_custom --model councilrouter_free
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process'; // TASK-31aa: Code execution

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COUNCILROUTER_API_URL = process.env.BENCHMARK_API_URL || 'https://consensus-api.janis-ellerbrock.workers.dev/v1/chat/completions';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = process.env.BENCHMARK_API_KEY || ''; // For CouncilRouter playground tier
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''; // For direct competitor benchmarks

interface TestCase {
  id: string;
  question: string;
  answer: string;
  category?: string;
  difficulty?: string;
  solution?: string;
  test?: string; // For code execution tasks
  type?: 'factual' | 'math' | 'code'; // Dataset type
}

interface ModelConfig {
  id: string;
  budget?: string;
  name: string;
  description: string;
  cost_per_request: number;
}

interface BenchmarkConfig {
  models: Record<string, ModelConfig>;
  datasets: Record<string, unknown>;
  experiments: Record<string, unknown>;
}

interface BenchmarkResult {
  id: string;
  question: string;
  ground_truth: string;
  model_answer: string;
  model_answer_raw: string;        // TASK-31t: Full model response
  grading_method: string;           // TASK-31t: Which check passed
  confidence: number;
  is_correct: boolean;
  complexity_tier: string;
  latency_ms: number;
  cost_usd: number;
  votes?: any[];
  council_size: number;             // TASK-31v: Number of models that responded
  execution_output?: string;        // TASK-31aa: Code execution output for debugging
}

interface CalibrationMetrics {
  total_cases: number;
  accuracy: number;
  avg_confidence: number;
  ece: number; // Expected Calibration Error
  brier_score: number;
  confidence_bins: {
    range: string;
    count: number;
    accuracy: number;
    avg_confidence: number;
  }[];
  confidence_intervals?: {    // TASK-31ab: Bootstrap 95% CIs
    accuracy_95ci: [number, number];
    ece_95ci: [number, number];
    brier_95ci: [number, number];
  };
}

async function runInference(
  question: string,
  modelConfig: ModelConfig,
  isCouncilRouter: boolean
): Promise<{
  answer: string;
  confidence: number;
  tier: string;
  latency_ms: number;
  votes?: any[];
  cost_usd: number;
}> {
  const startTime = Date.now();

  if (isCouncilRouter) {
    // CouncilRouter path (councilrouter_free, councilrouter_paid)
    const response = await fetch(COUNCILROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: 'council-router-v1',
        messages: [{ role: 'user', content: question }],
        budget: modelConfig.budget || 'free',
      }),
    });

    if (!response.ok) {
      throw new Error(`CouncilRouter API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as any;
    const latency_ms = Date.now() - startTime;

    return {
      answer: data.choices[0].message.content,
      confidence: data.consensus?.confidence ?? 0,
      tier: data.consensus?.tier ?? 'UNKNOWN',
      latency_ms,
      votes: data.consensus?.votes,
      cost_usd: modelConfig.cost_per_request, // Use configured cost for CouncilRouter
    };
  } else {
    // OpenRouter path (single model: GPT-4o-mini, Claude Opus, etc.)
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY required for competitor benchmarks');
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://councilrouter.ai',
        'X-Title': 'CouncilRouter Benchmarking',
      },
      body: JSON.stringify({
        model: modelConfig.id,
        messages: [{ role: 'user', content: question }],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json() as any;
    const latency_ms = Date.now() - startTime;

    // Extract cost from OpenRouter response headers or estimate
    const totalCost = parseFloat(response.headers.get('x-total-cost') || '0') || modelConfig.cost_per_request;

    // TASK-31u: Use -1 for competitors (no consensus mechanism)
    return {
      answer: data.choices[0].message.content,
      confidence: -1, // No consensus mechanism — confidence not measurable
      tier: 'SINGLE_MODEL',
      latency_ms,
      votes: undefined,
      cost_usd: totalCost,
    };
  }
}

// TASK-31s: Word-to-number conversion map
const WORD_TO_NUMBER: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13',
  fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30',
  forty: '40', fifty: '50', sixty: '60', seventy: '70',
  eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
};

function convertWordsToNumbers(text: string): string {
  let result = text.toLowerCase();
  for (const [word, digit] of Object.entries(WORD_TO_NUMBER)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
  }
  return result;
}

function extractNumericAnswer(text: string): string {
  // TASK-31s: Apply word-to-number conversion first
  const converted = convertWordsToNumbers(text);

  // Try to extract the final number from the response
  // Look for patterns like "The answer is X" or just numbers at the end
  const patterns = [
    /(?:answer is|equals?|=)\s*\$?([0-9,]+(?:\.[0-9]+)?)/i,
    /\$?([0-9,]+(?:\.[0-9]+)?)\s*$/,
    /^([0-9,]+(?:\.[0-9]+)?)/,
  ];

  for (const pattern of patterns) {
    const match = converted.match(pattern);
    if (match) {
      return match[1].replace(/,/g, '');
    }
  }

  return text.trim();
}

// TASK-31aa: Extract Python code from model response
function extractPythonCode(text: string): string {
  // Remove markdown code fences
  let code = text.replace(/```python\n?/g, '').replace(/```\n?/g, '');

  // If there's still markdown formatting, try to extract just the function
  const functionMatch = code.match(/def\s+\w+\s*\([^)]*\):[\s\S]+?(?=\n\n|\n#|\nif\s+__name__|$)/);
  if (functionMatch) {
    return functionMatch[0].trim();
  }

  return code.trim();
}

// TASK-31aa: Execute Python code with test assertions
function executePythonCode(modelCode: string, testCode: string): { success: boolean; output: string } {
  try {
    const extractedCode = extractPythonCode(modelCode);
    const combinedCode = `${extractedCode}\n\n${testCode}`;

    // Execute with 5s timeout, no network access
    const result = spawnSync('python3', ['-c', combinedCode], {
      timeout: 5000,
      encoding: 'utf-8',
      shell: false, // Security: no shell injection
    });

    if (result.error) {
      return { success: false, output: `Execution error: ${result.error.message}` };
    }

    if (result.status === 0) {
      return { success: true, output: result.stdout || 'Tests passed' };
    } else {
      const errorOutput = result.stderr || result.stdout || 'Unknown error';
      return { success: false, output: errorOutput.slice(0, 500) }; // Limit error output
    }
  } catch (error) {
    return { success: false, output: `Exception: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function checkAnswer(
  modelAnswer: string,
  groundTruth: string,
  datasetType: string = 'factual',
  testCode?: string, // TASK-31aa: Test assertions for code execution
  question?: string  // TASK-31-FIX-8: Question text for MC option fallback
): { is_correct: boolean; grading_method: string; execution_output?: string } {
  // TASK-31j: Dataset-aware evaluators

  // TASK-31aa: Code execution with test assertions
  if (datasetType === 'code' && testCode) {
    const execResult = executePythonCode(modelAnswer, testCode);
    return {
      is_correct: execResult.success,
      grading_method: 'code_execution',
      execution_output: execResult.output
    };
  } else if (datasetType === 'code') {
    // Fallback to string matching if no test code provided
    const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const isCorrect = normalize(modelAnswer).includes(normalize(groundTruth));
    return { is_correct: isCorrect, grading_method: 'code_string_match' };
  }

  // TASK-31z: Multiple-choice handling (MMLU format)
  // If ground truth is a single letter (A/B/C/D), extract the model's CHOSEN letter
  if (/^[A-D]$/i.test(groundTruth.trim())) {
    const targetLetter = groundTruth.trim().toUpperCase();
    // TASK-31-FIX-1: Robust multiple-choice letter extraction
    // Priority-ordered patterns, tested against all known model response formats.
    // CRITICAL: These patterns must NOT match "A" from the word "answer" or
    // the English article "A" at the start of sentences.
    const extractPatterns = [
      // 1. Boxed answer (LaTeX): \boxed{B} or \boxed{\text{B}}
      /\\boxed\{\\text\{([A-D])\}\}/i,
      /\\boxed\{([A-D])\}/i,
      // 2. "the answer is (B)" / "correct answer is B" / "answer is **B**"
      //    Key fix: match "answer is" as a PHRASE, so "A" in "answer" is never captured
      /\banswer\s+is\s*:?\s*\*{0,2}\(?([A-D])\)?\*{0,2}\b/i,
      // 3. "the correct answer/option/choice is (B)"
      /\bcorrect\s+(?:answer|option|choice)\s+is\s*:?\s*\*{0,2}\(?([A-D])\)?\*{0,2}\b/i,
      // 4. "Answer: B" or "Answer: (B)" — colon required to avoid matching prose
      /\b(?:answer|choice)\s*:\s*\*{0,2}\(?([A-D])\)?\*{0,2}/i,
      // 5. Letter in parentheses: (B) or **(B)** — very reliable signal
      /\*{0,2}\(([A-D])\)\*{0,2}/,
      // 6. Standalone letter at start of line: "B. Because..." or "B) ..."
      //    Requires a delimiter after the letter to avoid matching articles
      /^\s*\*{0,2}([A-D])\*{0,2}\s*[\)\.:\-,]/m,
      // 7. Bare letter only (entire response is just "B" or "**B**" possibly with whitespace)
      /^\s*\*{0,2}([A-D])\*{0,2}\s*$/m,
    ];
    let chosenLetter: string | null = null;
    for (const pattern of extractPatterns) {
      const match = modelAnswer.match(pattern);
      if (match) {
        chosenLetter = match[1].toUpperCase();
        break;
      }
    }

    // TASK-31-FIX-8: Option-text fallback when letter extraction fails
    // If model says "the answer is hydrogen" instead of "(B)", parse question
    // to find which option text matches
    if (chosenLetter === null && question) {
      // Parse question for option mappings: "(A) mRNA (B) tRNA (C) dRNA (D) rRNA"
      // Pattern: (LETTER) text until next (LETTER) or end
      const optionRegex = /\(([A-D])\)\s*([^(]+?)(?=\s*\([A-D]\)|$)/gi;
      const optionMap: Record<string, string> = {};
      let optMatch;

      while ((optMatch = optionRegex.exec(question)) !== null) {
        const letter = optMatch[1].toUpperCase();
        const text = optMatch[2].trim();
        optionMap[letter] = text;
      }

      // If we found options, check which one(s) the model mentions
      if (Object.keys(optionMap).length > 0) {
        const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const normalizedAnswer = normalizeText(modelAnswer);

        const matches: { letter: string; count: number }[] = [];

        for (const [letter, optionText] of Object.entries(optionMap)) {
          const normalizedOption = normalizeText(optionText);

          // Check if the full option text appears first (strongest signal)
          if (normalizedAnswer.includes(normalizedOption)) {
            matches.push({ letter, count: 10 }); // High score for exact match
            continue;
          }

          // Otherwise, count word matches
          // Split option into significant words (ignore "a", "the", "is", etc.)
          const words = normalizedOption.split(/\s+/).filter(w => w.length > 2);

          if (words.length === 0) continue; // Skip if no significant words

          let matchedWords = 0;
          let totalMentions = 0;

          for (const word of words) {
            const regex = new RegExp(`\\b${word}\\b`, 'g');
            const wordMatches = normalizedAnswer.match(regex);
            if (wordMatches) {
              matchedWords++;
              totalMentions += wordMatches.length;
            }
          }

          // Require at least 75% of option's words to be present
          const wordCoverage = matchedWords / words.length;
          if (wordCoverage >= 0.75) {
            matches.push({ letter, count: totalMentions });
          }
        }

        // If exactly ONE option has matches, use it
        // If multiple, pick the one with highest count IF it's clearly dominant
        if (matches.length === 1) {
          chosenLetter = matches[0].letter;
        } else if (matches.length > 1) {
          matches.sort((a, b) => b.count - a.count);
          // Use top match only if it has 2x more mentions than second
          if (matches[0].count >= matches[1].count * 2) {
            chosenLetter = matches[0].letter;
          }
        }
      }
    }

    const isCorrect = chosenLetter === targetLetter;
    return { is_correct: isCorrect, grading_method: 'multiple_choice' };
  }

  // Factual/Math: deterministic grading
  const normalize = (s: string) => {
    // TASK-31s: Apply word-to-number conversion FIRST
    let normalized = convertWordsToNumbers(s);

    // Convert Unicode subscripts/superscripts to regular digits
    const subscriptMap: Record<string, string> = {
      '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
      '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    };
    const superscriptMap: Record<string, string> = {
      '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
      '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    };

    for (const [sub, digit] of Object.entries(subscriptMap)) {
      normalized = normalized.replace(new RegExp(sub, 'g'), digit);
    }
    for (const [sup, digit] of Object.entries(superscriptMap)) {
      normalized = normalized.replace(new RegExp(sup, 'g'), digit);
    }

    return normalized.toLowerCase().trim().replace(/[.,\s*]/g, '');
  };

  const normalizedModel = normalize(extractNumericAnswer(modelAnswer));
  const normalizedTruth = normalize(groundTruth);

  // Check exact match
  if (normalizedModel === normalizedTruth) {
    return { is_correct: true, grading_method: 'exact_match' };
  }

  // Check if ground truth is contained in model answer (for word answers)
  const normalizedModelFull = normalize(modelAnswer);
  if (normalizedModelFull.includes(normalizedTruth)) {
    return { is_correct: true, grading_method: 'contains_truth' };
  }

  // TASK-31s: Check word-number equivalence (e.g., "seven" == "7")
  const modelWithWords = convertWordsToNumbers(modelAnswer.toLowerCase());
  const truthWithWords = convertWordsToNumbers(groundTruth.toLowerCase());
  if (modelWithWords.includes(truthWithWords)) {
    return { is_correct: true, grading_method: 'word_number_match' };
  }

  // Check numeric equivalence
  const modelNum = parseFloat(normalizedModel);
  const truthNum = parseFloat(normalizedTruth);
  if (!isNaN(modelNum) && !isNaN(truthNum) && Math.abs(modelNum - truthNum) < 0.01) {
    return { is_correct: true, grading_method: 'numeric_equivalence' };
  }

  return { is_correct: false, grading_method: 'no_match' };
}

// TASK-31ab: Bootstrap 95% confidence interval
function bootstrapCI(
  results: BenchmarkResult[],
  metric: (r: BenchmarkResult[]) => number,
  nBoot: number = 1000
): [number, number] {
  if (results.length === 0) return [0, 0];

  const samples: number[] = [];
  for (let i = 0; i < nBoot; i++) {
    // Resample with replacement
    const sample: BenchmarkResult[] = [];
    for (let j = 0; j < results.length; j++) {
      const randomIndex = Math.floor(Math.random() * results.length);
      sample.push(results[randomIndex]);
    }
    samples.push(metric(sample));
  }

  samples.sort((a, b) => a - b);
  const lowerIndex = Math.floor(nBoot * 0.025);
  const upperIndex = Math.floor(nBoot * 0.975);
  return [samples[lowerIndex], samples[upperIndex]];
}

function computeCalibrationMetrics(results: BenchmarkResult[]): CalibrationMetrics {
  const total = results.length;
  const correct = results.filter(r => r.is_correct).length;
  const accuracy = correct / total;

  // TASK-31u: Filter out competitor results (confidence === -1) for calibration metrics
  const calibratableResults = results.filter(r => r.confidence >= 0);
  const hasCalibrationData = calibratableResults.length > 0;

  const avgConfidence = hasCalibrationData
    ? calibratableResults.reduce((sum, r) => sum + r.confidence, 0) / calibratableResults.length
    : 0;

  // Brier Score: average squared difference between confidence and correctness
  // Only compute for results with measurable confidence
  const brierScore = hasCalibrationData
    ? calibratableResults.reduce((sum, r) => {
        const outcome = r.is_correct ? 1 : 0;
        return sum + Math.pow(r.confidence - outcome, 2);
      }, 0) / calibratableResults.length
    : 0;

  // Expected Calibration Error (ECE): binned calibration
  const bins = [
    { min: 0.0, max: 0.2 },
    { min: 0.2, max: 0.4 },
    { min: 0.4, max: 0.6 },
    { min: 0.6, max: 0.8 },
    { min: 0.8, max: 1.0 },
  ];

  const confidenceBins = bins.map(bin => {
    // Fix bin boundary overlap: use >= min and < max (except last bin which is <= 1.0)
    // TASK-31u: Only bin results with valid confidence scores
    const inBin = calibratableResults.filter(r =>
      r.confidence >= bin.min && (bin.max < 1.0 ? r.confidence < bin.max : r.confidence <= bin.max)
    );
    const count = inBin.length;

    if (count === 0) {
      return {
        range: `${bin.min.toFixed(1)}-${bin.max.toFixed(1)}`,
        count: 0,
        accuracy: 0,
        avg_confidence: 0,
      };
    }

    const binAccuracy = inBin.filter(r => r.is_correct).length / count;
    const binAvgConf = inBin.reduce((sum, r) => sum + r.confidence, 0) / count;

    return {
      range: `${bin.min.toFixed(1)}-${bin.max.toFixed(1)}`,
      count,
      accuracy: binAccuracy,
      avg_confidence: binAvgConf,
    };
  });

  // ECE: weighted average of absolute calibration error per bin
  // TASK-31u: Weight by calibratable results only
  let ece = 0;
  if (hasCalibrationData) {
    for (const bin of confidenceBins) {
      if (bin.count > 0) {
        const weight = bin.count / calibratableResults.length;
        ece += weight * Math.abs(bin.avg_confidence - bin.accuracy);
      }
    }
  }

  // TASK-31ab: Compute 95% confidence intervals via bootstrap
  let confidenceIntervals: { accuracy_95ci: [number, number]; ece_95ci: [number, number]; brier_95ci: [number, number] } | undefined;

  if (results.length >= 10) { // Only compute CIs if we have enough data
    const accuracyMetric = (r: BenchmarkResult[]) => r.filter(x => x.is_correct).length / r.length;

    const eceMetric = (r: BenchmarkResult[]) => {
      const calibratable = r.filter(x => x.confidence >= 0);
      if (calibratable.length === 0) return 0;

      let localEce = 0;
      for (const bin of bins) {
        const inBin = calibratable.filter(x =>
          x.confidence >= bin.min && (bin.max < 1.0 ? x.confidence < bin.max : x.confidence <= bin.max)
        );
        if (inBin.length > 0) {
          const binAcc = inBin.filter(x => x.is_correct).length / inBin.length;
          const binConf = inBin.reduce((sum, x) => sum + x.confidence, 0) / inBin.length;
          const weight = inBin.length / calibratable.length;
          localEce += weight * Math.abs(binConf - binAcc);
        }
      }
      return localEce;
    };

    const brierMetric = (r: BenchmarkResult[]) => {
      const calibratable = r.filter(x => x.confidence >= 0);
      if (calibratable.length === 0) return 0;
      return calibratable.reduce((sum, x) => {
        const outcome = x.is_correct ? 1 : 0;
        return sum + Math.pow(x.confidence - outcome, 2);
      }, 0) / calibratable.length;
    };

    confidenceIntervals = {
      accuracy_95ci: bootstrapCI(results, accuracyMetric),
      ece_95ci: bootstrapCI(calibratableResults, eceMetric),
      brier_95ci: bootstrapCI(calibratableResults, brierMetric),
    };
  }

  return {
    total_cases: total,
    accuracy,
    avg_confidence: avgConfidence,
    ece,
    brier_score: brierScore,
    confidence_bins: confidenceBins,
    confidence_intervals: confidenceIntervals,
  };
}

async function runBenchmark(
  datasetPath: string,
  modelConfig: ModelConfig,
  isCouncilRouter: boolean
): Promise<{
  results: BenchmarkResult[];
  metrics: CalibrationMetrics;
  attempted: number;
  completed: number;
  failed: number;
  avgCouncilSize: number;              // TASK-31v
  singleModelFallbackRate: number;     // TASK-31v
}> {
  console.log(`\n📊 Running benchmark: ${datasetPath}`);
  console.log(`   Model: ${modelConfig.name} (${modelConfig.id})`);
  console.log(`   Cost/request: $${modelConfig.cost_per_request.toFixed(4)}`);
  console.log('─'.repeat(60));

  // Load test cases
  const lines = readFileSync(datasetPath, 'utf-8').trim().split('\n');
  const testCases: TestCase[] = lines.map(line => JSON.parse(line));

  console.log(`Loaded ${testCases.length} test cases\n`);

  const results: BenchmarkResult[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  let attempted = 0;

  for (const testCase of testCases) {
    attempted++;
    process.stdout.write(`[${attempted}/${testCases.length}] ${testCase.id}... `);

    try {
      // 31-FIX: Retry with exponential backoff for 429 rate limit errors
      let inference;
      let retries = 0;
      const maxRetries = 4;
      while (true) {
        try {
          inference = await runInference(testCase.question, modelConfig, isCouncilRouter);
          break;
        } catch (retryErr) {
          const errMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          if (errMsg.includes('429') && retries < maxRetries) {
            retries++;
            const backoffMs = Math.min(30000 * Math.pow(2, retries - 1), 180000);
            console.log(`  ⏳ Rate limited, retry ${retries}/${maxRetries} in ${backoffMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            continue;
          }
          throw retryErr;
        }
      }

      // Use dataset type if available, otherwise infer from answer format
      const datasetType = testCase.type || (testCase.test ? 'code' : 'factual');

      // TASK-31t + 31aa + 31-FIX-8: Get grading result with method tracking, code execution, and question context
      const gradingResult = checkAnswer(inference.answer, testCase.answer, datasetType, testCase.test, testCase.question);

      // Don't apply extractNumericAnswer to code tasks (TASK-31j fix)
      const displayAnswer = datasetType === 'code' ? inference.answer.slice(0, 100) : extractNumericAnswer(inference.answer);

      // TASK-31v: Track council size (number of models that responded)
      const councilSize = inference.votes?.length ?? 1;

      results.push({
        id: testCase.id,
        question: testCase.question,
        ground_truth: testCase.answer,
        model_answer: displayAnswer,
        model_answer_raw: inference.answer,           // TASK-31t: Store full response
        grading_method: gradingResult.grading_method, // TASK-31t: Track grading path
        confidence: inference.confidence,
        is_correct: gradingResult.is_correct,
        complexity_tier: inference.tier,
        latency_ms: inference.latency_ms,
        cost_usd: inference.cost_usd,
        votes: inference.votes,
        council_size: councilSize,                    // TASK-31v: Council size
        execution_output: gradingResult.execution_output, // TASK-31aa: Code execution output
      });

      console.log(gradingResult.is_correct ? '✓' : '✗', `(conf: ${inference.confidence.toFixed(2)}, cost: $${inference.cost_usd.toFixed(4)}, council: ${councilSize})`);

      // Rate limiting between requests to avoid 429s
      if (isCouncilRouter && modelConfig.budget === 'free') {
        await new Promise(resolve => setTimeout(resolve, 4000)); // Free tier: 4s delay
      } else if (isCouncilRouter) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Paid tier: moderate limits
      } else {
        await new Promise(resolve => setTimeout(resolve, 500)); // OpenRouter: light delay
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ ${errorMsg.slice(0, 80)}`);
      errors.push({ id: testCase.id, error: errorMsg });
      // TASK-31k: Track failures, don't skip them
    }
  }

  console.log('\n' + '─'.repeat(60));

  const completed = results.length;
  const failed = errors.length;

  const metrics = computeCalibrationMetrics(results);

  // TASK-31v: Calculate council size statistics
  const avgCouncilSize = results.reduce((sum, r) => sum + r.council_size, 0) / (results.length || 1);
  const singleModelCases = results.filter(r => r.council_size <= 1).length;
  const singleModelFallbackRate = results.length > 0 ? singleModelCases / results.length : 0;

  console.log('\n📈 Results:');
  console.log(`  Attempted: ${attempted}`);
  console.log(`  Completed: ${completed}`);
  console.log(`  Failed: ${failed} (${((failed / attempted) * 100).toFixed(1)}%)`);

  // TASK-31ab: Display metrics with 95% CIs
  if (metrics.confidence_intervals) {
    const [accLow, accHigh] = metrics.confidence_intervals.accuracy_95ci;
    const [eceLow, eceHigh] = metrics.confidence_intervals.ece_95ci;
    const [brierLow, brierHigh] = metrics.confidence_intervals.brier_95ci;

    console.log(`  Accuracy: ${(metrics.accuracy * 100).toFixed(1)}% (95% CI: ${(accLow * 100).toFixed(1)}%-${(accHigh * 100).toFixed(1)}%)`);
    console.log(`  Avg Confidence: ${(metrics.avg_confidence * 100).toFixed(1)}%`);
    console.log(`  ECE: ${metrics.ece.toFixed(4)} (95% CI: ${eceLow.toFixed(4)}-${eceHigh.toFixed(4)})`);
    console.log(`  Brier Score: ${metrics.brier_score.toFixed(4)} (95% CI: ${brierLow.toFixed(4)}-${brierHigh.toFixed(4)})`);
  } else {
    console.log(`  Accuracy: ${(metrics.accuracy * 100).toFixed(1)}% (of completed)`);
    console.log(`  Avg Confidence: ${(metrics.avg_confidence * 100).toFixed(1)}%`);
    console.log(`  ECE (Expected Calibration Error): ${metrics.ece.toFixed(4)}`);
    console.log(`  Brier Score: ${metrics.brier_score.toFixed(4)}`);
    console.log(`  (Too few cases for confidence intervals - need ≥10)`);
  }

  console.log(`  Total Cost: $${results.reduce((sum, r) => sum + r.cost_usd, 0).toFixed(4)}`);

  // TASK-31v: Display council size metrics
  console.log(`  Avg Council Size: ${avgCouncilSize.toFixed(1)} models`);
  console.log(`  Single-model fallback: ${singleModelCases}/${results.length} cases (${(singleModelFallbackRate * 100).toFixed(0)}%)`);

  console.log('\n📊 Confidence Bins:');
  for (const bin of metrics.confidence_bins) {
    if (bin.count > 0) {
      console.log(`  ${bin.range}: ${bin.count} cases, ${(bin.accuracy * 100).toFixed(1)}% accurate`);
    }
  }

  if (errors.length > 0) {
    console.log('\n⚠️ Failed cases:');
    errors.forEach(({ id, error }) => console.log(`  - ${id}: ${error.slice(0, 60)}`));
  }

  return {
    results,
    metrics,
    attempted,
    completed,
    failed,
    avgCouncilSize,              // TASK-31v
    singleModelFallbackRate      // TASK-31v
  };
}

async function main() {
  // Parse arguments: tsx benchmark.ts <dataset> --model <model_name>
  const args = process.argv.slice(2);
  const datasetName = args[0] || 'factual_custom';

  const modelFlagIndex = args.indexOf('--model');
  const modelName = modelFlagIndex >= 0 ? args[modelFlagIndex + 1] : 'councilrouter_free';

  if (!modelName) {
    console.error('❌ Error: --model flag requires a value');
    console.log('Usage: tsx benchmark.ts <dataset> --model <model_name>');
    console.log('Example: tsx benchmark.ts factual_custom --model councilrouter_free');
    process.exit(1);
  }

  const projectRoot = join(__dirname, '../..');
  const configPath = join(projectRoot, 'benchmarks/config.json');
  const datasetPath = join(projectRoot, `benchmarks/datasets/${datasetName}.jsonl`);
  const outputDir = join(projectRoot, 'benchmarks/results');

  // Load benchmark config
  let config: BenchmarkConfig;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (error) {
    console.error('❌ Failed to load benchmarks/config.json:', error);
    process.exit(1);
  }

  // Get model config
  const modelConfig = config.models[modelName];
  if (!modelConfig) {
    console.error(`❌ Model "${modelName}" not found in config.json`);
    console.log('Available models:', Object.keys(config.models).join(', '));
    process.exit(1);
  }

  // Determine if this is a CouncilRouter model or competitor
  const isCouncilRouter = modelName.startsWith('councilrouter_');

  console.log(`\n🔬 CouncilRouter Benchmark Runner`);
  console.log(`   Dataset: ${datasetName}`);
  console.log(`   Model: ${modelConfig.name}`);
  console.log(`   Type: ${isCouncilRouter ? 'CouncilRouter (multi-model)' : 'Single model (OpenRouter)'}`);
  console.log('');

  try {
    const { results, metrics, attempted, completed, failed, avgCouncilSize, singleModelFallbackRate } = await runBenchmark(
      datasetPath,
      modelConfig,
      isCouncilRouter
    );

    // TASK-31n: Reproducibility manifest
    const gitCommit = process.env.GIT_COMMIT || 'unknown';
    const timestamp = new Date().toISOString();
    const outputFilename = `${datasetName}_${modelName}_${timestamp.replace(/[:.]/g, '-').slice(0, -5)}.json`;
    const outputPath = join(outputDir, outputFilename);

    writeFileSync(outputPath, JSON.stringify({
      // Metadata
      experiment: datasetName,
      model: modelName,
      model_config: modelConfig,
      timestamp,
      reproducibility: {
        git_commit: gitCommit,
        dataset_path: datasetPath,
        evaluator_version: '1.0.0', // TODO: Track this properly
        endpoint: isCouncilRouter ? COUNCILROUTER_API_URL : OPENROUTER_API_URL,
      },
      // Results
      results,
      metrics,
      // TASK-31k: Failure accounting
      summary: {
        attempted,
        completed,
        failed,
        error_rate: attempted > 0 ? failed / attempted : 0,
        completion_rate: attempted > 0 ? completed / attempted : 0,
        avg_council_size: avgCouncilSize,                      // TASK-31v
        single_model_fallback_rate: singleModelFallbackRate,   // TASK-31v
      },
    }, null, 2));

    console.log(`\n✅ Results saved to: ${outputPath}\n`);

    // Exit with error code if too many failures
    if (failed / attempted > 0.5) {
      console.error('⚠️ Warning: >50% failure rate');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

main();
