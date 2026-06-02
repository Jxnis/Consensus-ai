"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

const sources = [
  { name: "LiveBench", what: "General reasoning, math, coding — refreshed weekly to prevent contamination." },
  { name: "LiveCodeBench", what: "Code generation across competitive programming problems, decontaminated." },
  { name: "GPQA Diamond", what: "Graduate-level physics, chemistry, biology questions." },
  { name: "HuggingFace Open LLM", what: "Community-run leaderboard across MMLU, HellaSwag, TruthfulQA, ARC, Winogrande." },
];

const BenchmarksSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="benchmarks" className="py-32 px-8 border-t border-border">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-16 max-w-3xl"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Rankings
          </span>
          <h2 className="font-heading text-5xl md:text-7xl text-foreground tracking-[-0.03em] leading-[1.02]">
            Routing decisions backed by real benchmarks.
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-6 max-w-xl">
            Every model in our shortlist has a quality score. Scores come from
            four independent benchmark sources, refreshed daily by a Cloudflare
            cron. No synthetic-only ranks at the top, no vendor-aligned bias.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-0 border-t border-l border-border">
          <div className="border-r border-b border-border p-10 lg:col-span-1">
            <div className="font-heading text-7xl text-foreground tracking-[-0.03em] mb-3">
              1,414
            </div>
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-6">
              Benchmark scores tracked
            </p>
            <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide">
              Across 345+ models, refreshed daily. Quality + value blended by
              complexity tier when shortlisting candidates.
            </p>
          </div>

          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-0">
            {sources.map((s) => (
              <div
                key={s.name}
                className="border-r border-b border-border p-10 hover:bg-card transition-colors duration-500"
              >
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-3">
                  Source
                </span>
                <h3 className="font-heading text-2xl text-foreground tracking-[-0.02em] mb-3">
                  {s.name}
                </h3>
                <p className="font-mono text-[11px] text-muted-foreground leading-relaxed tracking-wide">
                  {s.what}
                </p>
              </div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-10 border-t border-border"
        >
          <p className="font-mono text-[11px] text-muted-foreground tracking-wide max-w-xl">
            Composite scores recalculate after every benchmark refresh. The
            shortlist is filtered by budget and complexity, then an embedding
            reranker scores semantic match against your prompt.
          </p>
          <a
            href="/rankings"
            className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background"
          >
            See the rankings
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default BenchmarksSection;
