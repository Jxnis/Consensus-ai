import { motion, useInView } from "motion/react";
import { useRef, useState, useEffect } from "react";

const stats = [
  { label: "Up to", value: 90, suffix: "%", display: undefined, desc: "Cost savings on routes that would otherwise hit a frontier model (Sonnet, Opus, GPT-5). The router picks the cheapest model that still passes the benchmark for that topic and complexity tier — no quality drop." },
  { label: "Models scored", value: 345, suffix: "+", display: undefined, desc: "Prices refresh daily from OpenRouter. Quality scores blend LiveBench, LiveCodeBench, GPQA Diamond, and HuggingFace evals. No synthetic-only ranks at the top." },
  { label: "Topic categories", value: 24, suffix: "", display: undefined, desc: "Granular routing: code/frontend, math/calculus, science/physics. Plus 4 complexity tiers and agentic detection — better than picking one model for everything." },
];

const AnimatedNumber = ({ target, suffix, display }: { target: number; suffix: string; display?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView || display) return;
    let start = 0;
    const duration = 2000;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target, display]);

  return (
    <span ref={ref} className="font-heading text-7xl md:text-8xl text-foreground tracking-[-0.03em]">
      {display || count}{suffix}
    </span>
  );
};

const StatsSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-32 px-8">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-20 max-w-3xl"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Why ArcRouter
          </span>
          <h2 className="font-heading text-5xl md:text-7xl text-foreground tracking-[-0.03em] leading-[1.02]">
            Save up to 90% on AI costs.
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-6 max-w-xl">
            Most prompts don&apos;t need a frontier model. ArcRouter classifies
            every request by topic and complexity, then routes to the cheapest
            model that still passes the quality bar. Same OpenAI-compatible
            endpoint. Pay per call in USDC on Tempo or Base.
          </p>
        </motion.div>

        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8 }}
          className="grid md:grid-cols-3 gap-0 border-t border-border"
        >
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.2, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
              className={`py-12 px-8 ${i < 2 ? "md:border-r border-border" : ""} group cursor-default`}
            >
              <AnimatedNumber target={stat.value} suffix={stat.suffix} display={stat.display} />
              <h3 className="font-display text-lg font-semibold text-foreground mt-4 mb-2 tracking-tight">
                {stat.label}
              </h3>
              <p className="font-mono text-[11px] text-muted-foreground leading-[1.8] tracking-wide">
                {stat.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default StatsSection;
