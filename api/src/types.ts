export type ComplexityTier = "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING";

export interface ComplexityScore {
  tier: ComplexityTier;
  score: number;
  reason: string;
  confidence: number;  // 0-1 sigmoid-calibrated confidence in tier classification
  isAgentic: boolean;  // true when request contains tools[] or agentic keywords
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  pricePer1M: number;
  inputPrice: number;
  outputPrice: number;
  latency?: number;
  isFree: boolean;
  contextLength: number;
}

export interface ConsensusRequest {
  prompt: string;
  budget?: "free" | "low" | "medium" | "high" | "economy" | "auto" | "premium";
  reliability?: "standard" | "high";
  mode?: "default" | "council";  // TASK-A5: Router mode (routing logic in Phase 4)
}

export interface ConsensusResponse {
  answer: string;
  confidence: number;
  synthesized?: boolean;
  degraded?: boolean;  // FIX-10: Council formed with < minimum models
  deliberation?: {      // TASK-A4: Deliberation metadata
    triggered: boolean;
    rounds: number;
    round1_groups: number;
    round2_groups?: number;
    chairman_used: boolean;
  };
  monitoring?: {
    selectedModels: string[];
    respondedModels: string[];
    usedChairman: boolean;
    usedEmbeddings: boolean;
    estimatedModelCostUsd: number;
    estimatedEmbeddingCostUsd: number;
    estimatedChairmanCostUsd: number;
    estimatedTotalCostUsd: number;
  };
  votes: {
    model: string;
    answer: string;
    agrees: boolean;
  }[];
  complexity: ComplexityTier;
  cached: boolean;
  model_used?: string;
  mode_used?: "default" | "council";  // TASK-A5: Which mode was used
}

export interface CloudflareBindings {
  OPENROUTER_API_KEY: string;
  ADMIN_TOKEN: string;
  X402_WALLET_ADDRESS: string;
  CONSENSUS_CACHE: KVNamespace;
  SCORE_DB: D1Database;
  AI: any; // Workers AI binding
  ENVIRONMENT?: string;
  SEMANTIC_ROUTING_ENABLED?: string; // Feature flag: 'true' | 'false'
  // Direct provider API keys (optional — falls back to OpenRouter when not set)
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  XAI_API_KEY?: string;
  // Stripe integration (optional)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
}
