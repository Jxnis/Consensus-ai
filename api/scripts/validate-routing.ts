#!/usr/bin/env tsx
/**
 * Semantic Routing Accuracy Validation
 * Tests topic detection + model selection across 25 diverse prompts
 */

const API_URL = process.env.API_URL || 'https://consensus-api.janis-ellerbrock.workers.dev';
const API_KEY = process.env.API_KEY || process.env.TEST_PAID_API_KEY || '';
const DELAY_MS = 2000; // 2s between requests to avoid rate limits

interface TestCase {
  prompt: string;
  expected_topic: string; // Top-level expected domain
  id: string;
}

const TEST_CASES: TestCase[] = [
  // CODE (5 prompts)
  { id: 'code1', prompt: 'Write a Python function to reverse a linked list', expected_topic: 'code' },
  { id: 'code2', prompt: 'Implement binary search in JavaScript', expected_topic: 'code' },
  { id: 'code3', prompt: 'How do I fix a segmentation fault in my C program?', expected_topic: 'code' },
  { id: 'code4', prompt: 'Create a REST API endpoint using Express.js', expected_topic: 'code' },
  { id: 'code5', prompt: 'What is the time complexity of merge sort?', expected_topic: 'code' },

  // MATH (5 prompts)
  { id: 'math1', prompt: 'Calculate the derivative of x^3 + 2x^2 - 5x + 1', expected_topic: 'math' },
  { id: 'math2', prompt: 'Solve the integral of sin(x) * cos(x) dx', expected_topic: 'math' },
  { id: 'math3', prompt: 'What is the p-value in hypothesis testing?', expected_topic: 'math' },
  { id: 'math4', prompt: 'Prove that the square root of 2 is irrational', expected_topic: 'math' },
  { id: 'math5', prompt: 'Calculate the eigenvalues of a 3x3 matrix', expected_topic: 'math' },

  // SCIENCE (5 prompts)
  { id: 'sci1', prompt: 'Explain how CRISPR gene editing works', expected_topic: 'science' },
  { id: 'sci2', prompt: 'What is the Heisenberg uncertainty principle?', expected_topic: 'science' },
  { id: 'sci3', prompt: 'Describe the process of photosynthesis', expected_topic: 'science' },
  { id: 'sci4', prompt: 'How do black holes form?', expected_topic: 'science' },
  { id: 'sci5', prompt: 'What are the main differences between DNA and RNA?', expected_topic: 'science' },

  // WRITING (5 prompts)
  { id: 'wrt1', prompt: 'Write a professional email declining a job offer', expected_topic: 'writing' },
  { id: 'wrt2', prompt: 'Draft a persuasive essay about climate change', expected_topic: 'writing' },
  { id: 'wrt3', prompt: 'Help me write a cover letter for a software engineer position', expected_topic: 'writing' },
  { id: 'wrt4', prompt: 'Write a haiku about autumn', expected_topic: 'writing' },
  { id: 'wrt5', prompt: 'Summarize this article in 3 bullet points', expected_topic: 'writing' },

  // REASONING (3 prompts)
  { id: 'rea1', prompt: 'If all cats are animals and all animals are living things, what can we conclude?', expected_topic: 'reasoning' },
  { id: 'rea2', prompt: 'Analyze the pros and cons of remote work vs office work', expected_topic: 'reasoning' },
  { id: 'rea3', prompt: 'What logical fallacy is present in: Everyone is buying this product so it must be good?', expected_topic: 'reasoning' },

  // GENERAL (2 prompts)
  { id: 'gen1', prompt: 'What is the capital of France?', expected_topic: 'general' },
  { id: 'gen2', prompt: 'Who painted the Mona Lisa?', expected_topic: 'general' },
];

async function testPrompt(tc: TestCase): Promise<{
  id: string;
  expected: string;
  detected: string;
  match: boolean;
  data_source: string;
  model: string;
  confidence: number;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const res = await fetch(`${API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify({
        mode: 'default',
        budget: 'medium',
        messages: [{ role: 'user', content: tc.prompt }],
        max_tokens: 1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await res.json() as any;

    if (data.error) {
      return { id: tc.id, expected: tc.expected_topic, detected: '?', match: false, data_source: '?', model: '?', confidence: 0, error: data.error };
    }

    const routing = data.routing || {};
    const detected = (routing.topic_detected || 'unknown').split('/')[0]; // Top-level only
    const match = detected === tc.expected_topic;

    return {
      id: tc.id,
      expected: tc.expected_topic,
      detected: routing.topic_detected || 'unknown',
      match,
      data_source: routing.data_source || 'unknown',
      model: routing.selected_model || 'unknown',
      confidence: routing.topic_confidence || 0,
    };
  } catch (err) {
    return { id: tc.id, expected: tc.expected_topic, detected: '?', match: false, data_source: '?', model: '?', confidence: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('SEMANTIC ROUTING ACCURACY VALIDATION');
  console.log('='.repeat(80));
  console.log(`API: ${API_URL}`);
  console.log(`Auth: ${API_KEY ? 'API Key' : 'None (free tier)'}`);
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log('='.repeat(80));
  console.log('');

  const results = [];
  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    process.stdout.write(`[${String(i + 1).padStart(2)}/${TEST_CASES.length}] ${tc.id.padEnd(6)} `);

    const result = await testPrompt(tc);
    results.push(result);

    const icon = result.error ? 'ERR' : result.match ? ' OK' : 'BAD';
    const src = result.data_source.substring(0, 20).padEnd(20);
    console.log(`${icon} | expected=${result.expected.padEnd(10)} detected=${result.detected.padEnd(20)} | src=${src} | model=${result.model.substring(0, 30)}`);

    if (result.error) {
      console.log(`     ERROR: ${result.error}`);
    }

    // Delay between requests
    if (i < TEST_CASES.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // Summary
  console.log('');
  console.log('='.repeat(80));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(80));

  const successful = results.filter(r => !r.error);
  const correct = results.filter(r => r.match);
  const errors = results.filter(r => r.error);
  const semanticUsed = results.filter(r => r.data_source === 'semantic');
  const dbUsed = results.filter(r => r.data_source === 'database');
  const cacheUsed = results.filter(r => r.data_source === 'cache');
  const fallbackUsed = results.filter(r => r.data_source.includes('fallback'));

  console.log(`Total:     ${results.length}`);
  console.log(`Success:   ${successful.length}`);
  console.log(`Errors:    ${errors.length}`);
  console.log(`Correct:   ${correct.length}/${successful.length} (${successful.length > 0 ? (correct.length / successful.length * 100).toFixed(1) : 0}%)`);
  console.log('');
  console.log('Data Sources:');
  console.log(`  semantic:  ${semanticUsed.length}`);
  console.log(`  database:  ${dbUsed.length}`);
  console.log(`  cache:     ${cacheUsed.length}`);
  console.log(`  fallback:  ${fallbackUsed.length}`);

  // Per-domain breakdown
  console.log('');
  console.log('Per-Domain Accuracy:');
  const domains = [...new Set(TEST_CASES.map(tc => tc.expected_topic))];
  for (const domain of domains) {
    const domainResults = results.filter(r => r.expected === domain);
    const domainCorrect = domainResults.filter(r => r.match);
    const pct = domainResults.length > 0 ? (domainCorrect.length / domainResults.length * 100).toFixed(0) : 0;
    console.log(`  ${domain.padEnd(12)} ${domainCorrect.length}/${domainResults.length} (${pct}%)`);
  }

  // Mismatches
  const mismatches = results.filter(r => !r.match && !r.error);
  if (mismatches.length > 0) {
    console.log('');
    console.log('Mismatches:');
    for (const m of mismatches) {
      const tc = TEST_CASES.find(t => t.id === m.id)!;
      console.log(`  ${m.id}: expected=${m.expected} got=${m.detected}`);
      console.log(`    prompt: "${tc.prompt.substring(0, 70)}..."`);
    }
  }

  console.log('');
  console.log('='.repeat(80));
  const accuracy = successful.length > 0 ? (correct.length / successful.length * 100).toFixed(1) : '0';
  if (parseFloat(accuracy) >= 90) {
    console.log(`PASS: ${accuracy}% topic accuracy (target: 90%+)`);
  } else {
    console.log(`NEEDS IMPROVEMENT: ${accuracy}% topic accuracy (target: 90%+)`);
  }
  console.log('='.repeat(80));
}

main().catch(console.error);
