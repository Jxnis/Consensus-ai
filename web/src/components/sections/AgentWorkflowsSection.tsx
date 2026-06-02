"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

const features = [
  {
    label: "Step routing",
    title: "X-Agent-Step",
    body: "Tell the router which step of a workflow this request is. simple-action → SIMPLE tier, code-generation → COMPLEX, reasoning → REASONING, verification → council. Override the prompt classifier when your agent already knows the answer.",
  },
  {
    label: "Spend caps",
    title: "Workflow budgets",
    body: "Set total_budget_usd for a session. The router auto-downgrades models at 60%, 80%, 95% spent. Returns 402 when exhausted. Per-workflow telemetry at /v1/workflow/{id}/usage — spend, models used, tier distribution.",
  },
  {
    label: "Stickiness",
    title: "Session pinning",
    body: "Pass session_id and the router remembers which model worked. Subsequent calls in the same session pin to that model (1h TTL). Stops a multi-step flow from jumping providers mid-conversation.",
  },
  {
    label: "Reliability",
    title: "Tool-call guarantees",
    body: "Set tool_choice: \"required\" and the router enforces it. Fails over to another tool-capable model if the first emits no_op natural-language instead of calling the tool. Detects tools[] and prefers tool-capable models automatically.",
  },
];

const AgentWorkflowsSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="agent-workflows" className="py-32 px-8 border-t border-border">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-16 max-w-3xl"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Agent Workflows
          </span>
          <h2 className="font-heading text-5xl md:text-7xl text-foreground tracking-[-0.03em] leading-[1.02]">
            Built for the loop.
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-6">
            Routing a single chat message is easy. Routing 50 calls inside one
            agent run — with budgets, fallbacks, step semantics, and tool
            guarantees — is what we built for.
          </p>
        </motion.div>

        <div ref={ref} className="grid md:grid-cols-2 border-t border-l border-border">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: i * 0.1 }}
              className="border-r border-b border-border p-10 hover:bg-card transition-colors duration-500"
            >
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-4">
                {f.label}
              </span>
              <h3 className="font-heading text-3xl text-foreground tracking-[-0.02em] mb-4">
                {f.title}
              </h3>
              <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide">
                {f.body}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-10 border-t border-border"
        >
          <p className="font-mono text-[11px] text-muted-foreground tracking-wide max-w-xl">
            Used by agents running long, budgeted workflows. The router treats
            each step as its own routing decision while keeping spend bounded.
          </p>
          <a
            href="/products/agent-workflows"
            className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background cursor-pointer"
          >
            Read the spec
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default AgentWorkflowsSection;
