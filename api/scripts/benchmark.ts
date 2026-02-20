#!/usr/bin/env tsx
/**
 * CouncilRouter Benchmark Runner
 *
 * Tests confidence calibration and quality metrics
 * Usage: tsx api/scripts/benchmark.ts [experiment_name]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_URL = process.env.BENCHMARK_API_URL || 'https://consensus-api.janis-ellerbrock.workers.dev/v1/chat/completions';
const API_KEY = process.env.BENCHMARK_API_KEY || ''; // Empty for free tier

interface TestCase {
  id: string;
  question: string;
  answer: string;
  category?: string;
  difficulty?: string;
  solution?: string;
}

interface BenchmarkResult {
  id: string;
  question: string;
  ground_truth: string;
  model_answer: string;
  confidence: number;
  is_correct: boolean;
  complexity_tier: string;
  latency_ms: number;
  cost_usd: number;
  votes?: any[];
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
}

async function runInference(question: string, budget: string = 'free'): Promise<{
  answer: string;
  confidence: number;
  tier: string;
  latency_ms: number;
  votes?: any[];
}> {
  const startTime = Date.now();

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: 'council-router-v1',
      messages: [{ role: 'user', content: question }],
      budget,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as any;
  const latency_ms = Date.now() - startTime;

  return {
    answer: data.choices[0].message.content,
    confidence: data.consensus.confidence,
    tier: data.consensus.tier,
    latency_ms,
    votes: data.consensus.votes,
  };
}

function extractNumericAnswer(text: string): string {
  // Try to extract the final number from the response
  // Look for patterns like "The answer is X" or just numbers at the end
  const patterns = [
    /(?:answer is|equals?|=)\s*\$?([0-9,]+(?:\.[0-9]+)?)/i,
    /\$?([0-9,]+(?:\.[0-9]+)?)\s*$/,
    /^([0-9,]+(?:\.[0-9]+)?)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].replace(/,/g, '');
    }
  }

  return text.trim();
}

function checkAnswer(modelAnswer: string, groundTruth: string): boolean {
  // Normalize both answers
  const normalize = (s: string) => {
    // Convert Unicode subscripts/superscripts to regular digits
    const subscriptMap: Record<string, string> = {
      '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
      '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    };
    const superscriptMap: Record<string, string> = {
      '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
      '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    };

    let normalized = s;
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
  if (normalizedModel === normalizedTruth) return true;

  // Check if ground truth is contained in model answer (for word answers)
  const normalizedModelFull = normalize(modelAnswer);
  if (normalizedModelFull.includes(normalizedTruth)) return true;

  // Check numeric equivalence
  const modelNum = parseFloat(normalizedModel);
  const truthNum = parseFloat(normalizedTruth);
  if (!isNaN(modelNum) && !isNaN(truthNum) && Math.abs(modelNum - truthNum) < 0.01) {
    return true;
  }

  return false;
}

function computeCalibrationMetrics(results: BenchmarkResult[]): CalibrationMetrics {
  const total = results.length;
  const correct = results.filter(r => r.is_correct).length;
  const accuracy = correct / total;

  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / total;

  // Brier Score: average squared difference between confidence and correctness
  const brierScore = results.reduce((sum, r) => {
    const outcome = r.is_correct ? 1 : 0;
    return sum + Math.pow(r.confidence - outcome, 2);
  }, 0) / total;

  // Expected Calibration Error (ECE): binned calibration
  const bins = [
    { min: 0.0, max: 0.2 },
    { min: 0.2, max: 0.4 },
    { min: 0.4, max: 0.6 },
    { min: 0.6, max: 0.8 },
    { min: 0.8, max: 1.0 },
  ];

  const confidenceBins = bins.map(bin => {
    const inBin = results.filter(r => r.confidence >= bin.min && r.confidence <= bin.max);
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
  let ece = 0;
  for (const bin of confidenceBins) {
    if (bin.count > 0) {
      const weight = bin.count / total;
      ece += weight * Math.abs(bin.avg_confidence - bin.accuracy);
    }
  }

  return {
    total_cases: total,
    accuracy,
    avg_confidence: avgConfidence,
    ece,
    brier_score: brierScore,
    confidence_bins: confidenceBins,
  };
}

async function runBenchmark(datasetPath: string, budget: string = 'free'): Promise<{
  results: BenchmarkResult[];
  metrics: CalibrationMetrics;
}> {
  console.log(`\n📊 Running benchmark: ${datasetPath} (budget: ${budget})`);
  console.log('─'.repeat(60));

  // Load test cases
  const lines = readFileSync(datasetPath, 'utf-8').trim().split('\n');
  const testCases: TestCase[] = lines.map(line => JSON.parse(line));

  console.log(`Loaded ${testCases.length} test cases\n`);

  const results: BenchmarkResult[] = [];
  let processed = 0;

  for (const testCase of testCases) {
    try {
      processed++;
      process.stdout.write(`[${processed}/${testCases.length}] ${testCase.id}... `);

      const inference = await runInference(testCase.question, budget);
      const isCorrect = checkAnswer(inference.answer, testCase.answer);

      results.push({
        id: testCase.id,
        question: testCase.question,
        ground_truth: testCase.answer,
        model_answer: extractNumericAnswer(inference.answer),
        confidence: inference.confidence,
        is_correct: isCorrect,
        complexity_tier: inference.tier,
        latency_ms: inference.latency_ms,
        cost_usd: budget === 'free' ? 0 : 0.002,
        votes: inference.votes,
      });

      console.log(isCorrect ? '✓' : '✗', `(conf: ${inference.confidence.toFixed(2)})`);

      // Rate limiting: wait 500ms between requests (free tier)
      if (budget === 'free') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`\n❌ Error on ${testCase.id}:`, error instanceof Error ? error.message : error);
      // Continue with next test case
    }
  }

  console.log('\n' + '─'.repeat(60));

  const metrics = computeCalibrationMetrics(results);

  console.log('\n📈 Results:');
  console.log(`  Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`  Avg Confidence: ${(metrics.avg_confidence * 100).toFixed(1)}%`);
  console.log(`  ECE (Expected Calibration Error): ${metrics.ece.toFixed(4)}`);
  console.log(`  Brier Score: ${metrics.brier_score.toFixed(4)}`);
  console.log('\n📊 Confidence Bins:');
  for (const bin of metrics.confidence_bins) {
    if (bin.count > 0) {
      console.log(`  ${bin.range}: ${bin.count} cases, ${(bin.accuracy * 100).toFixed(1)}% accurate`);
    }
  }

  return { results, metrics };
}

async function main() {
  const experiment = process.argv[2] || 'factual_custom';
  const budget = process.argv[3] || 'free';

  const projectRoot = join(__dirname, '../..');
  const datasetPath = join(projectRoot, `benchmarks/datasets/${experiment}.jsonl`);
  const outputDir = join(projectRoot, 'benchmarks/results');

  try {
    const { results, metrics } = await runBenchmark(datasetPath, budget);

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputPath = join(outputDir, `${experiment}_${budget}_${timestamp}.json`);

    writeFileSync(outputPath, JSON.stringify({
      experiment,
      budget,
      timestamp: new Date().toISOString(),
      results,
      metrics,
    }, null, 2));

    console.log(`\n✅ Results saved to: ${outputPath}\n`);
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

main();
