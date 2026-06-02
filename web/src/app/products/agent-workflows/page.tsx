"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import NavigationNew from "@/components/sections/NavigationNew";
import FooterNew from "@/components/sections/FooterNew";
import AgentWorkflowsSection from "@/components/sections/AgentWorkflowsSection";
import { motion } from "motion/react";

const AgentWorkflowsProductPage = () => (
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
              Product — Agent Workflows
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 }}
            className="font-heading text-[clamp(3rem,10vw,9rem)] leading-[1.02] tracking-[-0.03em] text-foreground"
          >
            Routing built<br />for the loop.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-12 max-w-2xl"
          >
            Most LLM gateways route one prompt at a time. Agents run 50 calls
            inside one workflow with shared budget, evolving state, and tool use.
            ArcRouter is built for that shape.
          </motion.p>
        </div>
      </section>

      <AgentWorkflowsSection />

      <section className="py-32 px-8 border-t border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="mb-12">
            <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
              Example
            </span>
            <h2 className="font-heading text-4xl md:text-5xl text-foreground tracking-[-0.03em] leading-tight">
              One workflow, four routing decisions.
            </h2>
          </div>

          <pre className="font-mono text-[11px] text-foreground bg-card border border-border p-6 overflow-x-auto leading-relaxed">
{`// 1. Plan — needs reasoning
const plan = await arc.chat("Outline the migration steps", {
  agentStep: "reasoning",            // X-Agent-Step → REASONING tier
  workflowBudget: { sessionId: "wf-1", totalBudgetUsd: 0.50 },
});

// 2. Code-gen — needs COMPLEX, tool-capable
const code = await arc.chat("Write the migration script", {
  agentStep: "code-generation",      // → COMPLEX tier
  toolChoice: "required",            // enforce tool calls
});

// 3. Verify — multi-model
const review = await arc.chat("Does this script handle the rollback?", {
  agentStep: "verification",         // → council mode
});

// 4. Apply — simple action, cheap
const result = await arc.chat("Summarize what was applied", {
  agentStep: "simple-action",        // → SIMPLE tier
});

// Workflow auto-downgrades at 60%/80%/95% of budget.
// Returns 402 when exhausted.
const usage = await arc.workflow.getUsage("wf-1");`}
          </pre>
        </div>
      </section>

      <FooterNew />
    </main>
  </ThemeProvider>
);

export default AgentWorkflowsProductPage;
