"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import NavigationNew from "@/components/sections/NavigationNew";
import FooterNew from "@/components/sections/FooterNew";
import { motion, useInView } from "motion/react";
import { useRef } from "react";

const pillars = [
  {
    label: "EU edge processing",
    title: "Routing decisions stay at the edge",
    body: "ArcRouter runs on Cloudflare Workers — your prompt is classified and routed at the nearest edge PoP (EU traffic typically Madrid, Paris, Amsterdam, Frankfurt). The provider call still exits to the model vendor you select. Use BYOK if you need full control over where the LLM call lands.",
  },
  {
    label: "Zero data retention",
    title: "Prompts are not stored",
    body: "Default for every tier: prompts and completions are forwarded, never written to storage. Routing logs capture model + topic + complexity + timing for billing reconciliation — not the prompt content. Aggregated usage counters in KV only.",
  },
  {
    label: "Bring your own keys",
    title: "BYOK on the roadmap",
    body: "Planned: configure your own OpenAI, Anthropic, Google, DeepSeek, xAI keys per workspace. ArcRouter handles the routing decision; the LLM call uses your account, so you keep direct vendor relationships and contractual control. Available on request as part of early enterprise pilots.",
  },
  {
    label: "Compliance posture",
    title: "GDPR-aligned by construction",
    body: "No PII processing beyond what the prompt itself contains. Customer-controlled data processing agreement on request. Routing analytics pseudonymized by API-key hash. SOC 2 / ISO 27001 not yet certified — pilot customers can review the architecture directly.",
  },
  {
    label: "Reliability",
    title: "Multi-provider failover",
    body: "Circuit breaker with top-3 fallback per request. One vendor outage does not stop the agent. SLA terms negotiated per pilot — we're honest that an SLA from a solo founder is a different shape than one from AWS.",
  },
  {
    label: "Control",
    title: "Workspace budgets and audit",
    body: "Workflow budget caps auto-downgrade at 60/80/95% spent. Per-key usage at /v1/usage. Routing-decision history exposed via D1 for audit. Workspace-level RBAC and SIEM export on the roadmap, not yet shipped.",
  },
];

const EnterprisePage = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <ThemeProvider>
      <main className="bg-background min-h-screen selection:bg-foreground selection:text-background transition-colors duration-500 overflow-x-hidden">
        <NavigationNew />

        <section className="min-h-[80vh] flex flex-col justify-center px-8 pt-32 pb-16">
          <div className="max-w-[1400px] mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mb-12 flex items-center gap-3"
            >
              <span className="inline-block w-2 h-2 bg-foreground" />
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                Enterprise — Built in Europe
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="font-heading text-[clamp(3rem,9vw,8rem)] leading-[1.02] tracking-[-0.03em] text-foreground max-w-5xl"
            >
              AI routing for teams that take data seriously.
            </motion.h1>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="mt-16 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-start md:items-end gap-8"
            >
              <p className="font-mono text-[12px] leading-relaxed text-muted-foreground max-w-xl tracking-wide">
                ArcRouter runs on Cloudflare Workers — routing decisions stay
                at the edge nearest your users. Zero data retention by default.
                Bring your own provider keys when you need full control over
                where the LLM call lands. Built for European teams that want
                an LLM gateway without standing up their own.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <a
                  href="mailto:janis.ellerbrock@gmail.com?subject=ArcRouter%20Enterprise"
                  className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 bg-foreground text-background transition-all duration-500 hover:tracking-[0.3em] text-center"
                >
                  Contact for pilot
                </a>
                <a
                  href="/docs"
                  className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background text-center"
                >
                  Read the docs
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="py-32 px-8 border-t border-border">
          <div className="max-w-[1400px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8 }}
              className="mb-16 max-w-3xl"
            >
              <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
                What you get
              </span>
              <h2 className="font-heading text-5xl md:text-6xl text-foreground tracking-[-0.03em] leading-[1.02]">
                Six guarantees. No marketing fluff.
              </h2>
            </motion.div>

            <div ref={ref} className="grid md:grid-cols-2 lg:grid-cols-3 border-t border-l border-border">
              {pillars.map((p, i) => (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, y: 30 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.7, delay: i * 0.08 }}
                  className="border-r border-b border-border p-10 hover:bg-card transition-colors duration-500"
                >
                  <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-4">
                    {p.label}
                  </span>
                  <h3 className="font-heading text-2xl text-foreground tracking-[-0.02em] mb-4 leading-tight">
                    {p.title}
                  </h3>
                  <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide">
                    {p.body}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-32 px-8 border-t border-border">
          <div className="max-w-[1000px] mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.8 }}
            >
              <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
                Not ready for a pilot?
              </span>
              <h2 className="font-heading text-4xl md:text-5xl text-foreground tracking-[-0.03em] leading-tight mb-6">
                Start free. Move to enterprise when the requirements show up.
              </h2>
              <p className="font-mono text-[12px] text-muted-foreground tracking-wide max-w-xl mx-auto mb-10">
                The same routing engine runs every tier. Pay-per-call USDC for
                builders. Enterprise contract when procurement asks.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href="/#playground"
                  className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 bg-foreground text-background transition-all duration-500 hover:tracking-[0.3em]"
                >
                  Try Playground
                </a>
                <a
                  href="mailto:janis.ellerbrock@gmail.com?subject=ArcRouter%20Enterprise"
                  className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background"
                >
                  Contact us
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        <FooterNew />
      </main>
    </ThemeProvider>
  );
};

export default EnterprisePage;
