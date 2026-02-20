export type ComplexityTier = "SIMPLE" | "MEDIUM" | "COMPLEX";

export interface ComplexityScore {
  tier: ComplexityTier;
  score: number;
  reason: string;
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
  budget?: "free" | "low" | "medium" | "high";
  reliability?: "standard" | "high";
}

export interface ConsensusResponse {
  answer: string;
  confidence: number;
  synthesized?: boolean;
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
}

export interface CloudflareBindings {
  OPENROUTER_API_KEY: string;
  ADMIN_TOKEN: string;
  X402_WALLET_ADDRESS: string;
  CONSENSUS_CACHE: KVNamespace;
}
