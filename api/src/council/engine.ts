import OpenAI from "openai";
import { ConsensusRequest, ConsensusResponse, ComplexityTier, ModelInfo, CloudflareBindings } from "../types";
import { ModelCrawler } from "./crawler";
import { CouncilSelector } from "./selector";
import { ConsensusMatcher } from "./matcher";

export class CouncilEngine {
  private openai: OpenAI;
  private kv: KVNamespace;
  private apiKey: string;

  constructor(env: CloudflareBindings) {
    this.apiKey = env.OPENROUTER_API_KEY;
    this.kv = env.CONSENSUS_CACHE;
    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: this.apiKey,
    });
  }

  /**
   * Run the Production Consensus Protocol
   */
  async runConsensus(
    request: ConsensusRequest,
    tier: ComplexityTier
  ): Promise<ConsensusResponse> {
    const { prompt } = request;

    // 0. Cache Lookup
    const cacheKey = await this.hashPrompt(prompt);
    const cached = await this.kv.get(cacheKey);
    if (cached) {
      console.log(`[CouncilEngine] Cache HIT for prompt hash: ${cacheKey.slice(0, 8)}`);
      const cachedResult = JSON.parse(cached) as ConsensusResponse;
      return { ...cachedResult, cached: true };
    }

    // 1. Get/Update Model Registry (with fallback)
    let allModels: ModelInfo[];
    try {
      allModels = await ModelCrawler.getModels(this.kv, this.apiKey);
    } catch (error) {
      console.error("[CouncilEngine] OpenRouter API failed. Using fallback model list.", error);
      // Fallback: Production-tested models
      allModels = this.getFallbackModels();
    }

    // 2. Select Dynamic Council
    const selectedModels = CouncilSelector.selectModels(allModels, tier, request);
    
    if (selectedModels.length === 0) {
      throw new Error("No suitable models found for this request.");
    }

    // 3. Fire Parallel Requests (Racing)
    console.log(`[CouncilEngine] Selected Council for "${tier}" request:`);
    selectedModels.forEach(m => console.log(`  - ${m.name} (${m.id}) | Price: $${m.pricePer1M.toFixed(4)}/1M`));
    
    // Determine Target Count based on complexity
    const targetCount = tier === "SIMPLE" ? 2 : 3;
    
    const results = await this.raceModels(prompt, selectedModels, targetCount);

    if (results.length === 0) {
      throw new Error("All models in the council failed. Please check connectivity.");
    }

    // 4. Stage 2: Semantic Grouping (now async with embeddings)
    const groups = await ConsensusMatcher.groupSimilarResponses(results, this.openai);
    const topGroup = groups[0];
    
    // 5. Stage 3: Synthesis / Chairman (Decision Point)
    let finalAnswer = topGroup.answer;
    let confidence = topGroup.count / results.length;
    let modelUsed = topGroup.models[0];

    // If confidence is low or there is a strong disagreement, escalate to Chairman
    if (confidence < 0.6 && tier !== "SIMPLE") {
      console.log(`[CouncilEngine] Low confidence (${confidence.toFixed(2)}). Escalating to Chairman for synthesis...`);
      
      const chairmanResponse = await this.openai.chat.completions.create({
        model: "google/gemini-2.0-flash-001", // Production-grade fast/smart choice
        messages: [
          { 
            role: "system", 
            content: "You are the Chairman of an AI Council. Your role is to analyze multiple conflicting responses and synthesize the most accurate, neutral, and helpful answer. If there is a clear hallucination in some, discard them. If they are different but valid, combine them. Return ONLY the final synthesized answer." 
          },
          { 
            role: "user", 
            content: `Prompt: ${prompt}\n\nCouncil Responses:\n${results.map((r, i) => `Model ${i+1} (${r.model}): ${r.answer}`).join("\n\n")}` 
          }
        ],
        temperature: 0.1
      });

      finalAnswer = chairmanResponse.choices[0]?.message?.content || finalAnswer;
      confidence = 0.80; // Chairman synthesis (not 1.0 - still a single model)
      modelUsed = "CHAIRMAN (Gemini 2.0 Flash)";
    }

    // Compute voting with semantic similarity
    const votesWithAgreement = await Promise.all(
      results.map(async (r) => ({
        model: r.model,
        answer: r.answer,
        agrees: await ConsensusMatcher.getSimilarityScore(r.answer, topGroup.answer, this.openai) > 0.75
      }))
    );

    const consensusResponse: ConsensusResponse = {
      answer: finalAnswer,
      confidence,
      votes: votesWithAgreement,
      complexity: tier,
      cached: false,
      model_used: modelUsed
    };

    // 6. Cache high-confidence results (>80% agreement)
    if (consensusResponse.confidence > 0.8) {
      await this.kv.put(cacheKey, JSON.stringify(consensusResponse), {
        expirationTtl: 86400 // 24 hours
      });
    }

    return consensusResponse;
  }

  private async hashPrompt(prompt: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(prompt.trim().toLowerCase());
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Racing Algorithm with Abortion Logic + 15s Timeout
   */
  private async raceModels(
    prompt: string,
    models: ModelInfo[],
    targetCount: number
  ): Promise<{ model: string; answer: string }[]> {
    const results: { model: string; answer: string }[] = [];
    const controller = new AbortController();

    return new Promise((resolve) => {
      let activeRequests = models.length;
      let isResolved = false;

      // 15-second timeout
      const timeout = setTimeout(() => {
        if (!isResolved) {
          console.log(`[CouncilEngine] Racing timeout after 15s. Resolving with ${results.length} results.`);
          controller.abort();
          isResolved = true;
          resolve(results);
        }
      }, 15000);

      const tryResolve = () => {
        if (isResolved) return;
        
        if (results.length >= targetCount || activeRequests === 0) {
          clearTimeout(timeout);
          controller.abort();
          isResolved = true;
          resolve(results);
        }
      };

      models.forEach(model => {
        this.openai.chat.completions.create({
          model: model.id,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 1000,
        }, { signal: controller.signal }).then(response => {
          if (controller.signal.aborted) return;
          
          results.push({ 
            model: model.name, 
            answer: response.choices[0]?.message?.content || "" 
          });

          tryResolve();
        }).catch(err => {
          if (err.name === 'AbortError') return;
          console.error(`[CouncilEngine] Model ${model.name} failed:`, err.message);
        }).finally(() => {
          activeRequests--;
          tryResolve();
        });
      });
    });
  }

  /**
   * Fallback model list when OpenRouter API is unavailable
   */
  private getFallbackModels(): ModelInfo[] {
    return [
      // Free tier
      { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B", provider: "Meta", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 8192 },
      { id: "google/gemini-2.0-flash-thinking-exp:free", name: "Gemini 2.0 Flash", provider: "Google", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 32768 },
      { id: "mistralai/mistral-7b-instruct:free", name: "Mistral 7B", provider: "Mistral", pricePer1M: 0, inputPrice: 0, outputPrice: 0, isFree: true, contextLength: 8192 },
      
      // Cheap tier ($0.10-0.50/1M)
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", pricePer1M: 0.15, inputPrice: 0.15, outputPrice: 0.60, isFree: false, contextLength: 128000 },
      { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", pricePer1M: 0.25, inputPrice: 0.25, outputPrice: 1.25, isFree: false, contextLength: 200000 },
      { id: "google/gemini-flash-1.5", name: "Gemini 1.5 Flash", provider: "Google", pricePer1M: 0.075, inputPrice: 0.075, outputPrice: 0.30, isFree: false, contextLength: 1000000 },
      { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B", provider: "Meta", pricePer1M: 0.35, inputPrice: 0.35, outputPrice: 0.40, isFree: false, contextLength: 131072 },
      
      // Smart tier ($1-10/1M)
      { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", pricePer1M: 2.50, inputPrice: 2.50, outputPrice: 10.0, isFree: false, contextLength: 128000 },
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", pricePer1M: 3.0, inputPrice: 3.0, outputPrice: 15.0, isFree: false, contextLength: 200000 },
      { id: "google/gemini-pro-1.5", name: "Gemini 1.5 Pro", provider: "Google", pricePer1M: 1.25, inputPrice: 1.25, outputPrice: 5.0, isFree: false, contextLength: 2000000 },
      { id: "meta-llama/llama-3.1-405b-instruct", name: "Llama 3.1 405B", provider: "Meta", pricePer1M: 2.70, inputPrice: 2.70, outputPrice: 2.70, isFree: false, contextLength: 131072 },
      
      // Premium tier ($10+/1M)
      { id: "anthropic/claude-opus-4", name: "Claude Opus 4", provider: "Anthropic", pricePer1M: 15.0, inputPrice: 15.0, outputPrice: 75.0, isFree: false, contextLength: 200000 },
      { id: "openai/o1-preview", name: "OpenAI o1-preview", provider: "OpenAI", pricePer1M: 15.0, inputPrice: 15.0, outputPrice: 60.0, isFree: false, contextLength: 128000 },
      { id: "perplexity/llama-3.1-sonar-large-128k-online", name: "Perplexity Sonar Large", provider: "Perplexity", pricePer1M: 5.0, inputPrice: 5.0, outputPrice: 5.0, isFree: false, contextLength: 127072 },
    ];
  }
}
