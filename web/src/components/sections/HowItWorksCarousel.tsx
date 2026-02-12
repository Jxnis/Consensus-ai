"use client";

import { motion } from "motion/react";
import { Zap, Activity, Shield, Layers, History } from "lucide-react";

const features = [
  {
    icon: Activity,
    title: "Dynamic Selection",
    description: "Every request triggers a task-specific council of top-tier models (GPT, Claude, Llama) based on your latency and cost preferences.",
    color: "bg-[#EEF2FF]",
    iconColor: "text-indigo-600",
  },
  {
    icon: Zap,
    title: "Racing Algorithm",
    description: "Our proprietary racing engine executes multiple model calls in parallel, minimizing latency spikes while gathering diverse data points.",
    color: "bg-[#FFF1F2]",
    iconColor: "text-rose-600",
  },
  {
    icon: Shield,
    title: "Semantic Verification",
    description: "We compare responses using semantic overlap and token consistency checks to identify the 'Consensus Truth' and eliminate hallucinations.",
    color: "bg-[#F0FDF4]",
    iconColor: "text-emerald-600",
  },
  {
    icon: Layers,
    title: "Arbitrage Layer",
    description: "Only return what's verified. We arbitrage the intelligence of expensive models with the speed of cheaper ones to optimize your spend.",
    color: "bg-[#FEFCE8]",
    iconColor: "text-amber-600",
  },
  {
    icon: History,
    title: "Full Auditability",
    description: "Every decision, vote, and semantic score is logged in your secure dashboard for complete transparency and compliance.",
    color: "bg-[#F5F2FF]",
    iconColor: "text-purple-600",
  },
];

export const HowItWorksCarousel = () => {
  return (
    <section id="how-it-works" className="py-32 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 mb-24">
        <h2 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter text-[#111827]">
          Infrastructure.
          <br />
          <span className="text-[#2835f8]/20">Built for scale.</span>
        </h2>
      </div>

      {/* Horizontal Scroll Container - full width to right edge */}
      <div className="flex overflow-x-auto no-scrollbar py-4 pl-4 md:pl-[max(1rem,calc((100vw-80rem)/2))]">
        <div className="flex flex-row gap-6 pr-10">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              whileHover="hover"
              className="flex-shrink-0 w-[350px] md:w-[450px] h-[560px] rounded-3xl p-10 flex flex-col justify-between border border-black/[0.03] shadow-sm relative overflow-hidden group bg-[#f6f6f8] cursor-pointer"
            >
              {/* Massive Greyed out Number */}
              <motion.div 
                variants={{
                  hover: { color: "rgba(0, 0, 0, 0.15)", y: -5 }
                }}
                className="absolute top-10 left-10 text-[200px] font-black text-black/[0.05] leading-none select-none transition-colors duration-300"
              >
                0{index + 1}
              </motion.div>

              <div className="flex-1" />

              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-white shadow-soft ${feature.iconColor}`}>
                    <feature.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-4xl font-bold tracking-tight text-[#111827]">
                    {feature.title}
                  </h3>
                </div>
                <p className="text-xl text-gray-500 font-medium leading-[1.4] max-w-[90%]">
                  {feature.description}
                </p>
                
                {/* Visual Dash at bottom */}
                <div className="mt-12 w-16 h-1.5 bg-[#2835f8]/10 rounded-full group-hover:bg-[#2835f8] transition-colors duration-300" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksCarousel;
