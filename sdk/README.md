# @consensus-cloud/sdk

Official TypeScript SDK for ConsensusCloud - Multi-model consensus routing with x402 payment protocol.

## Installation

```bash
npm install @consensus-cloud/sdk
# or
pnpm add @consensus-cloud/sdk
```

## Quick Start

```typescript
import { ConsensusClient } from '@consensus-cloud/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0x...');

const client = new ConsensusClient({
  apiKey: 'your-api-key', // or use x402 payment
  account, // for x402 signature
});

const response = await client.chat.completions.create({
  messages: [{ role: 'user', content: 'What is 2+2?' }],
  budget: 'low', // 'low' | 'medium' | 'high'
});

console.log(response.choices[0].message.content);
console.log(`Consensus confidence: ${response.consensus.confidence}`);
```

## Features

- **OpenAI-Compatible API**: Drop-in replacement for OpenAI SDK
- **x402 Payment Protocol**: Crypto-native micropayments with EIP-712 signatures
- **Multi-Model Consensus**: Query multiple models and get verified responses
- **TypeScript First**: Full type safety and IntelliSense support

## API Reference

### `ConsensusClient`

#### Constructor Options

```typescript
interface ConsensusClientOptions {
  apiKey?: string;          // API key for authentication
  account?: Account;        // Viem account for x402 signatures
  baseURL?: string;         // API base URL (default: https://consensus-api.workers.dev)
}
```

#### Methods

##### `chat.completions.create()`

Create a chat completion with consensus routing.

```typescript
interface ConsensusRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>;
  budget?: 'low' | 'medium' | 'high';  // Cost/quality trade-off
  reliability?: 'fast' | 'standard' | 'strict';  // Speed/accuracy trade-off
}
```

**Response:**

```typescript
interface ConsensusResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant', content: string };
    finish_reason: string;
  }>;
  consensus: {
    confidence: number;  // 0-1, how confident the consensus is
    tier: string;        // Complexity tier used
    votes: Array<{
      model: string;
      answer: string;
      agrees: boolean;
    }>;
  };
}
```

## x402 Payment Flow

The SDK automatically handles x402 payment signatures:

1. If no API key is provided, the client requests a payment quote
2. Signs an EIP-712 message with your account
3. Includes the signature in subsequent requests
4. No credit card or manual payment required

```typescript
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = new ConsensusClient({ account });

// Automatically handles x402 signature
const response = await client.chat.completions.create({
  messages: [{ role: 'user', content: 'Hello world' }],
});
```

## Examples

### With API Key

```typescript
const client = new ConsensusClient({
  apiKey: process.env.CONSENSUS_API_KEY,
  baseURL: 'https://your-worker.workers.dev',
});
```

### With x402 (Crypto Payments)

```typescript
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const client = new ConsensusClient({ account });
```

### Budget Control

```typescript
// Low budget: Use free/cheap models
const cheapResponse = await client.chat.completions.create({
  messages: [{ role: 'user', content: 'Simple question' }],
  budget: 'low',
});

// High budget: Use premium models with Chairman
const premiumResponse = await client.chat.completions.create({
  messages: [{ role: 'user', content: 'Complex legal analysis' }],
  budget: 'high',
  reliability: 'strict',
});
```

## License

ISC

## Support

- **Documentation**: https://docs.consensuscloud.ai
- **GitHub**: https://github.com/consensuscloud/sdk
- **Issues**: https://github.com/consensuscloud/sdk/issues
