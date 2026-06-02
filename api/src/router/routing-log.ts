/**
 * Routing Log — per-request log to D1 for dashboard + reconciliation.
 *
 * Distinct from routing_history (which feeds routing analytics / ML training).
 * This table is the one queried by the customer dashboard.
 *
 * Use ctx.waitUntil() to write — never block the response.
 */

export interface RoutingLogEntry {
  request_id: string;
  timestamp: number;            // Unix ms
  api_key_hash?: string;        // Optional — only for paid tier
  auth_tier: string;            // 'free' | 'paid' | 'x402' | 'mpp' | 'playground'
  model_id?: string;
  topic?: string;
  complexity_tier?: string;
  latency_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  charged_usd?: number;
  call_path?: string;
  status: "success" | "error" | "fallback";
  is_agentic?: boolean;
  mode?: "default" | "council";
  session_id?: string;
}

export async function writeRoutingLog(
  db: D1Database,
  entry: RoutingLogEntry
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO routing_log (
          id, request_id, timestamp, api_key_hash, auth_tier,
          model_id, topic, complexity_tier, latency_ms,
          input_tokens, output_tokens, cost_usd, charged_usd,
          call_path, status, is_agentic, mode, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        entry.request_id,
        entry.timestamp,
        entry.api_key_hash ?? null,
        entry.auth_tier,
        entry.model_id ?? null,
        entry.topic ?? null,
        entry.complexity_tier ?? null,
        entry.latency_ms ?? null,
        entry.input_tokens ?? null,
        entry.output_tokens ?? null,
        entry.cost_usd ?? null,
        entry.charged_usd ?? null,
        entry.call_path ?? null,
        entry.status,
        entry.is_agentic ? 1 : 0,
        entry.mode ?? null,
        entry.session_id ?? null
      )
      .run();
  } catch (err) {
    // Non-blocking — log but don't throw
    console.error("[RoutingLog] Write failed:", err instanceof Error ? err.message : String(err));
  }
}
