-- Models table: identity + pricing
CREATE TABLE models (
  id TEXT PRIMARY KEY,              -- e.g. 'deepseek/deepseek-chat'
  name TEXT NOT NULL,               -- e.g. 'DeepSeek V3.2'
  provider TEXT NOT NULL,           -- e.g. 'DeepSeek'
  input_price_per_1m REAL NOT NULL, -- USD per 1M input tokens
  output_price_per_1m REAL NOT NULL,-- USD per 1M output tokens
  context_length INTEGER NOT NULL,
  is_free BOOLEAN NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT 1,  -- can be disabled without deletion
  latency_p50_ms INTEGER,          -- median response time in ms (from telemetry)
  reliability_pct REAL,            -- % of requests that succeed (from telemetry)
  last_updated TEXT NOT NULL        -- ISO date
);

-- Benchmark scores: per-model, per-benchmark, per-domain
CREATE TABLE benchmark_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL REFERENCES models(id),
  benchmark TEXT NOT NULL,          -- e.g. 'gpqa_diamond', 'mmlu_pro', 'humaneval', 'livebench'
  domain TEXT NOT NULL,             -- e.g. 'science', 'code/frontend', 'math/calculus'
  score REAL NOT NULL,              -- 0-100 normalized score
  raw_score REAL,                   -- original score before normalization
  source TEXT NOT NULL,             -- 'huggingface', 'livebench', 'our_benchmark', 'provider_claim'
  source_url TEXT,                  -- link to source for verification
  measured_at TEXT NOT NULL,        -- ISO date when score was recorded
  UNIQUE(model_id, benchmark, domain)
);

-- Domain taxonomy: hierarchical categories
CREATE TABLE domains (
  id TEXT PRIMARY KEY,              -- e.g. 'code/security', 'math/calculus'
  parent TEXT,                      -- e.g. 'code', 'math' (NULL for top-level)
  display_name TEXT NOT NULL,       -- e.g. 'Code: Security Analysis'
  description TEXT
);

-- Composite scores: pre-calculated per model per top-level domain
-- These are the fast-lookup table for routing decisions
CREATE TABLE composite_scores (
  model_id TEXT NOT NULL REFERENCES models(id),
  domain TEXT NOT NULL,             -- top-level: 'code', 'math', 'science', 'writing', 'general'
  quality_score REAL NOT NULL,      -- weighted average of benchmark scores for this domain
  value_score REAL NOT NULL,        -- quality_score / normalized_cost
  rank INTEGER,                     -- rank within this domain (1 = best)
  last_calculated TEXT NOT NULL,
  PRIMARY KEY (model_id, domain)
);

-- Routing history: logs every routing decision for analytics
CREATE TABLE routing_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  topic TEXT NOT NULL,           -- detected topic (e.g. 'code/security')
  topic_confidence REAL,        -- detection confidence (0-1)
  complexity TEXT NOT NULL,      -- 'SIMPLE' | 'MEDIUM' | 'COMPLEX'
  budget TEXT NOT NULL,          -- 'free' | 'low' | 'medium' | 'high'
  selected_model TEXT NOT NULL,  -- model that was selected
  data_source TEXT NOT NULL,     -- 'database' | 'fallback_registry' | 'cache'
  latency_ms INTEGER,           -- total response time (if available)
  success BOOLEAN NOT NULL DEFAULT 1,
  failover_count INTEGER DEFAULT 0,  -- how many models were tried
  created_at TEXT NOT NULL       -- ISO timestamp
);

-- Indexes for fast routing queries
CREATE INDEX idx_composite_domain ON composite_scores(domain, value_score DESC);
CREATE INDEX idx_benchmarks_model ON benchmark_scores(model_id);
CREATE INDEX idx_models_available ON models(is_available);
CREATE INDEX idx_history_topic ON routing_history(topic, created_at);
CREATE INDEX idx_history_model ON routing_history(selected_model, created_at);
