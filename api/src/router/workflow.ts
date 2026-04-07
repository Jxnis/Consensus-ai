/**
 * Workflow Budget Tracker — Sprint 2 (TASK-S2.1)
 *
 * Tracks cumulative spend per session_id in KV (24h TTL).
 * Auto-downgrades budget tier as spend approaches total budget limit.
 *
 * Thresholds:
 *   0–60% spent   → maintain requested tier
 *   60–80% spent  → downgrade to economy
 *   80–95% spent  → downgrade to free
 *   95%+ spent    → return WORKFLOW_BUDGET_EXHAUSTED error
 */

import { type RoutingBudget } from "./budget";

const TTL_SECONDS = 86400; // 24h
const KV_PREFIX = "workflow";

function key(sessionId: string, field: string): string {
  return `${KV_PREFIX}:${sessionId}:${field}`;
}

export interface WorkflowBudget {
  session_id: string;
  total_budget_usd: number;
}

export interface WorkflowUsage {
  session_id: string;
  total_budget_usd: number;
  total_spent_usd: number;
  budget_remaining_usd: number;
  budget_pct_used: number;
  effective_budget_tier: RoutingBudget;
  total_requests: number;
  models_used: string[];
  avg_latency_ms: number;
  tier_distribution: Record<string, number>;
}

export class WorkflowTracker {
  constructor(private kv: KVNamespace) {}

  /**
   * Register a workflow budget for a session.
   * Must be called on the first request that includes workflow_budget.
   * Idempotent — won't overwrite an existing budget for the same session.
   */
  async initBudget(sessionId: string, totalBudgetUsd: number): Promise<void> {
    const existing = await this.kv.get(key(sessionId, "budget"));
    if (!existing) {
      await this.kv.put(key(sessionId, "budget"), totalBudgetUsd.toString(), {
        expirationTtl: TTL_SECONDS,
      });
    }
  }

  /**
   * Returns the effective routing budget for this request.
   * Downgrades tier based on how much of the workflow budget has been spent.
   * Throws "WORKFLOW_BUDGET_EXHAUSTED" if over 95%.
   */
  async getEffectiveTier(
    sessionId: string,
    requestedBudget: RoutingBudget
  ): Promise<{ tier: RoutingBudget; remainingUsd: number | null; pctUsed: number | null }> {
    const [budgetStr, spentStr] = await Promise.all([
      this.kv.get(key(sessionId, "budget")),
      this.kv.get(key(sessionId, "spend")),
    ]);

    if (!budgetStr) {
      return { tier: requestedBudget, remainingUsd: null, pctUsed: null };
    }

    const totalBudget = parseFloat(budgetStr);
    const spent = spentStr ? parseFloat(spentStr) : 0;
    const pct = totalBudget > 0 ? spent / totalBudget : 0;
    const remaining = Math.max(0, totalBudget - spent);

    if (pct >= 0.95) {
      throw new Error("WORKFLOW_BUDGET_EXHAUSTED");
    }

    let tier = requestedBudget;
    if (pct >= 0.80) tier = "free";
    else if (pct >= 0.60) tier = "economy";

    return {
      tier,
      remainingUsd: Math.round(remaining * 1_000_000) / 1_000_000,
      pctUsed: Math.round(pct * 10000) / 100,
    };
  }

  /**
   * Record a completed request against the workflow budget.
   * Called after successful model response — runs async via waitUntil.
   */
  async recordRequest(
    sessionId: string,
    modelId: string,
    costUsd: number,
    latencyMs: number,
    complexityTier: string
  ): Promise<void> {
    // Read all counters in parallel
    const [spentStr, countStr, modelsStr, latSumStr, tiersStr] = await Promise.all([
      this.kv.get(key(sessionId, "spend")),
      this.kv.get(key(sessionId, "requests")),
      this.kv.get(key(sessionId, "models")),
      this.kv.get(key(sessionId, "latency_sum")),
      this.kv.get(key(sessionId, "tiers")),
    ]);

    const newSpent = (spentStr ? parseFloat(spentStr) : 0) + costUsd;
    const newCount = (countStr ? parseInt(countStr) : 0) + 1;
    const models: string[] = modelsStr ? JSON.parse(modelsStr) : [];
    if (!models.includes(modelId)) models.push(modelId);
    const newLatSum = (latSumStr ? parseFloat(latSumStr) : 0) + latencyMs;
    const tiers: Record<string, number> = tiersStr ? JSON.parse(tiersStr) : {};
    tiers[complexityTier] = (tiers[complexityTier] || 0) + 1;

    // Write all updates in parallel
    await Promise.all([
      this.kv.put(key(sessionId, "spend"), newSpent.toString(), { expirationTtl: TTL_SECONDS }),
      this.kv.put(key(sessionId, "requests"), newCount.toString(), { expirationTtl: TTL_SECONDS }),
      this.kv.put(key(sessionId, "models"), JSON.stringify(models), { expirationTtl: TTL_SECONDS }),
      this.kv.put(key(sessionId, "latency_sum"), newLatSum.toString(), { expirationTtl: TTL_SECONDS }),
      this.kv.put(key(sessionId, "tiers"), JSON.stringify(tiers), { expirationTtl: TTL_SECONDS }),
    ]);
  }

  /**
   * Fetch full usage stats for a workflow session.
   * Used by GET /v1/workflow/:session_id/usage
   */
  async getUsage(sessionId: string): Promise<WorkflowUsage | null> {
    const [budgetStr, spentStr, countStr, modelsStr, latSumStr, tiersStr] = await Promise.all([
      this.kv.get(key(sessionId, "budget")),
      this.kv.get(key(sessionId, "spend")),
      this.kv.get(key(sessionId, "requests")),
      this.kv.get(key(sessionId, "models")),
      this.kv.get(key(sessionId, "latency_sum")),
      this.kv.get(key(sessionId, "tiers")),
    ]);

    // Return null if session doesn't exist
    if (!budgetStr && !countStr) return null;

    const totalBudget = budgetStr ? parseFloat(budgetStr) : 0;
    const spent = spentStr ? parseFloat(spentStr) : 0;
    const count = countStr ? parseInt(countStr) : 0;
    const models: string[] = modelsStr ? JSON.parse(modelsStr) : [];
    const latSum = latSumStr ? parseFloat(latSumStr) : 0;
    const tiers: Record<string, number> = tiersStr ? JSON.parse(tiersStr) : {};

    const pct = totalBudget > 0 ? spent / totalBudget : 0;
    let effectiveTier: RoutingBudget = "auto";
    if (pct >= 0.80) effectiveTier = "free";
    else if (pct >= 0.60) effectiveTier = "economy";

    return {
      session_id: sessionId,
      total_budget_usd: totalBudget,
      total_spent_usd: Math.round(spent * 1_000_000) / 1_000_000,
      budget_remaining_usd: Math.max(0, Math.round((totalBudget - spent) * 1_000_000) / 1_000_000),
      budget_pct_used: Math.round(pct * 10000) / 100,
      effective_budget_tier: effectiveTier,
      total_requests: count,
      models_used: models,
      avg_latency_ms: count > 0 ? Math.round(latSum / count) : 0,
      tier_distribution: tiers,
    };
  }
}

/**
 * Parse X-Agent-Step header into complexity/topic/mode overrides.
 *
 * Values:
 *   simple-action    → SIMPLE complexity
 *   reasoning        → REASONING complexity
 *   code-generation  → COMPLEX complexity + "code" topic hint
 *   verification     → council mode
 *   analysis         → COMPLEX complexity
 *   planning         → REASONING complexity + "reasoning" topic hint
 */
export interface AgentStepOverride {
  complexityTier?: "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING";
  topicHint?: string;
  forceCouncilMode?: boolean;
}

export function parseAgentStep(header: string | null | undefined): AgentStepOverride {
  if (!header) return {};

  const step = header.toLowerCase().trim();

  const MAP: Record<string, AgentStepOverride> = {
    "simple-action": { complexityTier: "SIMPLE" },
    "simple":        { complexityTier: "SIMPLE" },
    "medium":        { complexityTier: "MEDIUM" },
    "reasoning":     { complexityTier: "REASONING" },
    "code-generation": { complexityTier: "COMPLEX", topicHint: "code" },
    "code":          { complexityTier: "COMPLEX", topicHint: "code" },
    "verification":  { forceCouncilMode: true },
    "verify":        { forceCouncilMode: true },
    "analysis":      { complexityTier: "COMPLEX" },
    "analyze":       { complexityTier: "COMPLEX" },
    "planning":      { complexityTier: "REASONING", topicHint: "reasoning" },
    "plan":          { complexityTier: "REASONING", topicHint: "reasoning" },
  };

  return MAP[step] || {};
}
