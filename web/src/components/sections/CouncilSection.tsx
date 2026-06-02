"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

const steps = [
  {
    n: "01",
    title: "3–7 models answer in parallel",
    body: "Diverse providers picked by topic and complexity. Avoids single-vendor bias and single-model failure modes.",
  },
  {
    n: "02",
    title: "Agreement scored",
    body: "Embedding cosine similarity on paid tier, Jaccard word-overlap on free. Each answer gets an agreement score against the others.",
  },
  {
    n: "03",
    title: "Chairman synthesizes on disagreement",
    body: "Confidence below 0.6? A separate Chairman model reads all answers and the critiques and synthesizes the final response.",
  },
];

const CouncilSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="council" className="py-32 px-8 border-t border-border">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-16 max-w-3xl"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Council Verification
          </span>
          <h2 className="font-heading text-5xl md:text-7xl text-foreground tracking-[-0.03em] leading-[1.02]">
            Multi-model verification on demand.
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-6">
            One model can hallucinate. Five rarely agree on the same wrong
            answer. Add <span className="text-foreground">mode: &quot;council&quot;</span> to any
            request when accuracy matters more than latency. Pricing scales 5x to
            cover the parallel inference — honest, no hidden cost.
          </p>
        </motion.div>

        <div ref={ref} className="grid md:grid-cols-3 border-t border-l border-border">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: i * 0.15 }}
              className="border-r border-b border-border p-10 hover:bg-card transition-colors duration-500"
            >
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-6">
                {s.n}
              </span>
              <h3 className="font-heading text-2xl text-foreground tracking-[-0.02em] mb-4 leading-tight">
                {s.title}
              </h3>
              <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide">
                {s.body}
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
            Recommended for legal, medical, financial, and audit-grade prompts.
            For everyday traffic, default smart routing already picks the best
            single model — no need to pay 5x.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="/products/council"
              className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background cursor-pointer"
            >
              Read the spec
            </a>
            <a
              href="/#playground"
              className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 bg-foreground text-background transition-all duration-500 hover:tracking-[0.3em] cursor-pointer"
            >
              Try in playground
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CouncilSection;
