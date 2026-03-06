-- Seed data for SCORE_DB database
-- Domain taxonomy, initial models, and GPQA baseline scores

-- ==================== DOMAINS ====================

-- Top-level domains
INSERT INTO domains (id, parent, display_name, description) VALUES ('code', NULL, 'Code', 'Programming, software development, debugging');
INSERT INTO domains (id, parent, display_name, description) VALUES ('math', NULL, 'Math', 'Mathematics, calculations, proofs');
INSERT INTO domains (id, parent, display_name, description) VALUES ('science', NULL, 'Science', 'Natural sciences, physics, chemistry, biology');
INSERT INTO domains (id, parent, display_name, description) VALUES ('writing', NULL, 'Writing', 'Text generation, creative writing, documentation');
INSERT INTO domains (id, parent, display_name, description) VALUES ('general', NULL, 'General', 'General knowledge, multi-domain queries');
INSERT INTO domains (id, parent, display_name, description) VALUES ('reasoning', NULL, 'Reasoning', 'Logic puzzles, planning, multi-step analysis');

-- Code subcategories
INSERT INTO domains (id, parent, display_name, description) VALUES ('code/frontend', 'code', 'Code: Frontend', 'React, Vue, CSS, HTML, UI development');
INSERT INTO domains (id, parent, display_name, description) VALUES ('code/backend', 'code', 'Code: Backend', 'APIs, servers, databases, middleware');
INSERT INTO domains (id, parent, display_name, description) VALUES ('code/algorithms', 'code', 'Code: Algorithms', 'Data structures, sorting, graph theory');
INSERT INTO domains (id, parent, display_name, description) VALUES ('code/devops', 'code', 'Code: DevOps', 'CI/CD, Docker, Kubernetes, infrastructure');
INSERT INTO domains (id, parent, display_name, description) VALUES ('code/security', 'code', 'Code: Security', 'Authentication, encryption, vulnerabilities');
INSERT INTO domains (id, parent, display_name, description) VALUES ('code/debugging', 'code', 'Code: Debugging', 'Error analysis, stack traces, profiling');

-- Math subcategories
INSERT INTO domains (id, parent, display_name, description) VALUES ('math/calculus', 'math', 'Math: Calculus', 'Integrals, derivatives, limits');
INSERT INTO domains (id, parent, display_name, description) VALUES ('math/algebra', 'math', 'Math: Algebra', 'Equations, linear algebra, matrices');
INSERT INTO domains (id, parent, display_name, description) VALUES ('math/statistics', 'math', 'Math: Statistics', 'Probability, distributions, hypothesis testing');
INSERT INTO domains (id, parent, display_name, description) VALUES ('math/discrete', 'math', 'Math: Discrete', 'Combinatorics, graph theory, logic');

-- Science subcategories
INSERT INTO domains (id, parent, display_name, description) VALUES ('science/physics', 'science', 'Science: Physics', 'Mechanics, quantum, thermodynamics');
INSERT INTO domains (id, parent, display_name, description) VALUES ('science/chemistry', 'science', 'Science: Chemistry', 'Reactions, molecular, organic chemistry');
INSERT INTO domains (id, parent, display_name, description) VALUES ('science/biology', 'science', 'Science: Biology', 'Genetics, cell biology, ecology');
INSERT INTO domains (id, parent, display_name, description) VALUES ('science/medicine', 'science', 'Science: Medicine', 'Clinical, pharmacology, diagnostics');

-- Writing subcategories
INSERT INTO domains (id, parent, display_name, description) VALUES ('writing/creative', 'writing', 'Writing: Creative', 'Stories, poetry, narrative');
INSERT INTO domains (id, parent, display_name, description) VALUES ('writing/technical', 'writing', 'Writing: Technical', 'Documentation, manuals, API references');
INSERT INTO domains (id, parent, display_name, description) VALUES ('writing/business', 'writing', 'Writing: Business', 'Emails, proposals, reports');
INSERT INTO domains (id, parent, display_name, description) VALUES ('writing/academic', 'writing', 'Writing: Academic', 'Papers, citations, abstracts');

-- ==================== MODELS ====================
-- IMPORTANT: Mistral pricing is CORRECTED ($0.50/$1.50 not $2.00/$6.00)

INSERT INTO models (id, name, provider, input_price_per_1m, output_price_per_1m, context_length, is_free, is_available, latency_p50_ms, reliability_pct, last_updated)
VALUES ('deepseek/deepseek-chat', 'DeepSeek V3.2', 'DeepSeek', 0.28, 0.42, 64000, 0, 1, NULL, NULL, '2026-03-05T00:00:00Z');

INSERT INTO models (id, name, provider, input_price_per_1m, output_price_per_1m, context_length, is_free, is_available, latency_p50_ms, reliability_pct, last_updated)
VALUES ('qwen/qwen-2.5-72b-instruct', 'Qwen 2.5 72B', 'Qwen', 0.50, 1.50, 32768, 0, 1, NULL, NULL, '2026-03-05T00:00:00Z');

INSERT INTO models (id, name, provider, input_price_per_1m, output_price_per_1m, context_length, is_free, is_available, latency_p50_ms, reliability_pct, last_updated)
VALUES ('mistralai/mistral-large-2512', 'Mistral Large 3 (2512)', 'Mistral', 0.50, 1.50, 131072, 0, 1, NULL, NULL, '2026-03-05T00:00:00Z');

INSERT INTO models (id, name, provider, input_price_per_1m, output_price_per_1m, context_length, is_free, is_available, latency_p50_ms, reliability_pct, last_updated)
VALUES ('anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5', 'Anthropic', 3.00, 15.00, 200000, 0, 1, NULL, NULL, '2026-03-05T00:00:00Z');

INSERT INTO models (id, name, provider, input_price_per_1m, output_price_per_1m, context_length, is_free, is_available, latency_p50_ms, reliability_pct, last_updated)
VALUES ('meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B', 'Meta', 0.00, 0.00, 128000, 1, 1, NULL, NULL, '2026-03-05T00:00:00Z');

-- ==================== GPQA DIAMOND BASELINE SCORES ====================
-- Source: Internal benchmarks run in March 2026
-- Benchmark: GPQA Diamond (Graduate-level Physics, Chemistry, Biology)

INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at)
VALUES ('anthropic/claude-sonnet-4.5', 'gpqa_diamond', 'science', 75.3, 75.3, 'our_benchmark', NULL, '2026-03-04T00:00:00Z');

INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at)
VALUES ('qwen/qwen-2.5-72b-instruct', 'gpqa_diamond', 'science', 74.2, 74.2, 'our_benchmark', NULL, '2026-03-04T00:00:00Z');

INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at)
VALUES ('deepseek/deepseek-chat', 'gpqa_diamond', 'science', 60.5, 60.5, 'our_benchmark', NULL, '2026-03-04T00:00:00Z');

INSERT INTO benchmark_scores (model_id, benchmark, domain, score, raw_score, source, source_url, measured_at)
VALUES ('meta-llama/llama-3.3-70b-instruct', 'gpqa_diamond', 'science', 44.4, 44.4, 'our_benchmark', NULL, '2026-03-04T00:00:00Z');
