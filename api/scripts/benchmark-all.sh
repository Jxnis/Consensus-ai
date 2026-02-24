#!/bin/bash
# TASK-31ac: Automated benchmark regression runner
# Usage: BENCHMARK_API_KEY=sk_... OPENROUTER_API_KEY=sk_... ./api/scripts/benchmark-all.sh

# NOTE: intentionally NOT using `set -e` — individual benchmark failures are expected\n# (rate limits, network issues) and are tracked/reported at the end

echo "🔬 CouncilRouter Full Benchmark Suite"
echo "======================================"
echo ""

# Check required environment variables
if [ -z "$BENCHMARK_API_KEY" ]; then
  echo "❌ Error: BENCHMARK_API_KEY not set"
  echo "   Set it with: export BENCHMARK_API_KEY=sk_..."
  exit 1
fi

if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "⚠️  Warning: OPENROUTER_API_KEY not set"
  echo "   Competitor benchmarks (GPT-4o-mini, Claude Opus) will be skipped"
  echo ""
fi

# Model and dataset arrays
MODELS=("councilrouter_free" "councilrouter_paid" "popular_mid_tier" "current_sota_2026")
DATASETS=("factual_custom" "factual_hard" "gsm8k_sample" "gsm8k_hard" "mmlu_subset" "humaneval_sample")

TOTAL=$((${#MODELS[@]} * ${#DATASETS[@]}))
CURRENT=0
FAILED=0

echo "📋 Running $TOTAL benchmarks (${#MODELS[@]} models × ${#DATASETS[@]} datasets)"
echo ""

# Create results summary file
SUMMARY_FILE="benchmarks/results/benchmark-summary-$(date +%Y-%m-%d_%H-%M-%S).txt"
echo "Benchmark Run Summary - $(date)" > "$SUMMARY_FILE"
echo "=====================================" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"

for model in "${MODELS[@]}"; do
  for dataset in "${DATASETS[@]}"; do
    CURRENT=$((CURRENT + 1))
    echo "[$CURRENT/$TOTAL] Running: $dataset × $model"

    # Skip competitor models if no OpenRouter API key
    if [[ "$model" == "popular_mid_tier" || "$model" == "current_sota_2026" ]] && [ -z "$OPENROUTER_API_KEY" ]; then
      echo "  ⏭️  Skipped (no OPENROUTER_API_KEY)"
      echo "SKIPPED: $dataset × $model (no OPENROUTER_API_KEY)" >> "$SUMMARY_FILE"
      continue
    fi

    # Run benchmark
    if npx tsx api/scripts/benchmark.ts "$dataset" --model "$model"; then
      echo "  ✅ Success"
      echo "SUCCESS: $dataset × $model" >> "$SUMMARY_FILE"
    else
      echo "  ❌ Failed"
      echo "FAILED: $dataset × $model" >> "$SUMMARY_FILE"
      FAILED=$((FAILED + 1))
    fi

    # Rate limiting: wait 2 seconds between runs
    if [ $CURRENT -lt $TOTAL ]; then
      sleep 2
    fi

    echo ""
  done
done

echo "======================================"
echo "✅ Benchmark suite complete!"
echo "   Total: $TOTAL | Failed: $FAILED | Success: $((TOTAL - FAILED))"
echo "   Results in: benchmarks/results/"
echo "   Summary: $SUMMARY_FILE"
echo ""

if [ $FAILED -gt 0 ]; then
  echo "⚠️  Warning: $FAILED benchmarks failed"
  exit 1
fi
