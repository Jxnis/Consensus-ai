/**
 * Circuit Breaker for Model Health Tracking
 *
 * Prevents routing to models that are consistently failing.
 * Pattern inspired by ruflo's provider-manager.ts, but adapted for per-model granularity.
 *
 * States:
 * - closed: Normal operation, model is healthy
 * - open: Model is failing, skip routing to it (1 min cooldown)
 * - half-open: Testing if model has recovered (allow 1 probe request)
 *
 * Uses KV for fast reads (<1ms) instead of D1 (~5ms).
 * Circuit state is ephemeral and resets on deployment (by design).
 */

export interface CircuitState {
  failures: number;      // consecutive failures
  lastFailure: number;   // timestamp in ms
  lastSuccess: number;   // timestamp in ms
  status: 'closed' | 'open' | 'half-open';
}

const FAILURE_THRESHOLD = 3;          // 3 consecutive failures → open
const COOLDOWN_MS = 60_000;          // 1 minute cooldown before half-open
const HALF_OPEN_PROBE_INTERVAL = 30_000; // Try 1 request every 30s in half-open state
const CIRCUIT_STATE_TTL = 600;       // KV expiration: 10 minutes (circuits auto-heal)

/**
 * Circuit Breaker for tracking per-model health
 */
export class ModelCircuitBreaker {
  constructor(private kv: KVNamespace) {}

  /**
   * Check if a model is healthy and should be routed to
   * Called BEFORE selecting a model for a request
   *
   * @returns true if model is healthy (or in half-open probe state), false if circuit is open
   */
  async isModelHealthy(modelId: string): Promise<boolean> {
    const key = `circuit:${modelId}`;
    const raw = await this.kv.get(key);

    if (!raw) {
      // No circuit state = healthy (default closed)
      return true;
    }

    try {
      const state: CircuitState = JSON.parse(raw);

      // Closed = healthy
      if (state.status === 'closed') {
        return true;
      }

      // Open = check if cooldown expired
      if (state.status === 'open') {
        const timeSinceFailure = Date.now() - state.lastFailure;

        if (timeSinceFailure > COOLDOWN_MS) {
          // Transition to half-open (allow probe request)
          state.status = 'half-open';
          await this.kv.put(key, JSON.stringify(state), { expirationTtl: CIRCUIT_STATE_TTL });
          console.log(`[CircuitBreaker] ${modelId}: open → half-open (cooldown expired, allowing probe)`);
          return true;
        }

        // Still in cooldown
        console.log(`[CircuitBreaker] ${modelId}: circuit OPEN (cooldown ${Math.round((COOLDOWN_MS - timeSinceFailure) / 1000)}s remaining)`);
        return false;
      }

      // Half-open = allow one probe request
      if (state.status === 'half-open') {
        const timeSinceLastProbe = Date.now() - (state.lastSuccess || state.lastFailure);

        if (timeSinceLastProbe < HALF_OPEN_PROBE_INTERVAL) {
          // Too soon since last probe, skip
          console.log(`[CircuitBreaker] ${modelId}: half-open, but probe interval not elapsed (${Math.round((HALF_OPEN_PROBE_INTERVAL - timeSinceLastProbe) / 1000)}s remaining)`);
          return false;
        }

        // Allow probe
        console.log(`[CircuitBreaker] ${modelId}: half-open, allowing probe request`);
        return true;
      }

      return true;
    } catch (err) {
      // JSON parse error or invalid state = assume healthy
      console.error(`[CircuitBreaker] Failed to parse circuit state for ${modelId}:`, err);
      return true;
    }
  }

  /**
   * Record a model failure
   * Called AFTER a model request fails
   *
   * Increments failure counter. If failures >= threshold, opens circuit.
   */
  async recordFailure(modelId: string): Promise<void> {
    const key = `circuit:${modelId}`;
    const raw = await this.kv.get(key);

    let state: CircuitState;

    if (!raw) {
      // First failure
      state = {
        failures: 1,
        lastFailure: Date.now(),
        lastSuccess: 0,
        status: 'closed',
      };
    } else {
      try {
        state = JSON.parse(raw);
        state.failures += 1;
        state.lastFailure = Date.now();

        // Check if threshold exceeded
        if (state.failures >= FAILURE_THRESHOLD) {
          state.status = 'open';
          console.warn(`[CircuitBreaker] ${modelId}: circuit OPENED after ${state.failures} consecutive failures`);
        }
      } catch (err) {
        console.error(`[CircuitBreaker] Failed to parse circuit state for ${modelId}:`, err);
        return;
      }
    }

    await this.kv.put(key, JSON.stringify(state), { expirationTtl: CIRCUIT_STATE_TTL });
  }

  /**
   * Record a model success
   * Called AFTER a model request succeeds
   *
   * Resets failure counter and closes circuit.
   */
  async recordSuccess(modelId: string): Promise<void> {
    const key = `circuit:${modelId}`;
    const raw = await this.kv.get(key);

    let state: CircuitState;

    if (!raw) {
      // First success, no need to store (default is healthy)
      return;
    }

    try {
      state = JSON.parse(raw);

      // If circuit was open or half-open, close it
      if (state.status === 'open' || state.status === 'half-open') {
        console.log(`[CircuitBreaker] ${modelId}: circuit CLOSED (recovery successful)`);
      }

      // Reset state
      state = {
        failures: 0,
        lastFailure: 0,
        lastSuccess: Date.now(),
        status: 'closed',
      };

      await this.kv.put(key, JSON.stringify(state), { expirationTtl: CIRCUIT_STATE_TTL });
    } catch (err) {
      console.error(`[CircuitBreaker] Failed to parse circuit state for ${modelId}:`, err);
    }
  }

  /**
   * Get circuit state for a model (for debugging/monitoring)
   */
  async getCircuitState(modelId: string): Promise<CircuitState | null> {
    const key = `circuit:${modelId}`;
    const raw = await this.kv.get(key);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[CircuitBreaker] Failed to parse circuit state for ${modelId}:`, err);
      return null;
    }
  }

  /**
   * Reset circuit for a model (for testing/admin)
   */
  async resetCircuit(modelId: string): Promise<void> {
    const key = `circuit:${modelId}`;
    await this.kv.delete(key);
    console.log(`[CircuitBreaker] ${modelId}: circuit RESET`);
  }
}
