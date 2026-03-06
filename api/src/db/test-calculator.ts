/**
 * Test script for score calculator
 * Run with: pnpm wrangler dev --local --test-scheduled
 * Or manually via D1 command
 */

import { recalculateScores, getBestModel } from './score-calculator';

export async function testCalculator(db: D1Database) {
  console.log('=== Testing Score Calculator ===\n');

  // Recalculate all scores
  await recalculateScores(db);

  // Query best models for different domains and budgets
  console.log('\n=== Best Models by Domain ===\n');

  const testCases = [
    { domain: 'science', budget: 'medium' },
    { domain: 'science', budget: 'low' },
    { domain: 'science', budget: 'free' },
    { domain: 'code', budget: 'medium' },
    { domain: 'math', budget: 'medium' },
  ];

  for (const test of testCases) {
    const best = await getBestModel(db, test.domain, test.budget);
    console.log(`Domain: ${test.domain}, Budget: ${test.budget}`);
    if (best) {
      console.log(`  → ${best.name} (${best.id})`);
      console.log(`  → Quality: ${best.quality_score.toFixed(1)}, Value: ${best.value_score.toFixed(1)}, Rank: ${best.rank}`);
      console.log(`  → Price: $${best.input_price}/$${best.output_price} per 1M tokens`);
    } else {
      console.log(`  → No model found`);
    }
    console.log('');
  }
}
