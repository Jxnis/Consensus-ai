/**
 * Semantic Router — Hybrid embedding-based routing (Level 2)
 *
 * Architecture:
 * 1. Lexical prefilter (detectTopicDetailed) narrows domain
 * 2. D1 shortlist gets top-N candidates (N=10) by value_score
 * 3. Embed query using Workers AI (@cf/baai/bge-base-en-v1.5)
 * 4. Cosine similarity over shortlist embeddings
 * 5. Weighted rank: semantic_sim * 0.55 + value_score * 0.35 + reliability * 0.10
 * 6. Fallback to lexical routing if semantic step fails/times out
 */

import { CloudflareBindings } from '../types';

export interface SemanticRoutingResult {
  model_id: string;
  semantic_score: number;
  value_score: number;
  reliability_score: number;
  final_score: number;
  shortlist_size: number;
  semantic_latency_ms: number;
  semantic_enabled: boolean;
  fallback_reason?: string;
}

export interface ModelEmbedding {
  model_id: string;
  embedding: Float32Array;
  reference_text: string;
}

const SEMANTIC_TIMEOUT_MS = 2000; // 2s timeout (was 50ms, too aggressive)
const SHORTLIST_SIZE = 10;
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
const EMBEDDING_VERSION = 'v1';

// Weights for final ranking
const WEIGHTS = {
  semantic: 0.55,
  value: 0.35,
  reliability: 0.10,
};

export class SemanticRouter {
  private ai: Ai;
  private db: D1Database;
  private enabled: boolean;

  constructor(bindings: CloudflareBindings, enabled: boolean = false) {
    // @ts-ignore - Workers AI type not available
    this.ai = bindings.AI;
    this.db = bindings.SCORE_DB;
    this.enabled = enabled;
  }

  /**
   * Route a query using hybrid semantic approach
   * @param query User's prompt
   * @param domain Detected domain from lexical classifier
   * @param budget User's budget tier
   * @param confidence Confidence score from lexical classifier (0-1)
   */
  async route(
    query: string,
    domain: string,
    budget: string,
    confidence: number
  ): Promise<SemanticRoutingResult> {
    const startTime = Date.now();

    // Feature flag check
    if (!this.enabled) {
      throw new Error('Semantic routing is disabled');
    }

    try {
      // Step 1: Get shortlist from D1 (top models by value_score in this domain)
      const shortlist = await this.getShortlist(domain, budget, SHORTLIST_SIZE);

      if (shortlist.length === 0) {
        throw new Error(`No models found for domain: ${domain}`);
      }

      // Step 2: Embed the query with timeout
      const queryEmbedding = await this.embedWithTimeout(query, SEMANTIC_TIMEOUT_MS);

      // Step 3: Load model embeddings for shortlist
      const shortlistIds = shortlist.map(m => m.model_id);

      const modelEmbeddings = await this.getModelEmbeddings(shortlistIds, domain);

      if (modelEmbeddings.length === 0) {
        throw new Error(`No model embeddings found for shortlist (domain=${domain}, models=${shortlistIds.length})`);
      }

      // Step 4: Compute cosine similarities
      const rankedModels = this.rankBySemanticSimilarity(
        queryEmbedding,
        modelEmbeddings,
        shortlist
      );

      const topModel = rankedModels[0];
      const semantic_latency_ms = Date.now() - startTime;

      return {
        model_id: topModel.model_id,
        semantic_score: topModel.semantic_score,
        value_score: topModel.value_score,
        reliability_score: topModel.reliability_score,
        final_score: topModel.final_score,
        shortlist_size: shortlist.length,
        semantic_latency_ms,
        semantic_enabled: true,
      };

    } catch (err) {
      // Fallback: return top model from DB by value_score
      const fallback_reason = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[SemanticRouter] Failed, falling back to DB:`, fallback_reason);

      const shortlist = await this.getShortlist(domain, budget, 1);
      const semantic_latency_ms = Date.now() - startTime;

      if (shortlist.length === 0) {
        throw new Error(`No models available for domain: ${domain}`);
      }

      return {
        model_id: shortlist[0].model_id,
        semantic_score: 0,
        value_score: shortlist[0].value_score,
        reliability_score: shortlist[0].reliability || 0,
        final_score: shortlist[0].value_score,
        shortlist_size: shortlist.length,
        semantic_latency_ms,
        semantic_enabled: false,
        fallback_reason,
      };
    }
  }

  /**
   * Get top N models from D1 by value_score in this domain
   */
  private async getShortlist(
    domain: string,
    budget: string,
    limit: number
  ): Promise<Array<{ model_id: string; value_score: number; reliability: number }>> {
    // Try exact domain first, then parent domain if subdomain
    const domains = domain.includes('/') ? [domain, domain.split('/')[0]] : [domain];

    for (const d of domains) {
      const result = await this.db
        .prepare(
          `SELECT DISTINCT cs.model_id, cs.value_score,
           COALESCE(
             (SELECT AVG(score) FROM benchmark_scores WHERE model_id = cs.model_id),
             0
           ) as reliability
           FROM composite_scores cs
           WHERE cs.domain = ?
           ORDER BY cs.value_score DESC
           LIMIT ?`
        )
        .bind(d, limit)
        .all();

      if (result.results && result.results.length > 0) {
        return result.results as Array<{ model_id: string; value_score: number; reliability: number }>;
      }
    }

    // Fallback to general domain
    const result = await this.db
      .prepare(
        `SELECT DISTINCT cs.model_id, cs.value_score,
         COALESCE(
           (SELECT AVG(score) FROM benchmark_scores WHERE model_id = cs.model_id),
           0
         ) as reliability
         FROM composite_scores cs
         WHERE cs.domain = 'general'
         ORDER BY cs.value_score DESC
         LIMIT ?`
      )
      .bind(limit)
      .all();

    return (result.results || []) as Array<{ model_id: string; value_score: number; reliability: number }>;
  }

  /**
   * Embed text using Workers AI with timeout
   */
  private async embedWithTimeout(text: string, timeoutMs: number): Promise<Float32Array> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Workers AI embedding
      const response = await this.ai.run(EMBEDDING_MODEL, {
        text: [text],
      }, { signal: controller.signal });

      clearTimeout(timeout);

      // @ts-ignore - response shape from Workers AI
      if (!response?.data || !response.data[0]) {
        throw new Error('Invalid embedding response from Workers AI');
      }

      // @ts-ignore
      return new Float32Array(response.data[0]);

    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Embedding timeout (${timeoutMs}ms)`);
      }
      throw err;
    }
  }

  /**
   * Get pre-computed embeddings for models in this domain
   */
  private async getModelEmbeddings(
    modelIds: string[],
    domain: string
  ): Promise<ModelEmbedding[]> {
    if (modelIds.length === 0) return [];

    const placeholders = modelIds.map(() => '?').join(',');
    const result = await this.db
      .prepare(
        `SELECT model_id, embedding, reference_text
         FROM model_embeddings
         WHERE model_id IN (${placeholders})
         AND domain = ?
         AND embedding_version = ?`
      )
      .bind(...modelIds, domain, EMBEDDING_VERSION)
      .all();

    if (!result.results || result.results.length === 0) {
      return [];
    }

    return result.results.map(row => {
      // D1 returns BLOBs in various formats depending on runtime context.
      // In Cloudflare Workers production, it's often an ArrayBuffer-like object
      // that doesn't pass instanceof checks. We need to handle all cases.
      const rawEmbedding = row.embedding as any;
      let floatArray: Float32Array;

      try {
        if (rawEmbedding instanceof Float32Array) {
          floatArray = rawEmbedding;
        } else if (rawEmbedding instanceof ArrayBuffer) {
          floatArray = new Float32Array(rawEmbedding);
        } else if (ArrayBuffer.isView(rawEmbedding)) {
          floatArray = new Float32Array(
            rawEmbedding.buffer,
            rawEmbedding.byteOffset,
            rawEmbedding.byteLength / 4
          );
        } else if (rawEmbedding && typeof rawEmbedding === 'object') {
          // D1 returns BLOBs as plain JavaScript Array of byte values in production.
          // Each element is a number 0-255 representing one byte.
          // 768 floats × 4 bytes = 3072 byte values in the array.
          if (Array.isArray(rawEmbedding) && rawEmbedding.length > 0) {
            const byteArray = new Uint8Array(rawEmbedding);
            floatArray = new Float32Array(byteArray.buffer);
          } else if (rawEmbedding.byteLength !== undefined) {
            const byteArray = new Uint8Array(rawEmbedding);
            floatArray = new Float32Array(byteArray.buffer);
          } else {
            console.error(`[SemanticRouter] Cannot convert embedding for ${row.model_id}: constructor=${rawEmbedding.constructor?.name}`);
            return null;
          }
        } else {
          console.error(`[SemanticRouter] Unexpected embedding type: ${typeof rawEmbedding} for ${row.model_id}`);
          return null;
        }
      } catch (convErr) {
        console.error(`[SemanticRouter] Embedding conversion error for ${row.model_id}: ${convErr instanceof Error ? convErr.message : convErr}`);
        return null;
      }

      return {
        model_id: row.model_id as string,
        embedding: floatArray,
        reference_text: row.reference_text as string,
      };
    }).filter(Boolean) as ModelEmbedding[];
  }

  /**
   * Rank models by weighted score: semantic similarity + value_score + reliability
   */
  private rankBySemanticSimilarity(
    queryEmbedding: Float32Array,
    modelEmbeddings: ModelEmbedding[],
    shortlist: Array<{ model_id: string; value_score: number; reliability: number }>
  ): Array<{
    model_id: string;
    semantic_score: number;
    value_score: number;
    reliability_score: number;
    final_score: number;
  }> {
    const scores = modelEmbeddings.map(modelEmb => {
      const shortlistEntry = shortlist.find(m => m.model_id === modelEmb.model_id);
      if (!shortlistEntry) {
        return null;
      }

      const semantic_score = this.cosineSimilarity(queryEmbedding, modelEmb.embedding);
      const value_score = shortlistEntry.value_score;
      const reliability_score = shortlistEntry.reliability;

      // Normalize scores to 0-1 range
      const norm_semantic = Math.max(0, Math.min(1, (semantic_score + 1) / 2)); // cosine is [-1, 1]
      const norm_value = Math.max(0, Math.min(1, value_score)); // already 0-1
      const norm_reliability = Math.max(0, Math.min(1, reliability_score)); // already 0-1

      const final_score =
        norm_semantic * WEIGHTS.semantic +
        norm_value * WEIGHTS.value +
        norm_reliability * WEIGHTS.reliability;

      return {
        model_id: modelEmb.model_id,
        semantic_score,
        value_score,
        reliability_score,
        final_score,
      };
    }).filter(Boolean) as Array<{
      model_id: string;
      semantic_score: number;
      value_score: number;
      reliability_score: number;
      final_score: number;
    }>;

    // Sort by final_score descending
    return scores.sort((a, b) => b.final_score - a.final_score);
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }
}
