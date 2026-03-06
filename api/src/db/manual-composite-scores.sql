-- Manual composite scores calculation
-- Based on GPQA Diamond science scores
-- This will be replaced by automatic calculation from score-calculator.ts

-- For science domain, we have GPQA scores:
-- Sonnet 4.5: 75.3 (quality), value = 75.3 / (1 + (9/9) * 1.0) = 75.3 / 2 = 37.65
-- Qwen 2.5: 74.2 (quality), value = 74.2 / (1 + (1/9) * 1.0) = 74.2 / 1.11 = 66.85
-- Mistral: No data yet, skip
-- DeepSeek: 60.5 (quality), value = 60.5 / (1 + (0.35/9) * 1.0) = 60.5 / 1.039 = 58.25
-- Llama 3.3: 44.4 (quality), value = 44.4 / (1 + (0/9) * 1.0) = 44.4 / 1 = 44.4 (but free, so infinite for free budget)

-- Normalized costs (assuming max avg price = $9/1M = Sonnet's (3+15)/2):
-- Sonnet: (3+15)/2 = 9, normalized = 9/9 = 1.0
-- Qwen: (0.5+1.5)/2 = 1.0, normalized = 1.0/9 = 0.111
-- DeepSeek: (0.28+0.42)/2 = 0.35, normalized = 0.35/9 = 0.039
-- Llama: free, normalized = 0

-- For medium budget (cost_sensitivity = 1.0):
INSERT INTO composite_scores (model_id, domain, quality_score, value_score, rank, last_calculated)
VALUES
  ('qwen/qwen-2.5-72b-instruct', 'science', 74.2, 66.85, 1, '2026-03-05T00:00:00Z'),
  ('deepseek/deepseek-chat', 'science', 60.5, 58.25, 2, '2026-03-05T00:00:00Z'),
  ('meta-llama/llama-3.3-70b-instruct', 'science', 44.4, 44.4, 3, '2026-03-05T00:00:00Z'),
  ('anthropic/claude-sonnet-4.5', 'science', 75.3, 37.65, 4, '2026-03-05T00:00:00Z');
