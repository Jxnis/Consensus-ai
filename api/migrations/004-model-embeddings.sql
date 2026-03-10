-- Migration 004: Model Embeddings for Semantic Routing
-- Created: 2026-03-10
-- Purpose: Store pre-computed embeddings for each (model, domain) pair

CREATE TABLE IF NOT EXISTS model_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  embedding BLOB NOT NULL,  -- 768-dim vector from @cf/baai/bge-base-en-v1.5
  embedding_version TEXT NOT NULL DEFAULT 'v1',  -- For cache invalidation
  reference_text TEXT NOT NULL,  -- The text that was embedded (for debugging)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(model_id, domain, embedding_version)
);

CREATE INDEX idx_embeddings_model ON model_embeddings(model_id);
CREATE INDEX idx_embeddings_domain ON model_embeddings(domain);
CREATE INDEX idx_embeddings_lookup ON model_embeddings(model_id, domain, embedding_version);

-- Metadata table for tracking embedding generation
CREATE TABLE IF NOT EXISTS embedding_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  embedding_version TEXT NOT NULL UNIQUE,
  model_name TEXT NOT NULL,  -- Workers AI model used (e.g., '@cf/baai/bge-base-en-v1.5')
  dimensions INTEGER NOT NULL,  -- Embedding dimensionality (768 for bge-base)
  total_embeddings INTEGER NOT NULL DEFAULT 0,
  generation_started_at TEXT,
  generation_completed_at TEXT,
  notes TEXT
);

-- Insert initial metadata for v1
INSERT INTO embedding_metadata (
  embedding_version,
  model_name,
  dimensions,
  notes
) VALUES (
  'v1',
  '@cf/baai/bge-base-en-v1.5',
  768,
  'Initial semantic routing embeddings - top-level domains only (code, math, science, writing, reasoning, general)'
);
