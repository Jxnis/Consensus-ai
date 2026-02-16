import { motion, useInView } from "motion/react";
import { useRef } from "react";

const plans = [
  {
    name: "Free",
    subtitle: "Try it now — no signup",
    price: "$0",
    period: "/ forever",
    features: [
      "3 free-tier models",
      "Consensus verification",
      "20 requests / hour",
      "No API key required",
      "Community support",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Developer",
    subtitle: "Startups & AI Agents",
    price: "$0.002",
    period: "/ request",
    features: [
      "3–5 smart models",
      "Chairman synthesis",
      "1,000 req / hour",
      "API key access",
      "x402 micropayments (USDC)",
    ],
    cta: "Start Building",
    highlighted: true,
  },
];

const PricingNew = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="pricing" className="py-32 px-8">
      <div className="max-w-[1000px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Pricing
          </span>
          <h2 className="font-heading text-5xl md:text-7xl text-foreground tracking-[-0.03em]">
            Simple, transparent
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-0 max-w-3xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.15 + 0.2, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
              className={`group border border-border p-10 transition-all duration-500 hover:bg-card ${
                plan.highlighted ? "border-foreground" : ""
              } ${i === 0 ? "md:border-r-0" : ""}`}
            >
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                {plan.name}
              </span>
              <p className="font-mono text-[11px] text-muted-foreground mt-1 tracking-wide">{plan.subtitle}</p>

              <div className="mt-8 mb-8">
                <span className="font-heading text-6xl text-foreground">{plan.price}</span>
                <span className="font-mono text-[11px] text-muted-foreground ml-2">{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-10">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="font-mono text-[10px] text-foreground mt-0.5">—</span>
                    <span className="font-mono text-[11px] text-muted-foreground tracking-wide">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full font-mono text-[11px] tracking-[0.15em] uppercase py-4 transition-all duration-500 hover:tracking-[0.3em] ${
                  plan.highlighted
                    ? "bg-foreground text-background"
                    : "border border-border text-foreground hover:bg-foreground hover:text-background"
                }`}
              >
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingNew;
