-- Add token + cost + mode columns to routing_history for precise margin tracking.
-- Without these, margin analysis must estimate token counts (1k in / 500 out heuristic),
-- which is inaccurate especially for reasoning models with long output chains.

ALTER TABLE routing_history ADD COLUMN input_tokens INTEGER;
ALTER TABLE routing_history ADD COLUMN output_tokens INTEGER;
ALTER TABLE routing_history ADD COLUMN cost_usd_actual REAL;
ALTER TABLE routing_history ADD COLUMN charged_usd REAL;
ALTER TABLE routing_history ADD COLUMN mode TEXT;
ALTER TABLE routing_history ADD COLUMN auth_tier TEXT;
