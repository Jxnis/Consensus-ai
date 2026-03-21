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

### TypeScript

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
// Routing metadata in response headers:
// X-ArcRouter-Model, X-ArcRouter-Topic, X-ArcRouter-Budget
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
| `model` | string | any | Ignored — routing is automatic |
| `mode` | string | `"default"` | `"default"` (smart route) or `"council"` (consensus) |
| `budget` | string | `"auto"` | `"free"` / `"economy"` / `"auto"` / `"premium"` (legacy: low/medium/high) |
| `stream` | boolean | `false` | SSE streaming |

**Response headers (default mode):**
`X-ArcRouter-Model`, `X-ArcRouter-Topic`, `X-ArcRouter-Budget`, `X-ArcRouter-Confidence`, `X-ArcRouter-Failover-Count`

### `GET /v1/models/scores`

Public endpoint. Returns all 345+ models with benchmark scores across 6 domains. No auth required.

### `GET /health`

Service health check.

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
│   web/      │     │   api/          │     │   OpenRouter     │
│ Next.js 16  │────▶│ Hono + CF       │────▶│   (345+ models)  │
│ Landing +   │     │ Workers         │     │                  │
│ Playground  │     │                 │     └──────────────────┘
└─────────────┘     └────────┬────────┘
                             │
                    ┌────────▼────────┐     ┌──────────────────┐
                    │  Cloudflare D1  │     │  Workers AI      │
                    │  - models       │     │  Embeddings      │
                    │  - benchmarks   │     │  (bge-base-en)   │
                    │  - composites   │     └──────────────────┘
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
- **Circuit breaker** — Auto-disable failing models, 3-model failover chain
- **Route cache** — KV decision caching, ~4ms savings per hit
- **Routing telemetry** — Per-model latency, success rate, D1 history log
- **Streaming** — Full SSE with routing metadata in headers
- **Stripe billing** — Metered subscriptions with auto-downgrade on payment failure
- **x402 micropayments** — USDC on Base via Coinbase CDP facilitator, supports agent-to-agent payments
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
- [x] Council mode (multi-model consensus)
- [x] Circuit breaker + 3-model failover
- [x] x402 micropayments (USDC on Base)
- [x] Stripe metered billing
- [x] Public rankings page
- [ ] Direct provider integration (DeepSeek, Mistral)
- [ ] Outcome-based learning (adjust scores from user feedback)
- [ ] ML classifier routing (ModernBERT)
- [ ] MCP tool server integration

---

## License

MIT © 2026 ArcRouter

---

**Live API:** [consensus-api.janis-ellerbrock.workers.dev](https://api.arcrouter.com)
**Questions?** [janis.ellerbrock@gmail.com](mailto:janis.ellerbrock@gmail.com)
