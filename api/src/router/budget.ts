/**
 * Shared budget normalization for routing
 *
 * Canonical routing budgets: free | economy | auto | premium
 * Legacy aliases: low → economy, medium → auto, high → premium
 */

export type RoutingBudget = "free" | "economy" | "auto" | "premium";

/**
 * Normalize any budget string to canonical RoutingBudget.
 * Handles legacy aliases (low/medium/high) and case-insensitive input.
 */
export function normalizeRoutingBudget(rawBudget?: string): RoutingBudget {
  const budget = (rawBudget || "auto").toLowerCase();
  if (budget === "free") return "free";
  if (budget === "economy" || budget === "low") return "economy";
  if (budget === "premium" || budget === "high") return "premium";
  if (budget === "auto" || budget === "medium") return "auto";
  return "auto";
}

/**
 * Convert routing budget to legacy council budget names.
 * Council selector still uses free/low/medium/high internally.
 */
export function routingBudgetToCouncilBudget(budget: RoutingBudget): "free" | "low" | "medium" | "high" {
  if (budget === "free") return "free";
  if (budget === "economy") return "low";
  if (budget === "premium") return "high";
  return "medium";
}
