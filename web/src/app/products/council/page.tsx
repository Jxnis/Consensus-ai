"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import NavigationNew from "@/components/sections/NavigationNew";
import FooterNew from "@/components/sections/FooterNew";
import CouncilSection from "@/components/sections/CouncilSection";
import { motion } from "motion/react";

const CouncilProductPage = () => (
  <ThemeProvider>
    <main className="bg-background min-h-screen selection:bg-foreground selection:text-background transition-colors duration-500 overflow-x-hidden">
      <NavigationNew />

      <section className="min-h-[70vh] flex flex-col justify-center px-8 pt-32 pb-16">
        <div className="max-w-[1400px] mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8 flex items-center gap-3"
          >
            <span className="inline-block w-2 h-2 bg-foreground" />
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
              Product — Council Verification
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 }}
            className="font-heading text-[clamp(3rem,10vw,9rem)] leading-[1.02] tracking-[-0.03em] text-foreground"
          >
            Five models.<br />One answer.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-12 max-w-2xl"
          >
            Single-model answers hallucinate confidently. Five models from
            different providers rarely agree on the same wrong answer. When
            accuracy matters, run a council and let the disagreement surface
            before your agent acts on a bad output.
          </motion.p>
        </div>
      </section>

      <CouncilSection />

      <section className="py-32 px-8 border-t border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="mb-12">
            <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
              Request shape
            </span>
            <h2 className="font-heading text-4xl md:text-5xl text-foreground tracking-[-0.03em] leading-tight">
              Same API. One extra field.
            </h2>
          </div>

          <pre className="font-mono text-[11px] text-foreground bg-card border border-border p-6 overflow-x-auto leading-relaxed">
{`POST /v1/chat/completions
{
  "messages": [...],
  "mode": "council",        // 3-7 models in parallel
  "budget": "auto"          // tier picks model class
}

// Response (200 OK)
{
  "choices": [{ "message": { "content": "..." } }],
  "council": {
    "models_queried": 5,
    "consensus_confidence": 0.92,
    "agreement_pct": 88,
    "chairman_used": false,
    "votes": [
      { "model": "google/gemini-2.5-pro", "matches_consensus": true  },
      { "model": "anthropic/claude-sonnet-4-5", "matches_consensus": true  },
      { "model": "openai/gpt-5.1", "matches_consensus": true  },
      { "model": "deepseek/deepseek-chat", "matches_consensus": true  },
      { "model": "z-ai/glm-5", "matches_consensus": false }
    ]
  }
}`}
          </pre>

          <div className="mt-12 grid md:grid-cols-2 gap-0 border-t border-l border-border">
            <div className="border-r border-b border-border p-8">
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-4">When to use</span>
              <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide">
                Legal, medical, financial, audit. Anything where one hallucinated
                answer creates more damage than five right ones cost.
              </p>
            </div>
            <div className="border-r border-b border-border p-8">
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-4">When not to</span>
              <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide">
                Latency-sensitive chat. Casual Q&A. Anything where a single
                smart-routed model already gets you 95% of the way.
              </p>
            </div>
          </div>
        </div>
      </section>

      <FooterNew />
    </main>
  </ThemeProvider>
);

export default CouncilProductPage;
