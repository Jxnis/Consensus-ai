# ConsensusCloud

ConsensusCloud is a high-accuracy, cost-optimized LLM router that uses a "Council of Models" to verify answers in real-time. It provides GPT-4 level reliability using a mixture of smaller, faster models (Llama-3, Gemini Flash, Claude Haiku).

## 🚀 Structure

- `api/`: Cloudflare Workers + Hono API (The Consensus Engine).
- `sdk/`: TypeScript SDK for integrating Consensus into any app with automated x402 payment handling.
- `web/`: Next.js 15 Landing Page & Playground.

## 🛠 Features

- **Dynamic Council Selection**: Automatically picks the best models based on prompt complexity.
- **Racing Algorithm**: Fires parallel requests to multiple providers and stops as soon as consensus is reached.
- **Semantic Overlap**: Uses character-level and word-level similarity to detect "Agreement Groups".
- **x402 Integrated**: Native support for crypto-economic micropayments via EIP-712 signatures.
- **Edge Cache**: Sub-millisecond prompt caching using Cloudflare KV.

## 📦 Getting Started

### API
```bash
cd api
pnpm install
pnpm run dev # Local dev
pnpm run deploy # Deploy to Cloudflare
```

### Web
```bash
cd web
pnpm install
pnpm run dev
```

## 📜 License
MIT
