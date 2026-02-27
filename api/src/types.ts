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
}
