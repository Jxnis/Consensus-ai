#!/usr/bin/env tsx
/**
 * TASK-A3 Step 0: Verify Model IDs
 *
 * Checks candidate model IDs against OpenRouter's live /models endpoint.
 * Models go offline frequently — don't hardcode IDs without verification.
 *
 * Usage: OPENROUTER_API_KEY=xxx npx tsx api/scripts/verify-models.ts
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY environment variable not set");
  process.exit(1);
}

// Candidate models from NEW_DIRECTION.md TASK-A3 (IDs corrected via OpenRouter /models verification)
const CANDIDATE_FREE_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",  // Note: 3.1 not 3.2
  "qwen/qwen3-next-80b-a3b-instruct:free",          // qwen-2.5-72b:free not available, this is alternative
  "nousresearch/hermes-3-llama-3.1-405b:free",      // Phi-4:free not available, Hermes is strong alternative
];

const CANDIDATE_PAID_MODELS = [
  "deepseek/deepseek-chat",            // DeepSeek V3
  "qwen/qwen-2.5-72b-instruct",        // Qwen 2.5 72B
  "moonshotai/kimi-k2.5",              // Fixed: moonshotai not moonshot
  "mistralai/mistral-large-2512",      // Fixed: mistral-large-2512 not mistral-large-latest
  "z-ai/glm-5",                        // Fixed: z-ai not zhipu
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
  console.log("=== TASK-A3 Step 0: Model ID Verification ===\n");

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
    console.log(`🟢 ALL ${totalCandidates} CANDIDATE MODELS VERIFIED\n`);
    console.log("Safe to proceed with TASK-A3 implementation.\n");
    process.exit(0);
  } else {
    console.log(`🟡 ${totalOk}/${totalCandidates} models verified, ${freeMissing + paidMissing} missing\n`);
    console.log("⚠️  Update model IDs in NEW_DIRECTION.md before implementing TASK-A3.\n");
    process.exit(1);
  }
}

main();
