/**
 * Routing History Logger
 *
 * Logs every routing decision to D1 for analytics and learning.
 * Uses ctx.waitUntil() for async writes (doesn't block response).
 *
 * This data enables:
 * - Popular model detection ("80% of code/security queries go to DeepSeek")
 * - Failover analysis ("Kimi K2.5 has 30% failover rate — needs circuit breaker")
 * - Topic distribution ("60% of traffic is code, 20% math, 10% writing")
 * - Future ML training data (like RouterBench - 405K datapoints for training learned routers)
 */

export interface RoutingHistoryEntry {
  request_id: string;
  topic: string;
  topic_confidence: number;
  complexity: string;
  budget: string;
  selected_model: string;
  data_source: string;
  latency_ms: number | null;
  success: boolean;
  failover_count: number;
  created_at: string;
}

/**
 * Log a routing decision to D1
 * Call this via ctx.waitUntil() to avoid blocking the response
 */
export async function logRoutingDecision(
  db: D1Database,
  entry: RoutingHistoryEntry
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO routing_history (
          request_id, topic, topic_confidence, complexity, budget,
          selected_model, data_source, latency_ms, success, failover_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        entry.request_id,
        entry.topic,
        entry.topic_confidence,
        entry.complexity,
        entry.budget,
        entry.selected_model,
        entry.data_source,
        entry.latency_ms,
        entry.success ? 1 : 0,
        entry.failover_count,
        entry.created_at
      )
      .run();

    console.log(`[RoutingHistory] Logged decision: ${entry.topic} → ${entry.selected_model}`);
  } catch (err) {
    // Don't fail the request if logging fails
    console.error('[RoutingHistory] Failed to log decision:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Get routing stats for analytics
 * Returns aggregated statistics from routing history
 */
export async function getRoutingStats(
  db: D1Database,
  since?: string // ISO date, e.g., '2026-03-01T00:00:00Z'
): Promise<{
  total_requests: number;
  by_topic: Record<string, number>;
  by_model: Record<string, number>;
  by_data_source: Record<string, number>;
  avg_failover_count: number;
  success_rate: number;
}> {
  try {
    // Total requests
    const totalResult = since
      ? await db.prepare(`SELECT COUNT(*) as count FROM routing_history WHERE created_at >= ?`).bind(since).first<{ count: number }>()
      : await db.prepare(`SELECT COUNT(*) as count FROM routing_history`).first<{ count: number }>();
    const total = totalResult?.count || 0;

    // By topic
    const topicResults = since
      ? await db.prepare(`SELECT topic, COUNT(*) as count FROM routing_history WHERE created_at >= ? GROUP BY topic ORDER BY count DESC LIMIT 20`).bind(since).all<{ topic: string; count: number }>()
      : await db.prepare(`SELECT topic, COUNT(*) as count FROM routing_history GROUP BY topic ORDER BY count DESC LIMIT 20`).all<{ topic: string; count: number }>();
    const byTopic: Record<string, number> = {};
    for (const row of topicResults.results || []) {
      byTopic[row.topic] = row.count;
    }

    // By model
    const modelResults = since
      ? await db.prepare(`SELECT selected_model, COUNT(*) as count FROM routing_history WHERE created_at >= ? GROUP BY selected_model ORDER BY count DESC LIMIT 20`).bind(since).all<{ selected_model: string; count: number }>()
      : await db.prepare(`SELECT selected_model, COUNT(*) as count FROM routing_history GROUP BY selected_model ORDER BY count DESC LIMIT 20`).all<{ selected_model: string; count: number }>();
    const byModel: Record<string, number> = {};
    for (const row of modelResults.results || []) {
      byModel[row.selected_model] = row.count;
    }

    // By data source
    const sourceResults = since
      ? await db.prepare(`SELECT data_source, COUNT(*) as count FROM routing_history WHERE created_at >= ? GROUP BY data_source`).bind(since).all<{ data_source: string; count: number }>()
      : await db.prepare(`SELECT data_source, COUNT(*) as count FROM routing_history GROUP BY data_source`).all<{ data_source: string; count: number }>();
    const byDataSource: Record<string, number> = {};
    for (const row of sourceResults.results || []) {
      byDataSource[row.data_source] = row.count;
    }

    // Avg failover count and success rate
    const statsResult = since
      ? await db.prepare(`
        SELECT
          AVG(failover_count) as avg_failover,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
        FROM routing_history WHERE created_at >= ?
      `).bind(since).first<{ avg_failover: number; success_rate: number }>()
      : await db.prepare(`
        SELECT
          AVG(failover_count) as avg_failover,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as success_rate
        FROM routing_history
      `).first<{ avg_failover: number; success_rate: number }>();

    return {
      total_requests: total,
      by_topic: byTopic,
      by_model: byModel,
      by_data_source: byDataSource,
      avg_failover_count: statsResult?.avg_failover || 0,
      success_rate: statsResult?.success_rate || 100,
    };
  } catch (err) {
    console.error('[RoutingHistory] Failed to get stats:', err instanceof Error ? err.message : String(err));
    return {
      total_requests: 0,
      by_topic: {},
      by_model: {},
      by_data_source: {},
      avg_failover_count: 0,
      success_rate: 0,
    };
  }
}
