"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

const options = [
  {
    label: "Path A",
    title: "OpenAI SDK drop-in",
    body: "Use the openai package you already have. Change the base URL. Done.",
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.arcrouter.com/v1",
  apiKey: "mpp-handled-via-mppx",
});

const res = await client.chat.completions.create({
  messages: [{ role: "user", content: "..." }],
  model: "auto",
});`,
    note: "Same shape OpenAI returns, plus a routing object with model picked, cost, savings.",
  },
  {
    label: "Path B",
    title: "TypeScript SDK",
    body: "@arcrouter/sdk wraps openai. Auto-handles x402 wallet signing + retry.",
    code: `import { ArcRouter } from "@arcrouter/sdk";

const arc = new ArcRouter({
  wallet: { privateKey: process.env.X402_KEY },
  budget: "auto",
});

const res = await arc.chat("...");
const verified = await arc.council("...");`,
    note: "Same SDK supports streaming, council, workflow budgets, model aliases.",
  },
  {
    label: "Path C",
    title: "MCP for Claude Code / Cursor",
    body: "One command. Adds three tools to any MCP client: chat, models, health.",
    code: `claude mcp add arcrouter \\
  --transport http \\
  https://api.arcrouter.com/mcp

# Then ask Claude Code:
#   "route this prompt to the best model"
# It calls arcrouter_chat automatically.`,
    note: "Works in Claude Code, Cursor, Cline, Windsurf, and any HTTP MCP host.",
  },
];

const IntegrationsSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="products" className="py-32 px-8 border-t border-border">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-16 max-w-3xl"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Three ways to integrate
          </span>
          <h2 className="font-heading text-5xl md:text-7xl text-foreground tracking-[-0.03em] leading-[1.02]">
            Drop in. Pick your path.
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-6">
            Same OpenAI-compatible endpoint underneath. Pick the path that
            matches the surface you already work in — pure HTTP, our typed SDK,
            or an MCP server for AI coding tools.
          </p>
        </motion.div>

        <div ref={ref} className="grid md:grid-cols-3 border-t border-l border-border">
          {options.map((o, i) => (
            <motion.div
              key={o.title}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: i * 0.15 }}
              className="border-r border-b border-border p-8 flex flex-col"
            >
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-3">
                {o.label}
              </span>
              <h3 className="font-heading text-2xl text-foreground tracking-[-0.02em] mb-3 leading-tight">
                {o.title}
              </h3>
              <p className="font-mono text-[11px] text-muted-foreground leading-relaxed tracking-wide mb-5">
                {o.body}
              </p>
              <pre className="font-mono text-[10px] text-foreground bg-card border border-border p-4 overflow-x-auto flex-1 leading-relaxed whitespace-pre-wrap">
                {o.code}
              </pre>
              <p className="font-mono text-[10px] text-muted-foreground tracking-wide mt-4 pt-4 border-t border-border">
                {o.note}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-10 border-t border-border"
        >
          <p className="font-mono text-[11px] text-muted-foreground tracking-wide max-w-xl">
            All three paths hit the same OpenAI-compatible endpoint. Switch
            between them as your stack changes — no lock-in to any single integration.
          </p>
          <a
            href="/products/integrations"
            className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background cursor-pointer"
          >
            See full guide
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default IntegrationsSection;
