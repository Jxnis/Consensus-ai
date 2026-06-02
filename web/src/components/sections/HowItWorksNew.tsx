import { motion, useInView } from "motion/react";
import { useRef } from "react";

const steps = [
  {
    num: "01",
    title: "Classify the prompt",
    body: "Lexical classifier scores topic (24 categories incl. subcategories like code/frontend, math/calculus, science/physics) and complexity tier (SIMPLE / MEDIUM / COMPLEX / REASONING) in under 1ms. Detects whether the request is agentic — tool calls, multi-step, or chained.",
  },
  {
    num: "02",
    title: "Shortlist candidates from D1",
    body: "Query the model database for candidates matching topic + complexity + budget. Ranked by a complexity-weighted blend of quality (real benchmarks) and value (cost-adjusted). Output-price caps per tier protect margin.",
  },
  {
    num: "03",
    title: "Semantic rerank",
    body: "Workers AI embeds the prompt (bge-base-en-v1.5, free) and cosine-ranks the shortlist. Final score blends semantic match (0.55) + value (0.35) + reliability (0.10). Circuit breaker skips models that have failed recently.",
  },
  {
    num: "04",
    title: "Direct or OpenRouter",
    body: "If the chosen model is OpenAI / Anthropic / Google / DeepSeek / xAI — direct provider call (no markup, lower latency). Long tail goes via OpenRouter. Top-3 failover on error. SSE streaming with full routing metadata in response headers and body.",
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
            <h2 className="font-heading text-5xl md:text-7xl text-foreground tracking-[-0.03em] leading-[1.02]">
              How the router decides.
            </h2>
          </div>
        </motion.div>

        <div className="mt-16">
          {steps.map((step, i) => (
            <StepCard key={step.num} step={step} index={i} />
          ))}
          <div className="border-t border-border" />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        >
          <p className="font-mono text-[11px] text-muted-foreground tracking-wide max-w-xl">
            Full pipeline detail — including how complexity weights blend with
            value scores, embedding model choice, and direct-provider fallbacks.
          </p>
          <a
            href="/products/smart-router"
            className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background cursor-pointer"
          >
            Read the architecture
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default HowItWorksNew;
