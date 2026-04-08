# arcrouter

Official TypeScript SDK for [ArcRouter](https://arcrouter.com) — intelligent LLM routing with multi-model consensus.

## Installation

```bash
npm install arcrouter
```

## Quick Start

```typescript
import { ArcRouter } from 'arcrouter';

const arc = new ArcRouter({ apiKey: 'sk_...' });

// Smart routing — picks the best model for your prompt
const res = await arc.chat('Write a Python function to merge two sorted lists');
console.log(res.content);
console.log(res.routing.model);           // e.g. "anthropic/claude-sonnet-4-5"
console.log(res.routing.estimatedCostUsd); // e.g. 0.0012
```

## Features

- **Smart Routing** — routes each prompt to the best model by topic, complexity, and budget
- **Council Mode** — multi-model consensus for higher confidence answers
- **Streaming** — async generator for real-time text output
- **Workflow Budgets** — cap spend across multi-step agent workflows
- **x402 Micropayments** — automatic USDC payments on Base (no API key needed)
- **Auto Retry** — exponential backoff on 5xx errors
- **OpenAI Drop-In** — `arc.openai()` returns a standard OpenAI client pointed at ArcRouter
- **Full TypeScript** — complete types for all responses and options

## API

### `arc.chat(prompt, options?)`

Route to the best single model. Fast, cheap, smart.

```typescript
const res = await arc.chat('Explain quantum entanglement', {
  budget: 'premium',           // 'free' | 'economy' | 'auto' | 'premium'
  agentStep: 'reasoning',      // hints complexity to the router
  maxCost: 0.01,               // USD cap per request
  excludeModels: ['deepseek/deepseek-r1'],
  sessionId: 'session-123',    // model pinning across turns
});

console.log(res.content);       // The answer
console.log(res.routing.model); // Which model was chosen
console.log(res.routing.topic); // Detected topic (e.g. "science/physics")
```

### `arc.council(prompt, options?)`

Multi-model consensus. 3-7 models vote, majority wins.

```typescript
const res = await arc.council('Is P = NP?');
console.log(res.content);      // Consensus answer
console.log(res.confidence);   // 0-1
console.log(res.votes);        // Individual model answers
console.log(res.synthesized);  // true if chairman had to resolve disagreement
```

### `arc.stream(prompt, options?)`

Async generator for streaming responses.

```typescript
for await (const chunk of arc.stream('Write a story about...')) {
  process.stdout.write(chunk);
}
```

### `arc.models(options?)`

List available models with benchmark scores and pricing.

```typescript
const models = await arc.models({ topic: 'code', budget: 'auto' });
models.forEach(m => console.log(`${m.name}: $${m.inputPricePer1M}/1M tokens`));
```

### `arc.usage(options?)`

Get your API key's usage history.

```typescript
const stats = await arc.usage({ days: 30 });
console.log(`${stats.totalRequests} requests, $${stats.totalCostUsd} total`);
```

### `arc.workflow(options)`

Create a multi-step workflow with shared budget tracking.

```typescript
const wf = arc.workflow({
  sessionId: 'agent-run-42',
  totalBudget: 5.00,  // USD
});

const plan = await wf.chat('Plan the implementation', { agentStep: 'planning' });
const code = await wf.chat('Write the code', { agentStep: 'code-generation' });
const review = await wf.chat('Review for bugs', { agentStep: 'verification' });

const usage = await wf.getUsage();
console.log(`Spent $${usage.total_spent_usd} of $${usage.total_budget_usd}`);
```

### `arc.openai()`

Drop-in OpenAI client — zero-code migration.

```typescript
const client = arc.openai();
const completion = await client.chat.completions.create({
  model: 'gpt',  // alias — ArcRouter resolves to best GPT model
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## Agent Step Headers

When building agent frameworks, use `agentStep` to tell the router what kind of work each step does:

| Step | Maps to | Use for |
|------|---------|---------|
| `simple-action` | SIMPLE | Formatting, extraction, simple lookups |
| `code-generation` | COMPLEX + code topic | Writing code |
| `reasoning` | REASONING | Analysis, planning, complex decisions |
| `verification` | Council mode | Cross-checking, validation |

### x402 Micropayments

Pay per request with USDC on Base — no API key needed. The SDK automatically handles 402 responses, signs an on-chain payment authorization, and retries.

```bash
npm install arcrouter viem @x402/core @x402/evm
```

```typescript
import { ArcRouter } from 'arcrouter';
import { privateKeyToAccount } from 'viem/accounts';

const arc = new ArcRouter({
  wallet: privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`),
  budget: 'auto', // x402 pricing: $0.001 simple, $0.002 medium, $0.005 complex
});

const res = await arc.chat('Explain quantum computing');
// Payment signed and sent automatically — no API key required
```

Pricing varies by prompt complexity:
| Complexity | Price |
|-----------|-------|
| SIMPLE | $0.001 |
| MEDIUM | $0.002 |
| COMPLEX | $0.005 |
| REASONING | $0.008 |

### Auto Retry

The SDK automatically retries on 5xx errors with exponential backoff (default: 2 retries).

```typescript
const arc = new ArcRouter({
  apiKey: 'sk_...',
  maxRetries: 3, // default: 2
});
```

## License

MIT

## Links

- **Docs:** https://arcrouter.com/docs
- **API:** https://api.arcrouter.com
- **GitHub:** https://github.com/ArcRouterAI/arcrouter-sdk
