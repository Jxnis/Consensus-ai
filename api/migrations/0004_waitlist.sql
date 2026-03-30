-- Migration 0004: Waitlist table
-- Created: 2026-03-21
-- Purpose: Store beta waitlist signups for arcrouter.com

CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  referrer TEXT,           -- HTTP Referer header (where they came from)
  user_agent TEXT,         -- Browser/device info
  ip_hash TEXT,            -- SHA-256 hash of IP (for deduplication, not tracking)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for fast email lookup (prevent duplicates)
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);

-- Index for analytics (signups over time)
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at);
