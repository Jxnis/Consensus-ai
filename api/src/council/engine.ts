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

    // 1. Get/Update Model Registry
    const allModels = await ModelCrawler.getModels(this.kv, this.apiKey);

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

    // 4. Stage 2: Semantic Grouping
    const groups = ConsensusMatcher.groupSimilarResponses(results);
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
            content: "You are the Chairman of an AI Council. Your role is to analyze multiple conflicting responses and synthesize the most accurate, neutral, and helpful answer. If there is a clear halluncination in some, discard them. If they are different but valid, combine them. Return ONLY the final synthesized answer." 
          },
          { 
            role: "user", 
            content: `Prompt: ${prompt}\n\nCouncil Responses:\n${results.map((r, i) => `Model ${i+1} (${r.model}): ${r.answer}`).join("\n\n")}` 
          }
        ],
        temperature: 0.1
      });

      finalAnswer = chairmanResponse.choices[0]?.message?.content || finalAnswer;
      confidence = 1.0; // Chairman is authoritative
      modelUsed = "CHAIRMAN (Gemini 2.0 Flash)";
    }

    const consensusResponse: ConsensusResponse = {
      answer: finalAnswer,
      confidence,
      votes: results.map(r => ({
        model: r.model,
        answer: r.answer,
        agrees: ConsensusMatcher.getSimilarityScore(r.answer, topGroup.answer) > 0.7
      })),
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
   * Racing Algorithm with Abortion Logic
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

          if (results.length >= targetCount) {
            controller.abort();
            resolve(results);
          }
        }).catch(err => {
          if (err.name === 'AbortError') return;
          console.error(`[CouncilEngine] Model ${model.name} failed:`, err.message);
        }).finally(() => {
          activeRequests--;
          if (activeRequests === 0 && results.length < targetCount) {
            resolve(results);
          }
        });
      });
    });
  }
}
