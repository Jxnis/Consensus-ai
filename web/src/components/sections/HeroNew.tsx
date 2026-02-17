import { motion } from "motion/react";

const words = ["Multiple", "Models.", "One", "Consensus."];

const HeroNew = () => {
  return (
    <section className="min-h-screen flex flex-col justify-center px-8 pt-16">
      <div className="max-w-[1400px] mx-auto w-full">
        {words.map((word, i) => (
          <div key={word} className="overflow-hidden mb-1">
            <motion.h1
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.2 + i * 0.15 }}
              className="font-heading text-[clamp(4rem,12vw,11rem)] leading-[0.92] tracking-[-0.03em] text-foreground"
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
            A council of AI models cross-checks every answer for higher confidence.
            Multi-model verification at a fraction of single-model frontier cost.
          </p>

          <div className="flex items-center gap-4">
            <a
              href="#playground"
              className="group font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 bg-foreground text-background transition-all duration-500 hover:tracking-[0.3em]"
            >
              Try Playground
            </a>
            <a
              href="/docs"
              className="group font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background"
            >
              Read Docs
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroNew;
