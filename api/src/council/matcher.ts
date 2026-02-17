import OpenAI from "openai";

/**
 * Semantic similarity matcher.
 * - Paid tiers: embedding-based cosine similarity (high quality)
 * - Free tier: Jaccard word-overlap (zero cost, good enough for consensus detection)
 *
 * IMPORTANT: The embeddingCache parameter must be request-scoped (created per-request in engine.ts).
 * Do NOT use a static class-level Map — that leaks memory across Cloudflare Worker requests.
 */
export class ConsensusMatcher {
  /**
   * Get embedding vector, using the provided request-scoped cache.
   */
  static async getEmbedding(
    text: string,
    openai: OpenAI,
    cache: Map<string, number[]>
  ): Promise<number[]> {
    const cacheKey = this.hashText(text);

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    try {
      const response = await openai.embeddings.create({
        model: "openai/text-embedding-3-small",
        input: text.slice(0, 8000),
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) throw new Error("No embedding returned from API");

      cache.set(cacheKey, embedding);
      return embedding;
    } catch (error) {
      console.error("[ConsensusMatcher] Embedding failed, falling back to Jaccard:", error);
      return this.getFallbackVector(text);
    }
  }

  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Jaccard word-overlap similarity — zero API cost, used for free tier.
   * Returns a value between 0 and 1.
   */
  static jaccardSimilarity(a: string, b: string): number {
    const tokenize = (text: string) =>
      new Set(text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2));

    const setA = tokenize(a);
    const setB = tokenize(b);

    if (setA.size === 0 && setB.size === 0) return 1;
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return intersection / union;
  }

  /**
   * Groups responses that are semantically similar.
   *
   * @param votes - Model responses to group
   * @param openai - OpenAI client (used only for paid tier embeddings)
   * @param embeddingCache - Request-scoped cache (prevents cross-request memory leak)
   * @param useJaccard - If true, uses Jaccard overlap instead of embeddings (free tier)
   */
  static async groupSimilarResponses(
    votes: { model: string; answer: string }[],
    openai: OpenAI,
    embeddingCache: Map<string, number[]>,
    useJaccard: boolean = false,
    threshold: number = 0.75
  ): Promise<Array<{
    answer: string;
    models: string[];
    count: number;
    score: number;
  }>> {
    // Jaccard path: O(n²) word overlap, zero API calls
    if (useJaccard) {
      const groups: Array<{ answer: string; models: string[]; count: number; score: number }> = [];

      for (const vote of votes) {
        let found = false;
        for (const group of groups) {
          const similarity = this.jaccardSimilarity(vote.answer, group.answer);
          if (similarity > threshold) {
            group.models.push(vote.model);
            group.count++;
            group.score = Math.max(group.score, similarity);
            found = true;
            break;
          }
        }
        if (!found) {
          groups.push({ answer: vote.answer, models: [vote.model], count: 1, score: 1.0 });
        }
      }

      return groups.sort((a, b) => b.count - a.count);
    }

    // Embedding path: semantic cosine similarity for paid tiers
    const embeddingThreshold = 0.85;
    type GroupWithEmb = { answer: string; models: string[]; count: number; score: number; embedding: number[] };
    const groups: GroupWithEmb[] = [];

    for (const vote of votes) {
      const voteEmbedding = await this.getEmbedding(vote.answer, openai, embeddingCache);
      let found = false;

      for (const group of groups) {
        const similarity = this.cosineSimilarity(voteEmbedding, group.embedding);
        if (similarity > embeddingThreshold) {
          group.models.push(vote.model);
          group.count++;
          group.score = Math.max(group.score, similarity);
          found = true;
          break;
        }
      }

      if (!found) {
        groups.push({ answer: vote.answer, models: [vote.model], count: 1, score: 1.0, embedding: voteEmbedding });
      }
    }

    return groups
      .map(({ answer, models, count, score }) => ({ answer, models, count, score }))
      .sort((a, b) => b.count - a.count);
  }

  private static hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Fallback vector when embedding API fails — better quality than purely random.
   * Uses character n-gram frequencies for a rough semantic fingerprint.
   */
  private static getFallbackVector(text: string): number[] {
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, "");
    const words = normalized.split(/\s+/).filter(w => w.length > 2);
    const vector = new Array(384).fill(0);

    words.forEach((word, idx) => {
      for (let i = 0; i < word.length; i++) {
        const charCode = word.charCodeAt(i);
        vector[(idx * 17 + i * 7 + charCode) % 384] += 1;
      }
    });

    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return norm > 0 ? vector.map(v => v / norm) : vector;
  }
}
