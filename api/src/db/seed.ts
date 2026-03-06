/**
 * Seed script for SCORE_DB database
 * Populates domain taxonomy, models, and GPQA baseline scores
 *
 * Run with: pnpm wrangler d1 execute score-db --local --command "$(node -e "require('ts-node/register'); require('./src/db/seed').generateSQL()")"
 * Or manually copy SQL from this script
 */

export interface Domain {
  id: string;
  parent: string | null;
  display_name: string;
  description: string;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
  context_length: number;
  is_free: boolean;
  is_available: boolean;
  latency_p50_ms: number | null;
  reliability_pct: number | null;
  last_updated: string;
}

export interface BenchmarkScore {
  model_id: string;
  benchmark: string;
  domain: string;
  score: number;
  raw_score: number;
  source: string;
  source_url: string | null;
  measured_at: string;
}

// Domain taxonomy (hierarchical)
export const DOMAINS: Domain[] = [
  // Top-level domains
  { id: 'code', parent: null, display_name: 'Code', description: 'Programming, software development, debugging' },
  { id: 'math', parent: null, display_name: 'Math', description: 'Mathematics, calculations, proofs' },
  { id: 'science', parent: null, display_name: 'Science', description: 'Natural sciences, physics, chemistry, biology' },
  { id: 'writing', parent: null, display_name: 'Writing', description: 'Text generation, creative writing, documentation' },
  { id: 'general', parent: null, display_name: 'General', description: 'General knowledge, multi-domain queries' },
  { id: 'reasoning', parent: null, display_name: 'Reasoning', description: 'Logic puzzles, planning, multi-step analysis' },

  // Code subcategories
  { id: 'code/frontend', parent: 'code', display_name: 'Code: Frontend', description: 'React, Vue, CSS, HTML, UI development' },
  { id: 'code/backend', parent: 'code', display_name: 'Code: Backend', description: 'APIs, servers, databases, middleware' },
  { id: 'code/algorithms', parent: 'code', display_name: 'Code: Algorithms', description: 'Data structures, sorting, graph theory' },
  { id: 'code/devops', parent: 'code', display_name: 'Code: DevOps', description: 'CI/CD, Docker, Kubernetes, infrastructure' },
  { id: 'code/security', parent: 'code', display_name: 'Code: Security', description: 'Authentication, encryption, vulnerabilities' },
  { id: 'code/debugging', parent: 'code', display_name: 'Code: Debugging', description: 'Error analysis, stack traces, profiling' },

  // Math subcategories
  { id: 'math/calculus', parent: 'math', display_name: 'Math: Calculus', description: 'Integrals, derivatives, limits' },
  { id: 'math/algebra', parent: 'math', display_name: 'Math: Algebra', description: 'Equations, linear algebra, matrices' },
  { id: 'math/statistics', parent: 'math', display_name: 'Math: Statistics', description: 'Probability, distributions, hypothesis testing' },
  { id: 'math/discrete', parent: 'math', display_name: 'Math: Discrete', description: 'Combinatorics, graph theory, logic' },

  // Science subcategories
  { id: 'science/physics', parent: 'science', display_name: 'Science: Physics', description: 'Mechanics, quantum, thermodynamics' },
  { id: 'science/chemistry', parent: 'science', display_name: 'Science: Chemistry', description: 'Reactions, molecular, organic chemistry' },
  { id: 'science/biology', parent: 'science', display_name: 'Science: Biology', description: 'Genetics, cell biology, ecology' },
  { id: 'science/medicine', parent: 'science', display_name: 'Science: Medicine', description: 'Clinical, pharmacology, diagnostics' },

  // Writing subcategories
  { id: 'writing/creative', parent: 'writing', display_name: 'Writing: Creative', description: 'Stories, poetry, narrative' },
  { id: 'writing/technical', parent: 'writing', display_name: 'Writing: Technical', description: 'Documentation, manuals, API references' },
  { id: 'writing/business', parent: 'writing', display_name: 'Writing: Business', description: 'Emails, proposals, reports' },
  { id: 'writing/academic', parent: 'writing', display_name: 'Writing: Academic', description: 'Papers, citations, abstracts' },
];

// Initial model seed data
// IMPORTANT: Mistral pricing is CORRECTED (see PHASE4_SMART_ROUTING.md warning)
export const MODELS: Model[] = [
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3.2',
    provider: 'DeepSeek',
    input_price_per_1m: 0.28,
    output_price_per_1m: 0.42,
    context_length: 64000,
    is_free: false,
    is_available: true,
    latency_p50_ms: null,
    reliability_pct: null,
    last_updated: new Date().toISOString(),
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    provider: 'Qwen',
    input_price_per_1m: 0.50,
    output_price_per_1m: 1.50,
    context_length: 32768,
    is_free: false,
    is_available: true,
    latency_p50_ms: null,
    reliability_pct: null,
    last_updated: new Date().toISOString(),
  },
  {
    id: 'mistralai/mistral-large-2512',
    name: 'Mistral Large 3 (2512)',
    provider: 'Mistral',
    input_price_per_1m: 0.50,  // CORRECTED from $2.00
    output_price_per_1m: 1.50, // CORRECTED from $6.00
    context_length: 131072,
    is_free: false,
    is_available: true,
    latency_p50_ms: null,
    reliability_pct: null,
    last_updated: new Date().toISOString(),
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    input_price_per_1m: 3.00,
    output_price_per_1m: 15.00,
    context_length: 200000,
    is_free: false,
    is_available: true,
    latency_p50_ms: null,
    reliability_pct: null,
    last_updated: new Date().toISOString(),
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    input_price_per_1m: 0.00,  // Free tier model
    output_price_per_1m: 0.00,
    context_length: 128000,
    is_free: true,
    is_available: true,
    latency_p50_ms: null,
    reliability_pct: null,
    last_updated: new Date().toISOString(),
  },
];

// GPQA Diamond baseline scores (from our benchmarks)
// Source: Internal benchmarks run in March 2026
export const GPQA_SCORES: BenchmarkScore[] = [
  {
    model_id: 'anthropic/claude-sonnet-4.5',
    benchmark: 'gpqa_diamond',
    domain: 'science',
    score: 75.3,
    raw_score: 75.3,
    source: 'our_benchmark',
    source_url: null,
    measured_at: '2026-03-04T00:00:00Z',
  },
  {
    model_id: 'qwen/qwen-2.5-72b-instruct',
    benchmark: 'gpqa_diamond',
    domain: 'science',
    score: 74.2,
    raw_score: 74.2,
    source: 'our_benchmark',
    source_url: null,
    measured_at: '2026-03-04T00:00:00Z',
  },
  {
    model_id: 'deepseek/deepseek-chat',
    benchmark: 'gpqa_diamond',
    domain: 'science',
    score: 60.5,
    raw_score: 60.5,
    source: 'our_benchmark',
    source_url: null,
    measured_at: '2026-03-04T00:00:00Z',
  },
  {
    model_id: 'meta-llama/llama-3.3-70b-instruct',
    benchmark: 'gpqa_diamond',
    domain: 'science',
    score: 44.4,
    raw_score: 44.4,
    source: 'our_benchmark',
    source_url: null,
    measured_at: '2026-03-04T00:00:00Z',
  },
];

/**
 * Generate SQL INSERT statements for all seed data
 */
export function generateSQL(): string {
  const statements: string[] = [];

  // Insert domains
  for (const domain of DOMAINS) {
    const parent = domain.parent ? `'${domain.parent}'` : 'NULL';
    const description = domain.description.replace(/'/g, "''");
    statements.push(
      `INSERT INTO domains (id, parent, display_name, description) VALUES ('${domain.id}', ${parent}, '${domain.display_name}', '${description}');`
    );
  }

  // Insert models
  for (const model of MODELS) {
    const latency = model.latency_p50_ms ? model.latency_p50_ms : 'NULL';
    const reliability = model.reliability_pct ? model.reliability_pct : 'NULL';
    statements.push(
      `INSERT INTO models (id, name, provider, input_price_per_1m, output_price_per_1m, context_length, is_free, is_available, latency_p50_ms, reliability_pct, last_updated) VALUES ('${model.id}', '${model.name}', '${model.provider}', ${model.input_price_per_1m}, ${model.output_price_per_1m}, ${model.context_length}, ${model.is_free ? 1 : 0}, ${model.is_available ? 1 : 0}, ${latency}, ${reliability}, '${model.last_updated}');`
    );
  }

  // Insert GPQA scores
  for (const score of GPQA_SCORES) {
    const sourceUrl = score.source_url ? `'${score.source_url}'` : 'NULL';
    statements.push(
      `INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at) VALUES ('${score.model_id}', '${score.benchmark}', '${score.domain}', ${score.score}, ${score.raw_score}, '${score.source}', ${sourceUrl}, '${score.measured_at}');`
    );
  }

  return statements.join('\n');
}

// Export as module for programmatic use
export default {
  DOMAINS,
  MODELS,
  GPQA_SCORES,
  generateSQL,
};

// When run directly, output SQL to stdout
if (require.main === module) {
  console.log(generateSQL());
}
