'use client';

import { Code2, Zap, BookOpen, ArrowRight, Mail, Copy, Check, Key, Shield } from 'lucide-react';
import { useState } from 'react';

export default function DocsPage() {
  const [copied, setCopied] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://consensus-api.workers.dev';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`${apiUrl}/v1/chat/completions`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#2835f8] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-gray-900">ConsensusCloud</span>
          </a>
          <a
            href="/#pricing"
            className="px-4 py-2 bg-[#2835f8] text-white rounded-lg font-semibold hover:bg-[#222eda] transition-colors text-sm"
          >
            Get Access
          </a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        {/* Hero */}
        <section className="mb-16">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Documentation
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl">
            Get started with ConsensusCloud in minutes. Multi-model consensus routing that's OpenAI-compatible.
          </p>
        </section>

        {/* API URL Copy Block */}
        <div className="mb-16 bg-gradient-to-r from-[#2835f8] to-[#4f5cfa] rounded-2xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">🚀 Your API Endpoint</h2>
          <p className="mb-4 text-white/80">
            Drop-in replacement for OpenAI. Just change your baseURL:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 bg-black/20 backdrop-blur-sm rounded-lg p-4 font-mono text-sm break-all">
              {apiUrl}/v1/chat/completions
            </div>
            <button
              onClick={copyToClipboard}
              className="px-6 py-4 bg-white text-[#2835f8] rounded-lg font-bold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Copy URL
                </>
              )}
            </button>
          </div>
        </div>

        {/* Quick Start Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          <div className="group p-6 bg-white rounded-xl border-2 border-gray-100 hover:border-[#2835f8]/50 transition-all duration-300 hover:shadow-xl">
            <Zap className="w-10 h-10 text-[#2835f8] mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Quick Start</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Get up and running in under 2 minutes with the OpenAI SDK
            </p>
            <a href="#quick-start" className="flex items-center text-[#2835f8] font-semibold text-sm group-hover:translate-x-2 transition-transform">
              Start building <ArrowRight className="ml-2 w-4 h-4" />
            </a>
          </div>

          <div className="group p-6 bg-white rounded-xl border-2 border-gray-100 hover:border-[#2835f8]/50 transition-all duration-300 hover:shadow-xl">
            <Code2 className="w-10 h-10 text-[#2835f8] mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">API Reference</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Complete OpenAI-compatible API documentation
            </p>
            <a href="#api-reference" className="flex items-center text-[#2835f8] font-semibold text-sm group-hover:translate-x-2 transition-transform">
              View API docs <ArrowRight className="ml-2 w-4 h-4" />
            </a>
          </div>

          <div className="group p-6 bg-white rounded-xl border-2 border-gray-100 hover:border-[#2835f8]/50 transition-all duration-300 hover:shadow-xl">
            <Key className="w-10 h-10 text-[#2835f8] mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Authentication</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Free tier, API keys, and x402 micropayments
            </p>
            <a href="#authentication" className="flex items-center text-[#2835f8] font-semibold text-sm group-hover:translate-x-2 transition-transform">
              Learn more <ArrowRight className="ml-2 w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Authentication Section */}
        <section id="authentication" className="mb-16 scroll-mt-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">🔐 Authentication</h2>
          
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <p className="text-gray-600 mb-6">
              ConsensusCloud supports three tiers of access:
            </p>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <h4 className="font-bold text-emerald-900 mb-2">Free Tier</h4>
                <p className="text-sm text-emerald-700 mb-2">No API key needed</p>
                <ul className="text-xs text-emerald-600 space-y-1">
                  <li>• Free models only</li>
                  <li>• 20 requests/hour (IP rate-limited)</li>
                  <li>• Great for testing</li>
                </ul>
              </div>
              
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <h4 className="font-bold text-blue-900 mb-2">API Key</h4>
                <p className="text-sm text-blue-700 mb-2">Bearer token auth</p>
                <ul className="text-xs text-blue-600 space-y-1">
                  <li>• All budget tiers</li>
                  <li>• 1,000 requests/hour</li>
                  <li>• Metered billing</li>
                </ul>
              </div>
              
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                <h4 className="font-bold text-purple-900 mb-2">x402 (Coming Soon)</h4>
                <p className="text-sm text-purple-700 mb-2">Pay per request with USDC</p>
                <ul className="text-xs text-purple-600 space-y-1">
                  <li>• No signup needed</li>
                  <li>• AI agent native</li>
                  <li>• USDC on Base</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <pre className="text-gray-300 font-mono text-xs sm:text-sm">
{`# Free tier (no auth)
curl ${apiUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "Hello"}]}'

# With API key
curl ${apiUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_api_key" \\
  -d '{"messages": [{"role": "user", "content": "Hello"}], "budget": "medium"}'`}
            </pre>
          </div>
        </section>

        {/* Quick Start Section */}
        <section id="quick-start" className="mb-16 scroll-mt-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">🚀 Quick Start</h2>
          
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Use the OpenAI SDK</h3>
            <p className="text-gray-600 mb-4 text-sm">
              ConsensusCloud is fully OpenAI-compatible. Just change the baseURL — your existing code works instantly.
            </p>
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-gray-300 font-mono text-xs sm:text-sm">
{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiUrl}/v1",
  apiKey: "sk_your_api_key"  // Optional for free tier
});

const response = await client.chat.completions.create({
  model: "consensus-v1",
  messages: [
    { role: "user", content: "What is quantum computing?" }
  ]
});

console.log(response.choices[0].message.content);

// Extended consensus metadata (cast to access)
const consensus = (response as any).consensus;
console.log(\`Confidence: \${consensus.confidence}\`);
console.log(\`Models used: \${consensus.votes.length}\`);`}
              </pre>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Budget Tiers</h3>
            <p className="text-gray-600 mb-4 text-sm">
              Control cost vs accuracy by passing a <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">budget</code> parameter:
            </p>
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-gray-300 font-mono text-xs sm:text-sm">
{`// Low budget — 3 cheap models, fastest
const fast = await client.chat.completions.create({
  model: "consensus-v1",
  messages: [{ role: "user", content: "..." }],
  // @ts-ignore — extended parameter
  budget: "low"
});

// Medium budget — 5 models including smart tier
const accurate = await client.chat.completions.create({
  model: "consensus-v1",
  messages: [{ role: "user", content: "..." }],
  budget: "medium"
});`}
              </pre>
            </div>
          </div>
        </section>

        {/* API Reference */}
        <section id="api-reference" className="mb-16 scroll-mt-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">📖 API Reference</h2>
          
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">POST /v1/chat/completions</h3>
            
            <div className="mb-6">
              <h4 className="font-bold text-gray-700 mb-3">Request Body:</h4>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-3">
                <div>
                  <code className="bg-gray-200 px-2 py-1 rounded font-mono text-sm">messages</code>
                  <span className="text-red-500 text-xs ml-1">required</span>
                  <span className="text-gray-600 ml-2">— Array of chat messages</span>
                </div>
                <div>
                  <code className="bg-gray-200 px-2 py-1 rounded font-mono text-sm">budget</code>
                  <span className="text-gray-400 text-xs ml-1">optional</span>
                  <span className="text-gray-600 ml-2">— &apos;free&apos; | &apos;low&apos; | &apos;medium&apos; | &apos;high&apos; (default: &apos;low&apos;)</span>
                </div>
                <div>
                  <code className="bg-gray-200 px-2 py-1 rounded font-mono text-sm">reliability</code>
                  <span className="text-gray-400 text-xs ml-1">optional</span>
                  <span className="text-gray-600 ml-2">— &apos;standard&apos; | &apos;high&apos; (default: &apos;standard&apos;)</span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="font-bold text-gray-700 mb-3">Response:</h4>
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-gray-300 font-mono text-xs">
{`{
  "id": "cons-1707665230123",
  "object": "chat.completion",
  "model": "consensus-v1",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "..."
    },
    "finish_reason": "stop"
  }],
  "consensus": {
    "confidence": 0.98,
    "tier": "SIMPLE",
    "budget": "low",
    "votes": [
      {
        "model": "Llama 3.1 8B",
        "answer": "...",
        "agrees": true
      }
    ]
  }
}`}
                </pre>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h4 className="font-bold text-blue-900 mb-2">OpenAI Compatible</h4>
              <p className="text-blue-800 text-sm">
                ConsensusCloud is a drop-in replacement for OpenAI&apos;s API. The <code className="bg-blue-100 px-1 rounded">consensus</code> field is an extension — the standard <code className="bg-blue-100 px-1 rounded">choices</code> format works exactly like OpenAI.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">💰 Pricing</h2>
          
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Free</h3>
              <div className="text-3xl font-black text-gray-900 mb-4">$0<span className="text-base text-gray-500"> forever</span></div>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li>✓ 3 free-tier models</li>
                <li>✓ 20 requests/hour</li>
                <li>✓ No signup needed</li>
              </ul>
            </div>

            <div className="bg-[#2835f8]/5 rounded-xl border-2 border-[#2835f8] p-6 relative">
              <div className="absolute top-0 right-0 bg-[#2835f8] text-white text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-xl">
                RECOMMENDED
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Developer</h3>
              <div className="text-3xl font-black text-gray-900 mb-4">$0.002<span className="text-base text-[#2835f8]">/req</span></div>
              <ul className="space-y-2 text-gray-700 text-sm">
                <li>✓ 3-5 smart models</li>
                <li>✓ 1,000 requests/hour</li>
                <li>✓ API key + x402</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Enterprise</h3>
              <div className="text-3xl font-black text-gray-900 mb-4">Custom</div>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li>✓ Custom model selection</li>
                <li>✓ Audit trail + SLA</li>
                <li>✓ Self-hosted option</li>
              </ul>
            </div>
          </div>

          <div className="bg-gray-100 rounded-xl p-6 text-center">
            <p className="text-gray-700 mb-4">
              Pay only for what you use. No subscriptions, no hidden fees.
            </p>
            <a
              href="mailto:access@consensuscloud.ai"
              className="inline-flex items-center gap-2 px-8 py-3 bg-[#2835f8] text-white rounded-lg font-bold hover:bg-[#222eda] transition-colors"
            >
              <Mail className="w-5 h-5" />
              Get API Access
            </a>
          </div>
        </section>

        {/* Support */}
        <section className="bg-gradient-to-r from-[#2835f8] to-[#4f5cfa] rounded-2xl p-8 sm:p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
          <p className="text-lg mb-8 opacity-90">
            Our team is here to help you get started
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="mailto:support@consensuscloud.ai"
              className="px-8 py-4 bg-white text-[#2835f8] rounded-full font-bold hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Mail className="w-5 h-5" />
              Contact Support
            </a>
            <a 
              href="/"
              className="px-8 py-4 bg-transparent border-2 border-white text-white rounded-full font-bold hover:bg-white/10 transition-colors inline-flex items-center justify-center gap-2"
            >
              Back to Home
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
