-- Add charged_usd to routing_log so margin queries can compare
-- what we charged (revenue) vs cost_usd (provider cost) per request.
ALTER TABLE routing_log ADD COLUMN charged_usd REAL;
