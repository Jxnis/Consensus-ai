"use client";

import { useState } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import ArcLogo from "@/components/ArcLogo";
import { ArrowRight, Check, Copy, Menu, X } from "lucide-react";
import { motion } from "motion/react";

const sections = [
  { id: "introduction", title: "Introduction" },
  { id: "quickstart", title: "Quickstart" },
  { id: "authentication", title: "Authentication" },
  { id: "api-reference", title: "API Reference" },
  { id: "request-params", title: "Request Parameters" },
  { id: "response-format", title: "Response Format" },
  { id: "streaming", title: "Streaming" },
  { id: "agent-workflow", title: "Agent Workflow" },
  { id: "models-scores", title: "Models & Scores" },
  { id: "pricing", title: "Pricing & Limits" },
  { id: "sdks", title: "SDKs" },
  { id: "mcp", title: "MCP Server" },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("introduction");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const apiUrl = "https://api.arcrouter.com/v1";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setActiveSection(id);
      setMobileMenuOpen(false);
    }
  };

  return (
    <ThemeProvider>
      <div className="bg-background min-h-screen flex selection:bg-foreground selection:text-background">
        {/* Sidebar (Desktop) */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-border fixed h-screen top-0 left-0 bg-background/95 backdrop-blur-sm z-30">
          <div className="p-6 border-b border-border">
            <a href="/" className="flex items-center gap-3 group">
              <ArcLogo className="w-6 h-6 text-foreground transition-transform duration-500 group-hover:rotate-180" />
              <span className="font-heading font-bold text-lg tracking-tight text-foreground">ArcRouter</span>
            </a>
          </div>
          <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollTo(section.id)}
                className={`w-full text-left px-4 py-2 rounded-lg font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  activeSection === section.id
                    ? "bg-foreground/5 text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
          <div className="p-6 border-t border-border">
            <a
              href="/"
              className="flex items-center justify-between text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to Home <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </aside>

        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 w-full z-40 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <ArcLogo className="w-5 h-5 text-foreground" />
              <span className="font-heading font-bold text-sm text-foreground">ArcRouter</span>
            </a>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 z-30 bg-background pt-20 px-6 space-y-4">
                {sections.map(section => (
                    <button
                        key={section.id}
                        onClick={() => scrollTo(section.id)}
                        className="block w-full text-left py-3 border-b border-border font-mono text-sm text-foreground"
                    >
                        {section.title}
                    </button>
                ))}
            </div>
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 w-full">
          <div className="max-w-4xl mx-auto px-6 py-24 lg:px-12 lg:py-16 space-y-24">
            
            {/* Introduction */}
            <section id="introduction" className="space-y-6">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] block">Documentation</span>
              <h1 className="font-heading text-4xl lg:text-5xl text-foreground tracking-tight">ArcRouter Docs</h1>
              <p className="text-muted-foreground leading-relaxed max-w-2xl text-lg">
                Benchmark-verified LLM router with 345+ models. Automatically route any prompt to the best AI model based on real benchmark scores from HuggingFace, LiveBench, and LiveCodeBench. Two modes: smart routing (default) selects the best single model per topic, or council mode queries 3-7 models for consensus verification. OpenAI-compatible — drop in with any SDK.
              </p>
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => scrollTo("quickstart")}
                  className="px-6 py-3 bg-foreground text-background font-mono text-xs uppercase tracking-wider rounded-lg hover:opacity-90 transition-opacity"
                >
                  Start Building
                </button>
                <a 
                  href="https://github.com/arcrouter"
                  className="px-6 py-3 border border-border text-foreground font-mono text-xs uppercase tracking-wider rounded-lg hover:bg-foreground/5 transition-colors"
                >
                    View on GitHub
                </a>
              </div>
            </section>

            {/* Quickstart */}
            <section id="quickstart" className="space-y-8 scroll-mt-24">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-4">Quickstart</h2>
                <p className="text-muted-foreground">Replace your existing OpenAI `baseURL` with ours. That's it.</p>
              </div>

              <div className="bg-[#0a0a0b] border border-white/10 rounded-xl overflow-hidden shadow-sm">
                 <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                    <span className="font-mono text-[10px] text-zinc-500 uppercase">Endpoint URL</span>
                    <button 
                         onClick={copyToClipboard} 
                         className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
                     >
                         {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                         {copied ? "Copied" : "Copy"}
                     </button>
                 </div>
                 <div className="p-4 font-mono text-sm text-zinc-300 break-all select-all">
                     {apiUrl}
                 </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide">Using OpenAI Node.js SDK</h3>
                <div className="bg-[#0a0a0b] p-6 rounded-xl border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiUrl}",
  apiKey: "sk_your_api_key", // Optional for free tier
});

// Smart routing (default) — routes to best model for the topic
const response = await client.chat.completions.create({
  model: "arc-router-v1",
  messages: [{ role: "user", content: "Explain quantum supremacy." }],
});

console.log(response.choices[0].message.content);

// Council mode — multi-model consensus verification
const council = await client.chat.completions.create({
  model: "arc-router-v1",
  messages: [{ role: "user", content: "Is P=NP?" }],
  mode: "council",     // Query 3-7 models
  budget: "economy",   // "free" | "economy" | "auto" | "premium"
} as any);

console.log(council.consensus); // { confidence, votes, ... }`}
</pre>
                </div>
              </div>
            </section>

            {/* Authentication */}
            <section id="authentication" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">Authentication</h2>
                   <p className="text-muted-foreground">We support three tiers of authentication.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    <div className="p-6 border border-border rounded-xl bg-card">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                            <span className="text-emerald-500 text-xs font-bold">01</span>
                        </div>
                        <h3 className="font-heading text-lg mb-2">Free Tier</h3>
                        <p className="text-sm text-muted-foreground mb-4">No API key required. Free models only, 20 req/hour.</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded">No Header</code>
                    </div>

                    <div className="p-6 border border-border rounded-xl bg-card">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                            <span className="text-blue-500 text-xs font-bold">02</span>
                        </div>
                        <h3 className="font-heading text-lg mb-2">API Key</h3>
                        <p className="text-sm text-muted-foreground mb-4">Stripe metered billing. $0.002/request. 1,000 req/hour.</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded">Authorization: Bearer sk_...</code>
                    </div>

                    <div className="p-6 border border-border rounded-xl bg-card">
                        <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center mb-4">
                            <span className="text-violet-500 text-xs font-bold">03</span>
                        </div>
                        <h3 className="font-heading text-lg mb-2">x402 (USDC)</h3>
                        <p className="text-sm text-muted-foreground mb-4">Pay per request with USDC on Base. Variable pricing by complexity. Ideal for agent-to-agent payments — no account needed.</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded">X-PAYMENT header (auto)</code>
                    </div>
                </div>
            </section>

            {/* API Reference */}
            <section id="api-reference" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">API Reference</h2>
                   <p className="text-muted-foreground">
                     ArcRouter exposes an OpenAI-compatible API. Two modes are available: smart routing (default) selects the best single model based on benchmark scores, and council mode queries multiple models for consensus verification.
                   </p>
                </div>

                <div className="space-y-6">
                  <div className="border border-border rounded-xl p-6 bg-card">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-mono font-bold rounded uppercase">POST</span>
                      <code className="text-sm text-foreground font-mono">/v1/chat/completions</code>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Main inference endpoint. Accepts OpenAI-compatible request bodies with additional routing parameters.
                    </p>
                    <div className="bg-[#0a0a0b] p-4 rounded-lg border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`curl -X POST ${apiUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_your_key" \\
  -d '{
    "model": "arc-router-v1",
    "messages": [
      { "role": "user", "content": "Explain quantum computing" }
    ],
    "budget": "low",
    "mode": "default",
    "stream": false
  }'`}
</pre>
                    </div>
                  </div>

                  <div className="border border-border rounded-xl p-6 bg-card">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-mono font-bold rounded uppercase">GET</span>
                      <code className="text-sm text-foreground font-mono">/v1/models/scores</code>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Public endpoint. Returns all models with their benchmark scores across domains. No authentication required.
                    </p>
                  </div>

                  <div className="border border-border rounded-xl p-6 bg-card">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-mono font-bold rounded uppercase">GET</span>
                      <code className="text-sm text-foreground font-mono">/v1/usage</code>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Per-API-key usage statistics. Returns daily request counts and estimated costs. Requires authentication.
                    </p>
                  </div>

                  <div className="border border-border rounded-xl p-6 bg-card">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-mono font-bold rounded uppercase">GET</span>
                      <code className="text-sm text-foreground font-mono">{`/v1/workflow/{session_id}/usage`}</code>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Workflow budget tracking. Returns total spend, models used, average latency, and tier distribution for a workflow session.
                    </p>
                  </div>

                  <div className="border border-border rounded-xl p-6 bg-card">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-mono font-bold rounded uppercase">GET</span>
                      <code className="text-sm text-foreground font-mono">/health</code>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Health check. Returns provider status, direct provider availability, and x402 wallet configuration.
                    </p>
                  </div>
                </div>
            </section>

            {/* Request Parameters */}
            <section id="request-params" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">Request Parameters</h2>
                   <p className="text-muted-foreground">
                     Standard OpenAI fields are supported. ArcRouter adds <code className="text-xs bg-muted px-2 py-1 rounded">mode</code> and <code className="text-xs bg-muted px-2 py-1 rounded">budget</code> for routing control.
                   </p>
                </div>

                <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm font-mono">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                            <tr>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Parameter</th>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Type</th>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Default</th>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-xs">
                            <tr>
                                <td className="p-4 font-bold text-foreground">messages</td>
                                <td className="p-4 text-muted-foreground">array</td>
                                <td className="p-4 text-muted-foreground">required</td>
                                <td className="p-4 text-muted-foreground">OpenAI-format messages array</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">model</td>
                                <td className="p-4 text-muted-foreground">string</td>
                                <td className="p-4 text-muted-foreground">&quot;arc-router-v1&quot;</td>
                                <td className="p-4 text-muted-foreground">Model alias (&quot;claude&quot;, &quot;gpt&quot;, &quot;gemini&quot;, &quot;deepseek&quot;, &quot;free&quot;) or specific model ID. Default routes automatically.</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">mode</td>
                                <td className="p-4 text-muted-foreground">string</td>
                                <td className="p-4 text-muted-foreground">&quot;default&quot;</td>
                                <td className="p-4 text-muted-foreground"><strong>&quot;default&quot;</strong> — Smart routing to best single model. <strong>&quot;council&quot;</strong> — Multi-model consensus with confidence scoring.</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">budget</td>
                                <td className="p-4 text-muted-foreground">string</td>
                                <td className="p-4 text-muted-foreground">&quot;auto&quot;</td>
                                <td className="p-4 text-muted-foreground">&quot;free&quot; — free models only. &quot;economy&quot; — favor cheap models. &quot;auto&quot; — balanced (default). &quot;premium&quot; — best quality. Legacy aliases: low/medium/high still accepted.</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">stream</td>
                                <td className="p-4 text-muted-foreground">boolean</td>
                                <td className="p-4 text-muted-foreground">false</td>
                                <td className="p-4 text-muted-foreground">Enable SSE streaming. Works in both modes.</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">temperature</td>
                                <td className="p-4 text-muted-foreground">number</td>
                                <td className="p-4 text-muted-foreground">—</td>
                                <td className="p-4 text-muted-foreground">Passed through to the model provider.</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">max_tokens</td>
                                <td className="p-4 text-muted-foreground">number</td>
                                <td className="p-4 text-muted-foreground">—</td>
                                <td className="p-4 text-muted-foreground">Passed through to the model provider.</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">session_id</td>
                                <td className="p-4 text-muted-foreground">string</td>
                                <td className="p-4 text-muted-foreground">—</td>
                                <td className="p-4 text-muted-foreground">Pin model selection across requests. Same session_id reuses the same model for 1 hour.</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">exclude_models</td>
                                <td className="p-4 text-muted-foreground">string[]</td>
                                <td className="p-4 text-muted-foreground">—</td>
                                <td className="p-4 text-muted-foreground">Array of model IDs to exclude from selection.</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">max_cost</td>
                                <td className="p-4 text-muted-foreground">number</td>
                                <td className="p-4 text-muted-foreground">—</td>
                                <td className="p-4 text-muted-foreground">Max cost per request in USD. Models above this price are excluded (graceful downgrade).</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">workflow_budget</td>
                                <td className="p-4 text-muted-foreground">object</td>
                                <td className="p-4 text-muted-foreground">—</td>
                                <td className="p-4 text-muted-foreground">{`{ session_id, total_budget_usd }`} — Multi-step workflow with shared budget. Auto-downgrades at 60/80/95%.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Response Format */}
            <section id="response-format" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">Response Format</h2>
                   <p className="text-muted-foreground">
                     Responses follow the OpenAI schema with an additional <code className="text-xs bg-muted px-2 py-1 rounded">routing</code> or <code className="text-xs bg-muted px-2 py-1 rounded">consensus</code> object depending on the mode used.
                   </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">Default Mode Response</h3>
                    <div className="bg-[#0a0a0b] p-6 rounded-xl border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`{
  "id": "cons-1710...",
  "object": "chat.completion",
  "model": "arc-router-v1",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "..." },
    "finish_reason": "stop"
  }],
  "routing": {
    "mode": "default",
    "selected_model": "google/gemini-2.0-flash-001",
    "model_name": "Gemini 2.0 Flash",
    "provider": "Google",
    "call_path": "direct:google",
    "topic_detected": "science",
    "topic_confidence": 0.85,
    "complexity_tier": "MEDIUM",
    "complexity_confidence": 0.72,
    "budget": "auto",
    "data_source": "semantic",
    "failover_count": 0,
    "models_considered": 8,
    "is_agentic": false,
    "estimated_cost_usd": 0.0003,
    "savings_vs_gpt4_pct": 89
  }
}`}
</pre>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">Council Mode Response</h3>
                    <div className="bg-[#0a0a0b] p-6 rounded-xl border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`{
  "id": "cons-1710...",
  "object": "chat.completion",
  "model": "arc-router-v1",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "..." },
    "finish_reason": "stop"
  }],
  "consensus": {
    "confidence": 0.92,
    "tier": "MEDIUM",
    "votes": [
      { "model": "google/gemini-2.0-flash-001", "answer": "...", "agrees": true },
      { "model": "meta-llama/llama-3.3-70b", "answer": "...", "agrees": true },
      { "model": "qwen/qwen-2.5-72b", "answer": "...", "agrees": false }
    ],
    "budget": "free",
    "synthesized": false,
    "cached": false,
    "mode_used": "council",
    "degraded": false,
    "deliberation": {
      "triggered": false,
      "rounds": 1,
      "round1_groups": 2,
      "chairman_used": false
    }
  }
}`}
</pre>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">Response Headers (Default Mode)</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      In default (smart routing) mode, routing metadata is also returned via response headers:
                    </p>
                    <div className="border border-border rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm font-mono">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                          <tr>
                            <th className="p-4 uppercase tracking-wider text-[10px]">Header</th>
                            <th className="p-4 uppercase tracking-wider text-[10px]">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-xs">
                          <tr>
                            <td className="p-4 font-bold text-foreground">X-ArcRouter-Mode</td>
                            <td className="p-4 text-muted-foreground">Routing mode used (&quot;default&quot;)</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-foreground">X-ArcRouter-Model</td>
                            <td className="p-4 text-muted-foreground">Model ID selected by the router</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-foreground">X-ArcRouter-Topic</td>
                            <td className="p-4 text-muted-foreground">Detected topic domain (e.g. &quot;math&quot;, &quot;coding&quot;)</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-foreground">X-ArcRouter-Budget</td>
                            <td className="p-4 text-muted-foreground">Budget tier applied</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-foreground">X-ArcRouter-Confidence</td>
                            <td className="p-4 text-muted-foreground">Topic detection confidence (0-1)</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-foreground">X-ArcRouter-Failover-Count</td>
                            <td className="p-4 text-muted-foreground">Number of failover attempts before success</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
            </section>

            {/* Streaming */}
            <section id="streaming" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">Streaming</h2>
                   <p className="text-muted-foreground">
                     Set <code className="text-xs bg-muted px-2 py-1 rounded">stream: true</code> for Server-Sent Events (SSE). Both modes support streaming. The format is compatible with OpenAI SDKs.
                   </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">SSE Format</h3>
                    <div className="bg-[#0a0a0b] p-6 rounded-xl border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`data: {"id":"cons-...","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"cons-...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Quantum computing"},"finish_reason":null}]}

data: {"id":"cons-...","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}],"consensus":{...}}

data: [DONE]`}
</pre>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">
                      In council mode, consensus metadata (confidence, votes) is attached to the final <code className="text-xs bg-muted px-2 py-1 rounded">finish_reason: &quot;stop&quot;</code> chunk. In default mode, routing headers are sent with the initial response.
                    </p>
                  </div>
                </div>
            </section>

            {/* Agent Workflow */}
            <section id="agent-workflow" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">Agent Workflow</h2>
                   <p className="text-muted-foreground">
                     Build multi-step agent workflows with automatic budget tracking, complexity hints, and model pinning.
                   </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">X-Agent-Step Header</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Tell the router what kind of work each step does. This overrides automatic complexity scoring for better model selection.
                    </p>
                    <div className="border border-border rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm font-mono">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                          <tr>
                            <th className="p-4 uppercase tracking-wider text-[10px]">Step Value</th>
                            <th className="p-4 uppercase tracking-wider text-[10px]">Complexity</th>
                            <th className="p-4 uppercase tracking-wider text-[10px]">Use For</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-xs">
                          <tr>
                            <td className="p-4 font-bold text-foreground">simple-action</td>
                            <td className="p-4 text-muted-foreground">SIMPLE</td>
                            <td className="p-4 text-muted-foreground">Formatting, extraction, simple lookups</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-foreground">code-generation</td>
                            <td className="p-4 text-muted-foreground">COMPLEX + code topic</td>
                            <td className="p-4 text-muted-foreground">Writing code, debugging</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-foreground">reasoning</td>
                            <td className="p-4 text-muted-foreground">REASONING</td>
                            <td className="p-4 text-muted-foreground">Analysis, planning, complex decisions</td>
                          </tr>
                          <tr>
                            <td className="p-4 font-bold text-foreground">verification</td>
                            <td className="p-4 text-muted-foreground">Council mode</td>
                            <td className="p-4 text-muted-foreground">Cross-checking, validation</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">Workflow Budget</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Cap total spend across multi-step workflows. The router auto-downgrades budget tier as you approach limits.
                    </p>
                    <div className="bg-[#0a0a0b] p-6 rounded-xl border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`// First request: initialize workflow budget
curl ${apiUrl}/chat/completions \\
  -H "Authorization: Bearer sk_..." \\
  -H "X-Agent-Step: planning" \\
  -d '{
    "messages": [{"role": "user", "content": "Plan the implementation"}],
    "workflow_budget": {
      "session_id": "agent-run-42",
      "total_budget_usd": 5.00
    }
  }'

// Response headers:
// X-ArcRouter-Budget-Remaining: 4.998
// X-ArcRouter-Budget-Used-Pct: 0.04

// Check workflow usage:
curl ${apiUrl.replace('/v1', '')}/v1/workflow/agent-run-42/usage`}
</pre>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">
                      Auto-downgrade thresholds: 60% used → economy models, 80% → free models, 95% → strict free only, 100% → 402 error.
                    </p>
                  </div>
                </div>
            </section>

            {/* Models & Scores */}
            <section id="models-scores" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">Models & Scores</h2>
                   <p className="text-muted-foreground">
                     ArcRouter maintains a database of 345+ models with benchmark scores across 6 domains. Scores are refreshed daily from HuggingFace Open LLM Leaderboard, LiveBench, and LiveCodeBench.
                   </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">Score Domains</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {[
                        { domain: "math", desc: "GSM8K, MATH, competition mathematics" },
                        { domain: "code", desc: "LiveCodeBench, HumanEval, code generation" },
                        { domain: "reasoning", desc: "ARC, HellaSwag, logical reasoning" },
                        { domain: "science", desc: "GPQA, MMLU-Pro, scientific knowledge" },
                        { domain: "writing", desc: "Creative writing, professional content, editing" },
                        { domain: "general", desc: "General knowledge, translation, comprehension" },
                      ].map((item) => (
                        <div key={item.domain} className="p-4 border border-border rounded-lg bg-card">
                          <span className="font-mono text-xs font-bold text-foreground uppercase">{item.domain}</span>
                          <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">Routing Logic</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      In default mode, the router detects the prompt&apos;s topic, then selects the highest-scoring model within the requested budget tier. Semantic routing uses embedding similarity for nuanced topic matching. A circuit breaker skips models with recent failures, and up to 3 failover attempts are made automatically.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Browse all model scores on the <a href="/rankings" className="text-foreground underline underline-offset-4 hover:opacity-70 transition-opacity">rankings page</a>.
                    </p>
                  </div>
                </div>
            </section>

            {/* SDKs */}
            <section id="sdks" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">SDKs & Integrations</h2>
                   <p className="text-muted-foreground">
                     Use the official ArcRouter SDK for the best experience, or drop in with any OpenAI-compatible client.
                   </p>
                </div>

                <div className="space-y-6">
                  {/* ArcRouter SDK */}
                  <div className="border border-border rounded-xl p-6 bg-card">
                    <h3 className="font-heading text-lg mb-3 text-foreground">ArcRouter TypeScript SDK</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Official SDK with smart routing, council mode, streaming, workflow budgets, and x402 auto-payment.
                    </p>
                    <div className="bg-[#0a0a0b] p-4 rounded-lg border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`npm install arcrouter`}
</pre>
                    </div>
                    <div className="bg-[#0a0a0b] p-4 rounded-lg border border-white/10 overflow-x-auto mt-4">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`import { ArcRouter } from 'arcrouter';

const arc = new ArcRouter({ apiKey: 'sk_...' });

// Smart routing
const res = await arc.chat('Write a Python parser');
console.log(res.content);
console.log(res.routing.model);           // e.g. "anthropic/claude-sonnet-4-5"
console.log(res.routing.estimatedCostUsd); // e.g. 0.0008

// Council mode
const council = await arc.council('Is P = NP?');
console.log(council.confidence, council.votes);

// Streaming
for await (const chunk of arc.stream('Write a story...')) {
  process.stdout.write(chunk);
}

// Workflow with budget
const wf = arc.workflow({ sessionId: 'agent-42', totalBudget: 5.00 });
const plan = await wf.chat('Plan it', { agentStep: 'planning' });
const code = await wf.chat('Build it', { agentStep: 'code-generation' });

// x402 micropayments (no API key needed)
import { privateKeyToAccount } from 'viem/accounts';
const arc402 = new ArcRouter({
  wallet: privateKeyToAccount('0x...'),
});`}
</pre>
                    </div>
                  </div>

                  {/* OpenAI SDK */}
                  <div className="border border-border rounded-xl p-6 bg-card">
                    <h3 className="font-heading text-lg mb-3 text-foreground">OpenAI Python SDK (Drop-in)</h3>
                    <div className="bg-[#0a0a0b] p-4 rounded-lg border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`from openai import OpenAI

client = OpenAI(
    base_url="${apiUrl}",
    api_key="sk_your_key"  # Optional for free tier
)

# Smart routing (default mode)
response = client.chat.completions.create(
    model="arc-router-v1",
    messages=[{"role": "user", "content": "Explain quantum computing"}]
)
print(response.choices[0].message.content)

# Council mode with streaming
stream = client.chat.completions.create(
    model="arc-router-v1",
    messages=[{"role": "user", "content": "Write a sorting algorithm"}],
    stream=True,
    extra_body={"mode": "council", "budget": "economy"}
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")`}
</pre>
                    </div>
                  </div>

                  {/* OpenCode */}
                  <div className="border border-border rounded-xl p-6 bg-card">
                    <h3 className="font-heading text-lg mb-3 text-foreground">OpenCode (AI Coding Agent)</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Use ArcRouter as your coding agent with multi-model consensus verification.
                    </p>
                    <div className="bg-[#0a0a0b] p-4 rounded-lg border border-white/10 overflow-x-auto mb-4">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`# 1. Install OpenCode
curl -fsSL https://opencode.ai/install | bash

# 2. Add config to ~/.config/opencode/opencode.json
{
  "provider": {
    "arcrouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "ArcRouter",
      "options": {
        "baseURL": "${apiUrl}"
      },
      "models": {
        "arc-router-v1": {
          "name": "ArcRouter v1"
        }
      }
    }
  }
}

# 3. Start OpenCode and select the model
opencode
/model arcrouter:arc-router-v1`}
</pre>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-2">
                      Any OpenAI-compatible tool works — just set the base URL to {apiUrl}.
                    </p>
                  </div>

                  {/* Other Tools */}
                  <div className="border border-border rounded-xl p-6 bg-card">
                    <h3 className="font-heading text-lg mb-3 text-foreground">Other Compatible Tools</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      ArcRouter works with any tool that supports custom OpenAI base URLs:
                    </p>
                    <ul className="space-y-2 text-sm text-muted-foreground font-mono">
                      <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        <span><strong>Cursor:</strong> Set custom OpenAI endpoint in settings</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        <span><strong>Cline:</strong> Configure custom LLM provider</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        <span><strong>LangChain:</strong> Use ChatOpenAI with custom base_url</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        <span><strong>LlamaIndex:</strong> Configure OpenAI-compatible endpoint</span>
                      </li>
                    </ul>
                  </div>
                </div>
            </section>

             {/* Pricing */}
             <section id="pricing" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">Pricing & Limits</h2>
                </div>

                <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm font-mono">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                            <tr>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Tier</th>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Auth</th>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Price</th>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Rate Limit</th>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Models</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            <tr>
                                <td className="p-4 font-bold">Free</td>
                                <td className="p-4 text-muted-foreground">None</td>
                                <td className="p-4 text-muted-foreground">$0</td>
                                <td className="p-4 text-muted-foreground">20 / hr</td>
                                <td className="p-4 text-muted-foreground">Free only</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">API Key</td>
                                <td className="p-4 text-muted-foreground">Bearer token</td>
                                <td className="p-4 text-muted-foreground">$0.002 / req</td>
                                <td className="p-4 text-muted-foreground">1,000 / hr</td>
                                <td className="p-4 text-muted-foreground">All budgets</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold">x402</td>
                                <td className="p-4 text-muted-foreground">USDC on Base</td>
                                <td className="p-4 text-muted-foreground">$0.001–$0.005</td>
                                <td className="p-4 text-muted-foreground">Unlimited</td>
                                <td className="p-4 text-muted-foreground">All budgets</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="bg-muted/30 border border-border rounded-xl p-6">
                    <h3 className="font-heading text-lg mb-3 text-foreground">x402 Variable Pricing</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        x402 payments use variable pricing based on prompt complexity. Your prompt is automatically scored and the price is shown before you approve:
                    </p>
                    <div className="space-y-2 font-mono text-xs">
                        <div className="flex justify-between items-center p-3 bg-background rounded border border-border">
                            <span className="text-foreground">SIMPLE queries</span>
                            <span className="text-muted-foreground">$0.001 / request</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-background rounded border border-border">
                            <span className="text-foreground">MEDIUM queries</span>
                            <span className="text-muted-foreground">$0.002 / request</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-background rounded border border-border">
                            <span className="text-foreground">COMPLEX queries</span>
                            <span className="text-muted-foreground">$0.005 / request</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-background rounded border border-border">
                            <span className="text-foreground">REASONING queries</span>
                            <span className="text-muted-foreground">$0.008 / request</span>
                        </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">
                        API Key users pay a flat $0.002/request via Stripe metered billing, invoiced monthly. x402 users pay per-request with USDC on Base Mainnet via the Coinbase CDP facilitator — ideal for autonomous agents and agent-to-agent payments.
                    </p>
                </div>

                <div className="bg-muted/30 border border-border rounded-xl p-6">
                    <h3 className="font-heading text-lg mb-3 text-foreground">Budget Tiers</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        The <code className="text-xs bg-muted px-2 py-1 rounded">budget</code> parameter controls cost sensitivity. Paid users default to <code className="text-xs bg-muted px-2 py-1 rounded">&quot;auto&quot;</code>. Free-tier users are always restricted to free models.
                    </p>
                    <div className="space-y-2 font-mono text-xs">
                        <div className="flex justify-between items-center p-3 bg-background rounded border border-border">
                            <span className="text-foreground">&quot;free&quot;</span>
                            <span className="text-muted-foreground">Free models only (cost: $0)</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-background rounded border border-border">
                            <span className="text-foreground">&quot;economy&quot;</span>
                            <span className="text-muted-foreground">Strongly prefer cheap models (alias: &quot;low&quot;)</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-background rounded border border-border">
                            <span className="text-foreground">&quot;auto&quot; (default)</span>
                            <span className="text-muted-foreground">Balanced quality vs cost (alias: &quot;medium&quot;)</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-background rounded border border-border">
                            <span className="text-foreground">&quot;premium&quot;</span>
                            <span className="text-muted-foreground">Best quality, ignore cost (alias: &quot;high&quot;)</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* MCP Server */}
            <section id="mcp" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">MCP Server</h2>
                   <p className="text-muted-foreground">
                     ArcRouter exposes a <a href="https://modelcontextprotocol.io" className="text-foreground underline underline-offset-4 hover:opacity-70 transition-opacity">Model Context Protocol</a> (MCP) server for AI coding assistants like Claude Code, Cursor, and Cline.
                   </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">Setup</h3>
                    <div className="bg-[#0a0a0b] p-6 rounded-xl border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`# Add ArcRouter as an MCP server in Claude Code
claude mcp add arcrouter --transport http https://api.arcrouter.com/mcp`}
</pre>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide mb-4">Available Tools</h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="p-4 border border-border rounded-lg bg-card">
                        <span className="font-mono text-xs font-bold text-foreground">arcrouter_chat</span>
                        <p className="text-xs text-muted-foreground mt-1">Route a prompt to the best model. Supports budget, mode, and all routing parameters.</p>
                      </div>
                      <div className="p-4 border border-border rounded-lg bg-card">
                        <span className="font-mono text-xs font-bold text-foreground">arcrouter_models</span>
                        <p className="text-xs text-muted-foreground mt-1">List available models with benchmark scores, filtered by topic and budget.</p>
                      </div>
                      <div className="p-4 border border-border rounded-lg bg-card">
                        <span className="font-mono text-xs font-bold text-foreground">arcrouter_health</span>
                        <p className="text-xs text-muted-foreground mt-1">Check system status — API keys, database, routing, provider availability.</p>
                      </div>
                    </div>
                  </div>
                </div>
            </section>

          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
