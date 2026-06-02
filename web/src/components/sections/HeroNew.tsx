"use client";

import { useState } from "react";
import { motion } from "motion/react";
import WaitlistModal from "../WaitlistModal";

const words = ["Route", "smarter.", "Pay", "less."];

const HeroNew = () => {
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  return (
    <section className="min-h-screen flex flex-col justify-center px-8 pt-24">
      <div className="max-w-[1400px] mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="mb-12 flex items-center gap-3"
        >
          <span className="inline-block w-2 h-2 bg-foreground" />
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            Agent-native LLM gateway · MPP + x402
          </span>
        </motion.div>

        {words.map((word, i) => (
          <div key={`${word}-${i}`} className="overflow-hidden pb-2">
            <motion.h1
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 + i * 0.15 }}
              className="font-heading text-[clamp(4rem,12vw,11rem)] leading-[1.05] tracking-[-0.03em] text-foreground"
            >
              {word}
            </motion.h1>
          </div>
        ))}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3, duration: 0.8 }}
          className="mt-16 pt-8 border-t border-border flex flex-col md:flex-row justify-between items-start md:items-end gap-8"
        >
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground max-w-md tracking-wide">
            One OpenAI-compatible endpoint. 345+ models scored on real
            benchmarks, routed by topic and complexity. Pay per call in USDC on
            Tempo or Base — no signup, no subscription, no API key. Add council
            mode when one model is not enough.
          </p>

          <div className="flex items-center gap-4">
            <a
              href="#playground"
              className="group font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 bg-foreground text-background transition-all duration-500 hover:tracking-[0.3em]"
            >
              Try Playground
            </a>
            <button
              onClick={() => setWaitlistOpen(true)}
              className="group font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background cursor-pointer"
            >
              Join Waitlist
            </button>
          </div>
        </motion.div>
      </div>

      <WaitlistModal
        isOpen={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        tier="developer"
      />
    </section>
  );
};

export default HeroNew;
