"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

const useCases = [
  {
    label: "Agent automation",
    title: "Autonomous agents that pay their own way",
    body: "Drop ArcRouter into LangChain, AutoGen, Claude Agent SDK, or any OpenAI-compatible tool. The agent signs MPP or x402 micropayments per call — no API key, no subscription, no human in the loop.",
    bullet: "Most reliable on: tool-calling, multi-step plans, long-horizon tasks.",
  },
  {
    label: "Multi-step workflows",
    title: "Budgets that stop a runaway loop",
    body: "Set a total budget for a workflow. The router tracks spend across every step and auto-downgrades to cheaper models at 60/80/95%. Returns 402 when exhausted — your agent gets a hard stop instead of a surprise bill.",
    bullet: "Used by: research agents, code-gen pipelines, content workflows.",
  },
  {
    label: "Answers that must be right",
    title: "Council mode for high-stakes prompts",
    body: "3–7 models answer in parallel. The router computes agreement and surfaces the consensus. When models disagree, a Chairman model synthesizes. Use for legal, medical, financial, or any prompt where one wrong answer costs more than five right ones.",
    bullet: "Same OpenAI API. Add mode: 'council'. Pay 5x tier price.",
  },
  {
    label: "Cost-controlled R&D",
    title: "Try every model without picking one",
    body: "Routing decisions log to D1. Hit /v1/usage to see which models won for your traffic. Swap providers later without changing code — the router resolves model aliases (claude, gpt, gemini, deepseek) to whichever model currently benchmarks best.",
    bullet: "Replace 5 provider SDKs with one base URL.",
  },
];

const UseCasesSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="use-cases" className="py-32 px-8 border-t border-border">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-16"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Use Cases
          </span>
          <h2 className="font-heading text-5xl md:text-6xl text-foreground tracking-[-0.03em] leading-[1.02] max-w-3xl">
            Built for the workloads agents actually run.
          </h2>
        </motion.div>

        <div ref={ref} className="grid md:grid-cols-2 border-t border-l border-border">
          {useCases.map((u, i) => (
            <motion.div
              key={u.label}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="border-r border-b border-border p-10 group hover:bg-card transition-colors duration-500"
            >
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-6">
                {u.label}
              </span>
              <h3 className="font-heading text-2xl md:text-3xl text-foreground tracking-[-0.02em] leading-tight mb-4">
                {u.title}
              </h3>
              <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mb-6">
                {u.body}
              </p>
              <p className="font-mono text-[11px] text-foreground tracking-wide pt-4 border-t border-border">
                {u.bullet}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCasesSection;
