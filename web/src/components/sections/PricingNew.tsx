'use client';

import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";

const plans = [
  {
    name: "Free",
    subtitle: "Try it now — no signup",
    price: "$0",
    period: "/ forever",
    features: [
      "Smart routing (free models)",
      "24 topic categories",
      "20 requests / hour",
      "No API key required",
      "Community Discord",
    ],
    cta: "Get Started",
    href: "/docs",
    highlighted: false,
  },
  {
    name: "Developer",
    subtitle: "Startups & AI Agents",
    price: "$0.002",
    period: "/ request",
    features: [
      "345+ models, smart routing",
      "Council mode available",
      "1,000 req / hour",
      "Stripe metered billing",
      "x402 micropayments (agent-to-agent)",
    ],
    cta: "Start Building",
    useCheckout: true,
    highlighted: true,
  },
  {
    name: "Team",
    subtitle: "Custom needs? Let's talk",
    price: "Custom",
    period: "",
    features: [
      "Custom model selection",
      "Higher rate limits",
      "Priority support",
      "Usage analytics",
      "Contact for pricing",
    ],
    cta: "Contact Us",
    href: "mailto:janis.ellerbrock@gmail.com",
    highlighted: false,
  },
];

const PricingNew = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok && data.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url;
      } else {
        alert('Failed to start checkout: ' + (data.error || 'Unknown error'));
        setCheckoutLoading(false);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Network error. Please try again.');
      setCheckoutLoading(false);
    }
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

              {(plan as any).useCheckout ? (
                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className={`w-full font-mono text-[11px] tracking-[0.15em] uppercase py-4 transition-all duration-500 hover:tracking-[0.3em] text-center disabled:opacity-50 disabled:cursor-not-allowed ${
                    plan.highlighted
                      ? "bg-foreground text-background"
                      : "border border-border text-foreground hover:bg-foreground hover:text-background"
                  }`}
                >
                  {checkoutLoading ? 'Loading...' : plan.cta}
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
      </div>
    </section>
  );
};

export default PricingNew;
