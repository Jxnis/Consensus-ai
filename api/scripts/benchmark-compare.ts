#!/usr/bin/env tsx
/**
 * TASK-31ac: Benchmark Comparison Tool
 *
 * Reads all benchmark result files and generates a comparison table
 * Usage: npx tsx api/scripts/benchmark-compare.ts
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface BenchmarkFile {
  experiment: string;
  model: string;
  timestamp: string;
  results: any[];
  metrics: {
    accuracy: number;
    avg_confidence: number;
    ece: number;
    brier_score: number;
    confidence_intervals?: {
      accuracy_95ci: [number, number];
    };
  };
  summary: {
    attempted: number;
    completed: number;
    failed: number;
    avg_council_size?: number;
  };
}

interface ModelResult {
  accuracy: number;
  accuracyCI?: [number, number];
  councilSize?: number;
  completed: number;
  attempted: number;
  timestamp: string;
}

function main() {
  const resultsDir = join(process.cwd(), 'benchmarks/results');

  try {
    const files = readdirSync(resultsDir).filter(f => f.endsWith('.json'));

    if (files.length === 0) {
      console.log('No benchmark results found in benchmarks/results/');
      return;
    }

    // Group results by dataset and model
    const results: Record<string, Record<string, ModelResult>> = {};

    for (const file of files) {
      try {
        const content = readFileSync(join(resultsDir, file), 'utf-8');
        const data: BenchmarkFile = JSON.parse(content);

        if (!results[data.experiment]) {
          results[data.experiment] = {};
        }

        // Store the latest result for each model×dataset combination
        const existing = results[data.experiment][data.model];
        if (!existing || data.timestamp > existing.timestamp) {
          results[data.experiment][data.model] = {
            accuracy: data.metrics.accuracy,
            accuracyCI: data.metrics.confidence_intervals?.accuracy_95ci,
            councilSize: data.summary.avg_council_size,
            completed: data.summary.completed,
            attempted: data.summary.attempted,
            timestamp: data.timestamp,
          };
        }
      } catch (error) {
        console.error(`Skipping invalid file ${file}:`, (error as Error).message);
      }
    }

    // Print comparison table
    console.log('\n📊 Benchmark Comparison Table\n');
    console.log('=' .repeat(100));

    const datasets = Object.keys(results).sort();
    const allModels = new Set<string>();
    datasets.forEach(ds => Object.keys(results[ds]).forEach(m => allModels.add(m)));
    const models = Array.from(allModels).sort();

    // Header
    const colWidth = 20;
    const header = 'Dataset'.padEnd(colWidth) + models.map(m => m.padEnd(colWidth)).join('');
    console.log(header);
    console.log('-'.repeat(100));

    // Rows
    for (const dataset of datasets) {
      let row = dataset.padEnd(colWidth);

      for (const model of models) {
        const result = results[dataset][model];
        if (result) {
          const acc = (result.accuracy * 100).toFixed(1);
          if (result.accuracyCI) {
            const [low, high] = result.accuracyCI;
            const ciStr = `${acc}% ±${((high - low) * 50).toFixed(1)}`;
            row += ciStr.padEnd(colWidth);
          } else {
            row += `${acc}%`.padEnd(colWidth);
          }
        } else {
          row += '—'.padEnd(colWidth);
        }
      }

      console.log(row);
    }

    console.log('=' .repeat(100));
    console.log('\n📈 Summary Statistics\n');

    // Overall accuracy per model
    console.log('Average Accuracy by Model:');
    for (const model of models) {
      const accuracies: number[] = [];
      datasets.forEach(ds => {
        const result = results[ds][model];
        if (result && result.completed > 0) {
          accuracies.push(result.accuracy);
        }
      });

      if (accuracies.length > 0) {
        const avg = accuracies.reduce((sum, a) => sum + a, 0) / accuracies.length;
        const datasetsRun = accuracies.length;
        console.log(`  ${model.padEnd(25)} ${(avg * 100).toFixed(1)}% (${datasetsRun} datasets)`);
      }
    }

    console.log('\n✅ Comparison complete. Results based on latest run for each model×dataset.\n');

  } catch (error) {
    console.error('Error reading results:', error);
    process.exit(1);
  }
}

main();
