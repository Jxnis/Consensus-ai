import { motion, useInView } from "motion/react";
import { useRef, useState, useEffect } from "react";

const stats = [
  { label: "Models tracked", value: 345, suffix: "+", display: undefined, desc: "Daily pricing and benchmark updates from OpenRouter. Smart routing selects best value model per topic." },
  { label: "Topic categories", value: 24, suffix: "", display: undefined, desc: "Granular detection: code/frontend, math/calculus, science/physics. Better routing accuracy than broad categories." },
  { label: "Cost savings", value: 90, suffix: "%", display: undefined, desc: "Up to 90% cheaper than GPT-4o by routing to the best model for each topic. Benchmark-verified quality at a fraction of the cost." },
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
          ref={ref}
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8 }}
          className="grid md:grid-cols-3 gap-0"
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
