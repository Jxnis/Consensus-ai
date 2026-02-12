"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";

/**
 * Hero Section — Scroll-reveal text container
 * 
 * A full-viewport rounded blue container (#2835f8) with large bold text
 * that starts greyed out and reveals word-by-word as the user scrolls.
 */
export const HeroSection = () => {
  const targetRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });

  const words = "Multiple Models. One Consensus.".split(" ");

  return (
    <section ref={targetRef} id="home" className="relative z-10 h-[200vh]">
      {/* Sticky container */}
      <div className="sticky top-0 h-screen flex items-center justify-center p-4 md:p-8">
        {/* Blue rounded container */}
        <div className="bg-[#2835f8] dark:bg-[#1e1b4b] text-white w-full h-full rounded-3xl flex flex-col items-center justify-center p-8 md:p-20 overflow-hidden relative">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent rounded-3xl pointer-events-none" />
          
          {/* Main reveal text */}
          <p className="relative z-10 flex flex-col md:flex-row flex-wrap justify-center text-6xl md:text-8xl lg:text-9xl font-bold leading-none tracking-tighter text-center">
            {words.map((word, i) => (
              <Word
                key={i}
                scrollYProgress={scrollYProgress}
                index={i}
                totalWords={words.length}
              >
                {word}
              </Word>
            ))}
          </p>

          {/* Subtitle */}
          <motion.p
            style={{
              opacity: useTransform(scrollYProgress, [0.55, 0.65], [0, 1]),
            }}
            className="relative z-10 mt-8 md:mt-12 text-lg md:text-2xl text-white/80 max-w-2xl text-center font-medium leading-relaxed"
          >
            The world's first verified LLM router. GPT-4 level reliability at a fraction of the cost.
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            style={{
              opacity: useTransform(scrollYProgress, [0.6, 0.7], [0, 1]),
              y: useTransform(scrollYProgress, [0.6, 0.7], [20, 0]),
            }}
            className="relative z-10 mt-8 md:mt-12 flex flex-col sm:flex-row items-center gap-4"
          >
            <a
              href="#products"
              className="px-10 py-4 bg-white text-[#2835f8] rounded-full font-black text-lg hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-black/20"
            >
              Try the Playground
            </a>
            <a
              href="/docs"
              className="px-10 py-4 bg-transparent border-2 border-white/30 text-white rounded-full font-bold text-lg hover:bg-white/10 transition-all"
            >
              View Docs
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// Animated word component
interface WordProps {
  children: string;
  scrollYProgress: MotionValue<number>;
  index: number;
  totalWords: number;
}

const Word = ({ children, scrollYProgress, index, totalWords }: WordProps) => {
  const start = (index / totalWords) * 0.4 + 0.2;
  const end = start + 0.08;

  const opacity = useTransform(scrollYProgress, [start, end], [0.15, 1]);

  return (
    <motion.span style={{ opacity }} className="mr-4 md:mr-5 mt-2 md:mt-5">
      {children}
    </motion.span>
  );
};

export default HeroSection;
