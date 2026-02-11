"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Zap, ShieldCheck, DollarSign } from "lucide-react";

export const ExpandingStackedCards = () => {
  const containerRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Transform: from stacked in center to expanded
  // Card 1: Moves Left
  const card1X = useTransform(scrollYProgress, [0.3, 0.6], [10, -500]);
  const card1Rotate = useTransform(scrollYProgress, [0.3, 0.6], [0, -10]);

  // Card 2: Small Scale / Growth
  const card2Scale = useTransform(scrollYProgress, [0.3, 0.6], [0.95, 1.05]);

  // Card 3: Moves Right
  const card3X = useTransform(scrollYProgress, [0.3, 0.6], [-10, 500]);
  const card3Rotate = useTransform(scrollYProgress, [0.3, 0.6], [0, 10]);

  const cards = [
    {
      title: "Faster",
      description: "Parallel execution and a global routing layer reduce your time-to-first-token by 40% compared to standard API calls.",
      icon: Zap,
      color: "bg-indigo-600",
      x: card1X,
      rotate: card1Rotate,
      zIndex: 10,
    },
    {
      title: "Cheaper",
      description: "Scale your intelligence without scaling your costs. Our arbitrage layer finds the cheapest model that meets the consensus score.",
      icon: DollarSign,
      color: "bg-emerald-600",
      x: 0,
      scale: card2Scale,
      zIndex: 20,
    },
    {
      title: "Reliable",
      description: "Zero hallucinations. If the council doesn't agree, we don't ship. Audit every vote in real-time.",
      icon: ShieldCheck,
      color: "bg-rose-600",
      x: card3X,
      rotate: card3Rotate,
      zIndex: 10,
    },
  ];

  return (
    <section ref={containerRef} className="relative py-40 bg-white overflow-hidden min-h-[120vh]">
      <div className="container-custom text-center mb-40">
        <h2 className="text-5xl md:text-8xl font-bold tracking-tighter text-[#111827]">
          Elite Performance.
          <br />
          <span className="text-[#4F46E5] opacity-20">No Compromise.</span>
        </h2>
      </div>

      <div className="relative flex justify-center items-center h-[500px]">
        {cards.map((card, index) => (
          <motion.div
            key={index}
            style={{
              x: card.x,
              rotate: card.rotate,
              scale: card.scale,
              zIndex: card.zIndex,
            }}
            whileHover={{ 
              scale: 1.1, 
              y: -20, 
              transition: { type: "spring", stiffness: 400, damping: 10, bounce: 0.8 } 
            }}
            className={`absolute w-[300px] md:w-[400px] h-[500px] rounded-[48px] p-12 flex flex-col justify-end shadow-2xl transition-shadow hover:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.3)] cursor-pointer ${card.color}`}
          >
            <div className="absolute top-12 left-12 w-20 h-20 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center text-white">
               <card.icon className="w-10 h-10" />
            </div>

            <div className="text-white">
              <h3 className="text-4xl font-bold tracking-tight mb-4">{card.title}</h3>
              <p className="text-lg opacity-80 font-medium leading-relaxed">{card.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default ExpandingStackedCards;
