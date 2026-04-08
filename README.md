# ArcRouter

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![API Status](https://img.shields.io/badge/API-Live-brightgreen)](https://api.arcrouter.com/health)
[![Cloudflare Workers](https://img.shields.io/badge/Runtime-Cloudflare_Workers-orange)](https://workers.cloudflare.com/)
[![Next.js 16](https://img.shields.io/badge/Frontend-Next.js_16-black)](https://nextjs.org/)

**The benchmark-verified LLM router.** Route any prompt to the best AI model — up to 90% cheaper than premium models — based on real benchmark data from HuggingFace, LiveBench, and LiveCodeBench.

Instead of guessing which model to use, ArcRouter automatically picks the right one:
- **Topic detection** across 24 granular categories (code/frontend, math/calculus, science/physics, etc.)
- **Real benchmark scores** from 3 sources, updated daily
- **Value optimization** (quality ÷ cost) — not just the cheapest or the best, but the best value
- **Semantic routing** with embedding-based reranking for nuanced topic matching

---

## Why ArcRouter?

| Feature | OpenRouter | ArcRouter |
|---------|-----------|---------------|
| **Model selection** | Manual by user | Automatic by benchmark score |
| **Cost optimization** | None | Value score (quality ÷ price) |
| **Per-topic routing** | No | 24 granular categories |
| **Semantic routing** | No | Embedding-based reranking |
| **Benchmark data** | No | HuggingFace + LiveBench + LiveCodeBench |
| **Failover** | No | 3-model circuit breaker chain |
| **Streaming** | Yes | Yes — full SSE, OpenAI SDK compatible |
| **Micropayments** | No | x402 pay-per-query (USDC on Base) — agent-to-agent ready |
| **Council mode** | No | Multi-model consensus verification |

---

## Quick Start

### Drop-in OpenAI Replacement

```bash
https://api.arcrouter.com/v1
```

### cURL

```bash
curl https://api.arcrouter.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "arc-router-v1",
    "messages": [{"role": "user", "content": "Explain GPQA Diamond benchmark"}],
    "budget": "auto",
    "mode": "default"
  }'
```

### Python

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.arcrouter.com/v1",
    api_key="sk_your_key"  # Optional for free tier
)

# Smart routing (default) — auto-selects best model for topic
response = client.chat.completions.create(
    model="arc-router-v1",
    messages=[{"role": "user", "content": "Debug this React useState hook"}]
)
print(response.choices[0].message.content)

# Council mode — multi-model consensus
council = client.chat.completions.create(
    model="arc-router-v1",
    messages=[{"role": "user", "content": "Review this NDA for liability caps"}],
    extra_body={"mode": "council", "budget": "economy"}
)
```

### TypeScript (ArcRouter SDK)

```bash
npm install arcrouter
```

```typescript
import { ArcRouter } from 'arcrouter';

const arc = new ArcRouter({ apiKey: 'sk_...' });

// Smart routing — picks the best model for your prompt
const res = await arc.chat('Calculate the p-value for chi-squared test');
console.log(res.content);
console.log(res.routing.model);           // e.g. "anthropic/claude-sonnet-4-5"
console.log(res.routing.estimatedCostUsd); // e.g. 0.0008

// Council mode — multi-model consensus
const council = await arc.council('Is P = NP?');
console.log(council.content, council.confidence);

// Streaming
for await (const chunk of arc.stream('Write a story...')) {
  process.stdout.write(chunk);
}

// x402 micropayments — no API key needed
import { privateKeyToAccount } from 'viem/accounts';
const arc402 = new ArcRouter({
  wallet: privateKeyToAccount('0x...'),
});
const paid = await arc402.chat('Complex query', { budget: 'premium' });
```

### TypeScript (OpenAI SDK drop-in)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.arcrouter.com/v1",
  apiKey: process.env.ARC_API_KEY || "",
});

const completion = await client.chat.completions.create({
  model: "arc-router-v1",
  messages: [{ role: "user", content: "Calculate the p-value for chi-squared test" }],
});

console.log(completion.choices[0].message);
```

---

## How It Works

```
User prompt
  │
  ▼
Topic Detection (regex + semantic, <5ms)
  │  Topic: code/security, Confidence: 0.92
  ▼
Benchmark DB Query (D1, <5ms)
  │  Top 3 models by value_score for this topic + budget
  ▼
Semantic Reranking (Workers AI embedding, ~200ms)
  │  Cosine similarity between query and model reference embeddings
  ▼
Circuit Breaker Check (KV, <1ms)
  │  Skip models with recent failures
  ▼
Stream Response (OpenRouter)
  │  Auto-failover to next model on error (up to 3 attempts)
  ▼
Response + Routing Metadata
```

**Two modes:**
- **Default (smart routing):** Best single model per topic. Fast, cheap.
- **Council:** Query 3-7 models, return consensus answer with confidence score. Use for high-stakes queries.

---

## Cost Savings

**Example:** "Explain quantum entanglement in 200 words"

| Provider | Model | Cost | Quality |
|----------|-------|------|---------|
| OpenAI | GPT-5 | $0.0075 | Excellent |
| Anthropic | Sonnet 4.5 | $0.0090 | Excellent |
| **ArcRouter** | **DeepSeek V3.2** (auto) | **$0.0008** | Very Good |

**89% cheaper** than premium models. Same topic, benchmark-verified quality.

---

## API Reference

### `POST /v1/chat/completions`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `messages` | array | required | OpenAI-format messages |
| `model` | string | `"arc-router-v1"` | Model alias (`"claude"`, `"gpt"`, `"gemini"`, `"deepseek"`, `"free"`) or specific model ID |
| `mode` | string | `"default"` | `"default"` (smart route) or `"council"` (consensus) |
| `budget` | string | `"auto"` | `"free"` / `"economy"` / `"auto"` / `"premium"` (legacy: low/medium/high) |
| `stream` | boolean | `false` | SSE streaming |
| `session_id` | string | — | Pin model selection across requests (1h TTL) |
| `exclude_models` | string[] | — | Model IDs to exclude from selection |
| `max_cost` | number | — | Max cost per request in USD (graceful downgrade) |
| `workflow_budget` | object | — | `{ session_id, total_budget_usd }` for multi-step workflows |

**Request headers:**

| Header | Description |
|--------|-------------|
| `X-Agent-Step` | Agent workflow hint: `simple-action`, `reasoning`, `code-generation`, `verification` |

**Response headers (default mode):**
`X-ArcRouter-Model`, `X-ArcRouter-Topic`, `X-ArcRouter-Budget`, `X-ArcRouter-Confidence`, `X-ArcRouter-Failover-Count`, `X-ArcRouter-Budget-Remaining`, `X-ArcRouter-Budget-Used-Pct`, `X-Compression-Ratio`, `X-Compression-Saved`

### `GET /v1/models/scores`

Public endpoint. Returns all 345+ models with benchmark scores across 6 domains. No auth required.

### `GET /v1/usage`

Per-API-key usage stats. Returns daily request counts and costs over the last N days. Requires auth.

### `GET /v1/workflow/:session_id/usage`

Workflow budget tracking. Returns spend, models used, latency, and tier distribution for a workflow session.

### `GET /health`

Service health check. Shows provider status, direct provider availability, and x402 wallet configuration.

### MCP Server

ArcRouter exposes an MCP (Model Context Protocol) server at `/mcp` for AI coding assistants.

```bash
claude mcp add arcrouter --transport http https://api.arcrouter.com/mcp
```

Three tools: `arcrouter_chat`, `arcrouter_models`, `arcrouter_health`.

---

## Pricing

| Tier | Price | Rate Limit | Auth |
|------|-------|------------|------|
| **Free** | $0 | 20 req/hour | None |
| **Developer** | $0.002 / req | 1,000 req/hour | API Key (Stripe) |
| **x402** | $0.001–$0.005 / req | Unlimited | USDC on Base |
| **Team** | Custom | Unlimited | Contact us |

**x402 variable pricing:** SIMPLE $0.001, MEDIUM $0.002, COMPLEX $0.005, REASONING $0.008 — auto-detected from prompt.

**Budget controls cost sensitivity:**
- `"free"` — free models only ($0)
- `"economy"` — strongly prefer cheap models (alias: `"low"`)
- `"auto"` — balanced quality vs cost (default for paid users, alias: `"medium"`)
- `"premium"` — best quality, ignore cost (alias: `"high"`)

---

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   web/      │     │   api/          │────▶│  Direct Providers│
│ Next.js 16  │────▶│ Hono + CF       │     │  OpenAI, Anthropic│
│ Landing +   │     │ Workers         │     │  Google, DeepSeek │
│ Playground  │     │                 │     │  xAI              │
└─────────────┘     └────────┬────────┘     └──────────────────┘
                             │                       │
┌─────────────┐     ┌────────▼────────┐     ┌────────▼─────────┐
│   sdk/      │     │  Cloudflare D1  │     │  OpenRouter      │
│ arcrouter   │────▶│  - models       │     │  (fallback,      │
│ npm package │     │  - benchmarks   │     │   345+ models)   │
└─────────────┘     │  - composites   │     └──────────────────┘
                    │  - routing log  │
                    └─────────────────┘
```

| Component | Technology |
|-----------|-----------|
| Runtime | Cloudflare Workers (Hono) |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Embeddings | Workers AI (`@cf/baai/bge-base-en-v1.5`) |
| Frontend | Next.js 16 on Cloudflare Pages |
| Payments | Stripe (metered) + x402 (USDC on Base) |

---

## Data Sources

| Source | Domains | Update |
|--------|---------|--------|
| **HuggingFace LLM Leaderboard v2** | science, math, reasoning, general | Daily 6AM UTC |
| **LiveBench** | coding, math, reasoning, writing, general | Daily 6AM UTC |
| **LiveCodeBench** | coding | Daily 6AM UTC |
| **OpenRouter** | pricing + availability (345+ models) | Daily 6AM UTC |

**Scoring:** Weighted by source reliability → normalized 0-100 → value = quality ÷ (1 + cost × sensitivity) → ranked per domain.

---

## Production Features

- **Semantic routing** — Embedding-based reranking with Workers AI (free, 768-dim)
- **Complexity-aware routing** — SIMPLE/MEDIUM/COMPLEX/REASONING tiers, auto-detected from prompt
- **Direct provider access** — OpenAI, Anthropic, Google, DeepSeek, xAI direct API calls (no OpenRouter dependency)
- **Circuit breaker** — Auto-disable failing models, 3-model failover chain
- **Session pinning** — Pin model selection across multi-turn conversations (1h TTL)
- **Model aliases** — `"claude"`, `"gpt"`, `"gemini"`, `"deepseek"`, `"free"` resolve to best model
- **Agent workflow** — `X-Agent-Step` header for complexity override, workflow budget tracking with auto-downgrade
- **Prompt compression** — Lossless compression (dedup, whitespace, JSON compaction) for long conversations
- **Agentic detection** — Tool-use patterns detected, prefer tool-capable models
- **MCP server** — Model Context Protocol integration for AI coding assistants
- **TypeScript SDK** — `npm install arcrouter` with x402 auto-payment, streaming, workflow budgets
- **Route cache** — KV decision caching, ~4ms savings per hit
- **Streaming** — Full SSE with routing metadata in headers
- **Stripe billing** — Metered subscriptions with auto-downgrade on payment failure
- **x402 micropayments** — USDC on Base via Coinbase CDP facilitator, supports agent-to-agent payments
- **Per-key usage tracking** — `/v1/usage` endpoint with daily breakdowns
- **Daily cron** — Automated scraper pipeline + score recalculation

---

## Self-Hosted Deployment

```bash
git clone https://github.com/yourusername/ArcRouter.git
cd ArcRouter/api
pnpm install

# Create D1 database
pnpm wrangler d1 create score-db
# Update wrangler.jsonc with database_id

# Apply schema + seed
pnpm wrangler d1 execute score-db --local --file=src/db/schema.sql
pnpm wrangler d1 execute score-db --local --file=src/db/seed.sql

# Set secrets
pnpm wrangler secret put OPENROUTER_API_KEY
pnpm wrangler secret put ADMIN_TOKEN

# Deploy
pnpm run deploy
```

---

## Roadmap

- [x] Smart routing with benchmark scores
- [x] Semantic routing (embedding-based reranking)
- [x] Complexity-aware routing (SIMPLE/MEDIUM/COMPLEX/REASONING)
- [x] Council mode (multi-model consensus)
- [x] Circuit breaker + 3-model failover
- [x] Direct provider access (OpenAI, Anthropic, Google, DeepSeek, xAI)
- [x] TypeScript SDK with x402 auto-payment (`npm install arcrouter`)
- [x] MCP server integration
- [x] Agent workflow support (X-Agent-Step, workflow budgets)
- [x] Session model pinning + model aliases
- [x] Prompt compression
- [x] Per-key usage tracking
- [x] x402 micropayments (USDC on Base)
- [x] Stripe metered billing
- [x] Public rankings page
- [ ] Outcome-based learning (adjust scores from user feedback)
- [ ] ML classifier routing (ModernBERT)
- [ ] Python SDK

---

## License

MIT © 2026 ArcRouter

---

**Live API:** [consensus-api.janis-ellerbrock.workers.dev](https://api.arcrouter.com)
**Questions?** [janis.ellerbrock@gmail.com](mailto:janis.ellerbrock@gmail.com)
