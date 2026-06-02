'use client';

import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";
import WaitlistModal from "../WaitlistModal";

const plans = [
  {
    name: "Free",
    subtitle: "Try it. No signup.",
    price: "$0",
    period: "/ forever",
    features: [
      "Smart routing, free models only",
      "20 requests / hour per IP",
      "No API key required",
      "OpenAI SDK compatible",
    ],
    cta: "Try in Playground",
    href: "#playground",
    highlighted: false,
    tier: "free" as const,
  },
  {
    name: "Pay-per-call",
    subtitle: "Agents & builders",
    price: "$0.001",
    period: "/ request and up",
    features: [
      "SIMPLE $0.001  /  MEDIUM $0.002",
      "COMPLEX $0.005  /  REASONING $0.012",
      "PREMIUM $0.015 (Sonnet, Opus, GPT-5)",
      "Council verification = 5x tier price",
      "MPP (Tempo) + x402 (Base) USDC",
      "1,000 req / hour per wallet",
    ],
    cta: "Join Waitlist",
    useWaitlist: true,
    highlighted: true,
    tier: "developer" as const,
  },
  {
    name: "Enterprise",
    subtitle: "EU edge. ZDR. BYOK.",
    price: "Custom",
    period: "",
    features: [
      "EU edge processing (Cloudflare)",
      "Zero data retention by default",
      "Bring-your-own-keys (roadmap)",
      "Negotiated SLA + direct support",
      "Volume pricing",
    ],
    cta: "Talk to founder",
    href: "/enterprise",
    highlighted: false,
    tier: "team" as const,
  },
];

const PricingNew = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<"free" | "developer" | "team">("developer");

  const handleOpenWaitlist = (tier: "free" | "developer" | "team") => {
    setSelectedTier(tier);
    setWaitlistOpen(true);
  };

  return (
    <section id="pricing" className="py-32 px-8">
      <div className="max-w-[1200px] mx-auto">
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

        <div className="grid md:grid-cols-3 gap-0 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.15 + 0.2, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
              className={`group border border-border p-10 transition-all duration-500 hover:bg-card flex flex-col ${
                plan.highlighted ? "border-foreground z-10 bg-card/50" : "bg-background"
              } ${(!plan.highlighted && i !== plans.length - 1) ? "md:border-r-0" : ""}`}
            >
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                {plan.name}
              </span>
              <p className="font-mono text-[11px] text-muted-foreground mt-1 tracking-wide">{plan.subtitle}</p>

              <div className="mt-8 mb-8">
                <span className="font-heading text-5xl lg:text-6xl text-foreground flex items-baseline">
                    {plan.price}
                    {plan.price !== "Custom" && <span className="text-2xl ml-1 tracking-tighter"></span>}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground ml-1">{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-10 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="font-mono text-[10px] text-foreground mt-0.5">—</span>
                    <span className="font-mono text-[11px] text-muted-foreground tracking-wide">{f}</span>
                  </li>
                ))}
              </ul>

              {(plan as any).useWaitlist ? (
                <button
                  onClick={() => handleOpenWaitlist(plan.tier)}
                  className={`w-full font-mono text-[11px] tracking-[0.15em] uppercase py-4 transition-all duration-500 hover:tracking-[0.3em] text-center cursor-pointer ${
                    plan.highlighted
                      ? "bg-foreground text-background"
                      : "border border-border text-foreground hover:bg-foreground hover:text-background"
                  }`}
                >
                  {plan.cta}
                </button>
              ) : (
                <a
                  href={plan.href || "#"}
                  className={`w-full font-mono text-[11px] tracking-[0.15em] uppercase py-4 transition-all duration-500 hover:tracking-[0.3em] text-center block ${
                    plan.highlighted
                      ? "bg-foreground text-background"
                      : "border border-border text-foreground hover:bg-foreground hover:text-background"
                  }`}
                >
                  {plan.cta}
                </a>
              )}
            </motion.div>
          ))}
        </div>

        {/* Waitlist Modal */}
        <WaitlistModal
          isOpen={waitlistOpen}
          onClose={() => setWaitlistOpen(false)}
          tier={selectedTier}
        />
      </div>
    </section>
  );
};

export default PricingNew;
