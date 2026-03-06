/**
 * Latency & Reliability Telemetry
 *
 * Tracks per-model performance from real traffic:
 * - Latency (p50, p95)
 * - Reliability (% success)
 *
 * Data flow:
 * 1. Each request records latency + success/fail in KV (rolling window of last 100 calls)
 * 2. Cron job periodically flushes aggregates to D1 models table
 * 3. These metrics feed into value score calculations and public scores API
 *
 * Uses KV for hot writes (fast, per-request) and D1 for cold storage (slower, periodic aggregation).
 */

export interface TelemetryDataPoint {
  latencyMs: number;
  success: boolean;
  timestamp: number; // Date.now()
}

export interface TelemetryAggregate {
  p50_latency_ms: number;
  p95_latency_ms: number;
  success_rate: number; // 0-1
  total_requests: number;
}

const MAX_HISTORY_SIZE = 100; // Rolling window size
const KV_TTL_SECONDS = 86400; // 24 hours

/**
 * Routing Telemetry for tracking model performance
 */
export class RoutingTelemetry {
  constructor(private kv: KVNamespace) {}

  /**
   * Record a model call result (latency + success/fail)
   * Called after every model call in the smart router
   *
   * Stores in KV as rolling window (last 100 calls per model)
   */
  async record(modelId: string, latencyMs: number, success: boolean): Promise<void> {
    const key = `telemetry:${modelId}`;

    try {
      // Get existing history
      const raw = await this.kv.get(key);
      const history: TelemetryDataPoint[] = raw ? JSON.parse(raw) : [];

      // Add new data point
      history.push({
        latencyMs,
        success,
        timestamp: Date.now(),
      });

      // Keep only last MAX_HISTORY_SIZE entries (rolling window)
      if (history.length > MAX_HISTORY_SIZE) {
        history.shift();
      }

      // Store back to KV
      await this.kv.put(key, JSON.stringify(history), { expirationTtl: KV_TTL_SECONDS });
    } catch (err) {
      // Don't fail the request if telemetry fails
      console.error(`[Telemetry] Failed to record for ${modelId}:`, err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Calculate aggregates from history (for a specific model)
   * Returns p50, p95 latency and success rate
   */
  async getAggregates(modelId: string): Promise<TelemetryAggregate | null> {
    const key = `telemetry:${modelId}`;

    try {
      const raw = await this.kv.get(key);
      if (!raw) {
        return null;
      }

      const history: TelemetryDataPoint[] = JSON.parse(raw);
      if (history.length === 0) {
        return null;
      }

      // Calculate success rate
      const successCount = history.filter(d => d.success).length;
      const successRate = successCount / history.length;

      // Calculate latency percentiles
      const latencies = history.map(d => d.latencyMs).sort((a, b) => a - b);
      const p50Index = Math.floor(latencies.length * 0.5);
      const p95Index = Math.floor(latencies.length * 0.95);

      return {
        p50_latency_ms: latencies[p50Index],
        p95_latency_ms: latencies[p95Index],
        success_rate: successRate,
        total_requests: history.length,
      };
    } catch (err) {
      console.error(`[Telemetry] Failed to get aggregates for ${modelId}:`, err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  /**
   * Flush aggregates to D1 (called by cron)
   * Updates models.latency_p50_ms and models.reliability_pct from KV telemetry data
   */
  async flushToD1(db: D1Database): Promise<{ updated: number; errors: string[] }> {
    console.log('[Telemetry] Flushing aggregates to D1...');

    const errors: string[] = [];
    let updated = 0;

    try {
      // Get all model IDs from D1
      const models = await db
        .prepare(`SELECT id FROM models WHERE is_available = 1`)
        .all<{ id: string }>();

      if (!models.results || models.results.length === 0) {
        console.log('[Telemetry] No models found in database');
        return { updated: 0, errors };
      }

      // For each model, get aggregates and update D1
      for (const model of models.results) {
        try {
          const aggregates = await this.getAggregates(model.id);

          if (!aggregates) {
            // No telemetry data for this model yet
            continue;
          }

          // Update D1 models table
          await db
            .prepare(
              `UPDATE models
               SET latency_p50_ms = ?,
                   reliability_pct = ?,
                   last_updated = ?
               WHERE id = ?`
            )
            .bind(
              aggregates.p50_latency_ms,
              aggregates.success_rate * 100, // Store as percentage (0-100)
              new Date().toISOString(),
              model.id
            )
            .run();

          updated++;
          console.log(
            `[Telemetry] Updated ${model.id}: p50=${aggregates.p50_latency_ms}ms, reliability=${(aggregates.success_rate * 100).toFixed(1)}%, samples=${aggregates.total_requests}`
          );
        } catch (err) {
          const error = `Failed to update telemetry for ${model.id}: ${err}`;
          errors.push(error);
          console.error(`[Telemetry] ${error}`);
        }
      }

      console.log(`[Telemetry] Flush complete. Updated ${updated} models.`);
      return { updated, errors };
    } catch (err) {
      const error = `Telemetry flush failed: ${err}`;
      errors.push(error);
      console.error(`[Telemetry] ${error}`);
      return { updated, errors };
    }
  }

  /**
   * Clear telemetry data for a model (for testing/admin)
   */
  async clear(modelId: string): Promise<void> {
    const key = `telemetry:${modelId}`;
    await this.kv.delete(key);
    console.log(`[Telemetry] Cleared data for ${modelId}`);
  }
}
