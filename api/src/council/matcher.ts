import OpenAI from "openai";

/**
 * Production-grade semantic similarity matcher using embeddings
 */
export class ConsensusMatcher {
  private static embeddingCache = new Map<string, number[]>();

  /**
   * Get embedding vector for text using OpenRouter's embedding model
   */
  static async getEmbedding(text: string, openai: OpenAI): Promise<number[]> {
    const cacheKey = this.hashText(text);
    
    if (this.embeddingCache.has(cacheKey)) {
      return this.embeddingCache.get(cacheKey)!;
    }

    try {
      const response = await openai.embeddings.create({
        model: "openai/text-embedding-3-small",
        input: text.slice(0, 8000), // Limit to avoid token overflow
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error("No embedding returned from API");
      }
      this.embeddingCache.set(cacheKey, embedding);
      
      // LRU cache: keep only last 100 embeddings
      if (this.embeddingCache.size > 100) {
        const firstKey = this.embeddingCache.keys().next().value;
        if (firstKey !== undefined) {
          this.embeddingCache.delete(firstKey);
        }
      }

      return embedding;
    } catch (error) {
      console.error("[ConsensusMatcher] Embedding generation failed, falling back to string matching:", error);
      // Fallback: return a simple hash-based vector
      return this.getFallbackVector(text);
    }
  }

  /**
   * Compute cosine similarity between two embedding vectors
   */
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
   * Get semantic similarity score between two texts using embeddings
   */
  static async getSimilarityScore(a: string, b: string, openai: OpenAI): Promise<number> {
    if (a === b) return 1.0;
    
    const [embA, embB] = await Promise.all([
      this.getEmbedding(a, openai),
      this.getEmbedding(b, openai)
    ]);
    
    return this.cosineSimilarity(embA, embB);
  }

  /**
   * Groups responses that are semantically similar (> threshold)
   */
  static async groupSimilarResponses(
    votes: { model: string; answer: string }[],
    openai: OpenAI,
    threshold: number = 0.85
  ): Promise<Array<{
    answer: string;
    models: string[];
    count: number;
    score: number;
  }>> {
    const groups: Array<{ answer: string; models: string[]; count: number; score: number; embedding: number[] }> = [];

    for (const vote of votes) {
      const voteEmbedding = await this.getEmbedding(vote.answer, openai);
      let found = false;

      for (const group of groups) {
        const similarity = this.cosineSimilarity(voteEmbedding, group.embedding);
        if (similarity > threshold) {
          group.models.push(vote.model);
          group.count++;
          group.score = Math.max(group.score, similarity);
          found = true;
          break;
        }
      }

      if (!found) {
        groups.push({
          answer: vote.answer,
          models: [vote.model],
          count: 1,
          score: 1.0,
          embedding: voteEmbedding
        });
      }
    }

    return groups
      .map(({ answer, models, count, score }) => ({ answer, models, count, score }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Simple hash for caching
   */
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
   * Fallback vector generation when embedding API fails
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
