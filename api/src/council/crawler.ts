import { ModelInfo } from "../types";

export interface OpenRouterModelResponse {
  data: Array<{
    id: string;
    name: string;
    description: string;
    pricing: {
      prompt: string;
      completion: string;
      image: string;
      request: string;
    };
    context_length: number;
    architecture: {
      modality: string;
      tokenizer: string;
      instruct_type: string;
    };
    top_provider: string;
    per_model_latency?: {
      p50: number;
      p90: number;
    };
  }>;
}

export class ModelCrawler {
  private static CACHE_KEY = "openrouter_models_v1";
  private static CACHE_TTL = 3600; // 1 hour

  /**
   * Fetches latest models from OpenRouter and caches them in KV
   */
  static async updateModelRegistry(kv: KVNamespace, apiKey: string): Promise<ModelInfo[]> {
    console.log("[ModelCrawler] Updating model registry from OpenRouter...");

    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://councilrouter.ai", // Required by OpenRouter
          "X-Title": "CouncilRouter"
        }
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API failed: ${response.statusText}`);
      }

      const json = await response.json() as OpenRouterModelResponse;
      const models: ModelInfo[] = json.data.map(m => {
        const inputPrice = parseFloat(m.pricing.prompt) * 1000000;
        const outputPrice = parseFloat(m.pricing.completion) * 1000000;
        
        return {
          id: m.id,
          name: m.name,
          provider: m.top_provider,
          inputPrice,
          outputPrice,
          pricePer1M: (inputPrice + outputPrice) / 2, // Avg weight for sorting
          latency: m.per_model_latency?.p50,
          isFree: inputPrice === 0 && outputPrice === 0,
          contextLength: m.context_length
        };
      });

      // Cache the full list
      await kv.put(this.CACHE_KEY, JSON.stringify(models), {
        expirationTtl: this.CACHE_TTL
      });

      console.log(`[ModelCrawler] Successfully cached ${models.length} models.`);
      return models;
    } catch (error) {
      console.error("[ModelCrawler] Failed to update registry:", error);
      throw error;
    }
  }

  /**
   * Retrieves models from cache or triggers update if missing
   */
  static async getModels(kv: KVNamespace, apiKey: string): Promise<ModelInfo[]> {
    const cached = await kv.get(this.CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as ModelInfo[];
    }
    return this.updateModelRegistry(kv, apiKey);
  }
}
