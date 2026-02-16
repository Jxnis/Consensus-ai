import { motion, useInView } from "motion/react";
import { useRef } from "react";

const steps = [
  {
    num: "01",
    title: "Dynamic Selection",
    body: "Every request triggers a task-specific council of top-tier models based on your latency and cost preferences.",
  },
  {
    num: "02",
    title: "Racing Algorithm",
    body: "Our proprietary racing engine executes multiple model calls in parallel, minimizing latency spikes while gathering diverse data points.",
  },
  {
    num: "03",
    title: "Semantic Verification",
    body: "We compare responses using semantic overlap and token consistency checks to identify the 'Consensus Truth' and eliminate hallucinations.",
  },
  {
    num: "04",
    title: "Arbitrage Layer",
    body: "Only return what's verified. We arbitrage the intelligence of expensive models with the speed of cheaper ones to optimize your spend.",
  },
];

const StepCard = ({ step, index }: { step: (typeof steps)[0]; index: number }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay: index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="group border-t border-border py-10 grid md:grid-cols-[80px_1fr] gap-6 items-start cursor-default"
    >
      <span className="font-mono text-[11px] text-muted-foreground tracking-widest">{step.num}</span>
      <div>
        <h3 className="font-heading text-3xl md:text-4xl text-foreground mb-4 tracking-[-0.02em] group-hover:translate-x-2 transition-transform duration-500">
          {step.title}
        </h3>
        <p className="font-mono text-[11px] text-muted-foreground leading-[1.8] max-w-lg tracking-wide">
          {step.body}
        </p>
      </div>
    </motion.div>
  );
};

const HowItWorksNew = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-32 px-8">
      <div className="max-w-[1000px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-6 flex items-end justify-between"
        >
          <div>
            <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
              How it works
            </span>
            <h2 className="font-heading text-5xl md:text-7xl text-foreground tracking-[-0.03em]">
              The Consensus Engine
            </h2>
          </div>
        </motion.div>

        <div className="mt-16">
          {steps.map((step, i) => (
            <StepCard key={step.num} step={step} index={i} />
          ))}
          <div className="border-t border-border" />
        </div>
      </div>
    </section>
  );
};

export default HowItWorksNew;
