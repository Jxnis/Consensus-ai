-- Migration 0005: Routing log table
-- Created: 2026-04-28
-- Purpose: Per-request log of routing decisions for dashboard + reconciliation
-- Replaces: KV-based daily aggregates (which remain for fast hot-path counters)

CREATE TABLE IF NOT EXISTS routing_log (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,        -- Internal request ID for cross-reference
  timestamp INTEGER NOT NULL,      -- Unix ms
  api_key_hash TEXT,               -- NULL for free/x402/mpp tiers
  auth_tier TEXT NOT NULL,         -- 'free' | 'paid' | 'x402' | 'mpp' | 'playground'
  model_id TEXT,                   -- e.g. 'google/gemini-2.0-flash-001'
  topic TEXT,                      -- e.g. 'code', 'math', 'general'
  complexity_tier TEXT,            -- 'SIMPLE' | 'MEDIUM' | 'COMPLEX' | 'REASONING'
  latency_ms INTEGER,              -- End-to-end latency
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,                   -- Estimated cost charged to customer
  call_path TEXT,                  -- 'direct:openai' | 'direct:anthropic' | ... | 'openrouter'
  status TEXT NOT NULL,            -- 'success' | 'error' | 'fallback'
  is_agentic INTEGER DEFAULT 0,    -- 0 or 1 (SQLite doesn't have native bool)
  mode TEXT,                       -- 'default' | 'council'
  session_id TEXT,                 -- Workflow session ID if any
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_routing_log_keyhash_time ON routing_log(api_key_hash, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_routing_log_tier_time ON routing_log(auth_tier, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_routing_log_session ON routing_log(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_routing_log_timestamp ON routing_log(timestamp DESC);
