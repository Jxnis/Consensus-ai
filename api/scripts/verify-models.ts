#!/usr/bin/env tsx
/**
 * Phase 2 Benchmark Model Verification (TASK-B4 Step 0)
 *
 * Verifies candidate model IDs for Phase 2 benchmarks against OpenRouter.
 * Models go offline frequently — don't hardcode IDs without verification.
 *
 * Usage: OPENROUTER_API_KEY=xxx npx tsx api/scripts/verify-models.ts
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY environment variable not set");
  process.exit(1);
}

// Candidate models - CORRECTED IDs from Phase 1 (already deployed in selector.ts)
// Free tier baselines (must beat these with council_free)
const CANDIDATE_FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",           // Best free model overall
  "nousresearch/hermes-3-llama-3.1-405b:free",        // 405B, strong reasoning (Phi-4 substitute)
  "qwen/qwen3-next-80b-a3b-instruct:free",            // Strong reasoning (Qwen 2.5 72B substitute)
  "google/gemma-3-27b-it:free",                       // Google's best free
  "mistralai/mistral-small-3.1-24b-instruct:free",    // Good for coding (3.1 not 3.2)
];

// Paid tier baselines - CORRECTED IDs from Phase 1 (already deployed in selector.ts)
const CANDIDATE_PAID_MODELS = [
  "openai/gpt-4o-mini",                // Popular mid-tier ($0.00015/req)
  "deepseek/deepseek-chat",            // DeepSeek V3.2 (79.9% GPQA, $0.0003/req)
  "anthropic/claude-sonnet-4.5",       // Premium mid-tier (83.4% GPQA, $0.003/req)
  "moonshotai/kimi-k2.5",              // Frontier-class (87.6% GPQA, $0.003/req) - moonshotai NOT moonshot
  "z-ai/glm-5",                        // Near-frontier (86.0% GPQA, $0.001/req) - z-ai NOT zhipu
  "qwen/qwen-2.5-72b-instruct",        // Paid version for higher limits
  "mistralai/mistral-large-2512",      // Strong reasoning - 2512 NOT -latest
];

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
}

async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://councilrouter.ai",
      "X-Title": "CouncilRouter Model Verification"
    }
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data as OpenRouterModel[];
}

async function main() {
  console.log("=== Phase 2 Benchmark Model Verification (TASK-B4 Step 0) ===\n");

  let liveModels: OpenRouterModel[];
  try {
    console.log("Fetching live models from OpenRouter...\n");
    liveModels = await fetchOpenRouterModels();
    console.log(`✅ Fetched ${liveModels.length} models from OpenRouter\n`);
  } catch (error) {
    console.error("❌ Failed to fetch models from OpenRouter:", error);
    process.exit(1);
  }

  const liveModelIds = new Set(liveModels.map(m => m.id));

  // Check FREE tier candidates
  console.log("=== FREE TIER CANDIDATES ===\n");
  let freeOk = 0;
  let freeMissing = 0;

  for (const modelId of CANDIDATE_FREE_MODELS) {
    if (liveModelIds.has(modelId)) {
      const model = liveModels.find(m => m.id === modelId)!;
      console.log(`✅ ${modelId}`);
      console.log(`   Name: ${model.name}`);
      console.log(`   Context: ${model.context_length.toLocaleString()} tokens`);
      console.log(`   Pricing: $${model.pricing.prompt}/M input, $${model.pricing.completion}/M output\n`);
      freeOk++;
    } else {
      console.log(`❌ ${modelId} — NOT FOUND ON OPENROUTER\n`);
      freeMissing++;
    }
  }

  console.log(`Free tier: ${freeOk}/${CANDIDATE_FREE_MODELS.length} verified\n`);

  // Check PAID tier candidates
  console.log("=== PAID TIER CANDIDATES ===\n");
  let paidOk = 0;
  let paidMissing = 0;

  for (const modelId of CANDIDATE_PAID_MODELS) {
    if (liveModelIds.has(modelId)) {
      const model = liveModels.find(m => m.id === modelId)!;
      const inputPrice = parseFloat(model.pricing.prompt);
      const outputPrice = parseFloat(model.pricing.completion);
      const avgPrice = (inputPrice + outputPrice) / 2;
      console.log(`✅ ${modelId}`);
      console.log(`   Name: ${model.name}`);
      console.log(`   Context: ${model.context_length.toLocaleString()} tokens`);
      console.log(`   Pricing: $${inputPrice}/M input, $${outputPrice}/M output (avg: $${avgPrice.toFixed(2)}/M)\n`);
      paidOk++;
    } else {
      console.log(`❌ ${modelId} — NOT FOUND ON OPENROUTER\n`);
      paidMissing++;
    }
  }

  console.log(`Paid tier: ${paidOk}/${CANDIDATE_PAID_MODELS.length} verified\n`);

  // Summary
  const totalOk = freeOk + paidOk;
  const totalCandidates = CANDIDATE_FREE_MODELS.length + CANDIDATE_PAID_MODELS.length;

  console.log("=== SUMMARY ===\n");
  if (totalOk === totalCandidates) {
    console.log(`🟢 ALL ${totalCandidates} PHASE 2 CANDIDATE MODELS VERIFIED\n`);
    console.log("Safe to proceed with TASK-B4 (add model configs to config.json).\n");
    process.exit(0);
  } else {
    console.log(`🟡 ${totalOk}/${totalCandidates} models verified, ${freeMissing + paidMissing} missing\n`);
    console.log("⚠️  Some models are offline or renamed. Use alternative IDs for config.json.\n");
    process.exit(1);
  }
}

main();
