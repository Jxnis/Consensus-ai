"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import NavigationNew from "@/components/sections/NavigationNew";
import FooterNew from "@/components/sections/FooterNew";
import { motion } from "motion/react";

const pipeline = [
  { n: "01", t: "Lexical prefilter", b: "Keyword classifier scores topic (code/math/science/writing/general + 19 subcategories) and complexity tier (SIMPLE/MEDIUM/COMPLEX/REASONING) in under 1ms." },
  { n: "02", t: "D1 shortlist", b: "Query 345+ benchmark-scored models. Filter by budget tier and complexity-weighted quality+value blend. Cap output_price per tier to protect margin." },
  { n: "03", t: "Embedding reranker", b: "Workers AI bge-base-en-v1.5 embeds the prompt, cosine-ranks the shortlist. Combines semantic match (0.55) + value (0.35) + reliability (0.10)." },
  { n: "04", t: "Direct or fallback", b: "If model is OpenAI / Anthropic / Google / DeepSeek / xAI — direct provider call (no OpenRouter markup). Long tail goes via OpenRouter. Circuit breaker with top-3 failover." },
];

const stats = [
  { v: "345+", l: "Models scored daily" },
  { v: "24", l: "Topic categories" },
  { v: "4", l: "Complexity tiers" },
  { v: "<1ms", l: "Classification latency" },
];

const SmartRouterProductPage = () => (
  <ThemeProvider>
    <main className="bg-background min-h-screen selection:bg-foreground selection:text-background transition-colors duration-500 overflow-x-hidden">
      <NavigationNew />

      <section className="min-h-[70vh] flex flex-col justify-center px-8 pt-32 pb-16">
        <div className="max-w-[1400px] mx-auto w-full">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="mb-8 flex items-center gap-3">
            <span className="inline-block w-2 h-2 bg-foreground" />
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">Product — Smart Router</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }} className="font-heading text-[clamp(3rem,10vw,9rem)] leading-[1.02] tracking-[-0.03em] text-foreground">
            The right model.<br />Every time.
          </motion.h1>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }} className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-12 max-w-2xl">
            Hybrid routing: a fast lexical classifier picks topic and complexity,
            a D1 shortlist narrows by budget, an embedding reranker scores
            semantic match. No vendor-aligned bias. Routes refresh daily from
            real benchmarks.
          </motion.p>
        </div>
      </section>

      <section className="py-20 px-8 border-t border-border">
        <div className="max-w-[1400px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-0 border-t border-l border-border">
          {stats.map((s) => (
            <div key={s.l} className="border-r border-b border-border p-10">
              <div className="font-heading text-5xl text-foreground tracking-[-0.03em] mb-2">{s.v}</div>
              <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-32 px-8 border-t border-border">
        <div className="max-w-[1400px] mx-auto">
          <div className="mb-16 max-w-3xl">
            <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">Pipeline</span>
            <h2 className="font-heading text-5xl md:text-6xl text-foreground tracking-[-0.03em] leading-[1.02]">
              Four stages. Under a second.
            </h2>
          </div>
          <div className="grid md:grid-cols-2 border-t border-l border-border">
            {pipeline.map((s) => (
              <div key={s.n} className="border-r border-b border-border p-10 hover:bg-card transition-colors duration-500">
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-4">{s.n}</span>
                <h3 className="font-heading text-2xl text-foreground tracking-[-0.02em] mb-4 leading-tight">{s.t}</h3>
                <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32 px-8 border-t border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="mb-12">
            <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">Response includes</span>
            <h2 className="font-heading text-4xl md:text-5xl text-foreground tracking-[-0.03em] leading-tight">Full routing transparency.</h2>
          </div>
          <pre className="font-mono text-[11px] text-foreground bg-card border border-border p-6 overflow-x-auto leading-relaxed">
{`{
  "choices": [{ "message": { "content": "..." } }],
  "routing": {
    "selected_model": "google/gemini-2.5-flash",
    "topic_detected": "code/frontend",
    "topic_confidence": 0.87,
    "complexity_tier": "MEDIUM",
    "complexity_confidence": 0.91,
    "is_agentic": false,
    "estimated_cost_usd": 0.0003,
    "charged_cost_usd": 0.002,
    "savings_vs_gpt4_pct": 92,
    "call_path": "direct:google",
    "models_considered": 12,
    "candidate_models": [ "...", "...", "..." ],
    "data_source": "d1_semantic"
  }
}`}
          </pre>
        </div>
      </section>

      <FooterNew />
    </main>
  </ThemeProvider>
);

export default SmartRouterProductPage;
