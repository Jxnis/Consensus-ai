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
    description: "Every decision, vote, and semantic score is logged on-chain (optional) or in your secure dashboard for complete transparency.",
    color: "bg-[#F5F2FF]",
    iconColor: "text-purple-600",
  },
];

export const HowItWorksCarousel = () => {
  return (
    <section id="how-it-works" className="py-32 bg-[#f5f2ff] overflow-hidden">
      <div className="container-custom">
        <div className="mb-24">
          <h2 className="text-5xl md:text-7xl font-bold tracking-tighter text-[#111827]">
            The Infrastructure
            <br />
            <span className="text-[#4F46E5]/40 text-4xl md:text-6xl tracking-tight">of Reliable AI</span>
          </h2>
        </div>

        <div className="flex overflow-x-auto no-scrollbar gap-8 pb-12 snap-x snap-mandatory">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              whileHover={{ y: -12, transition: { duration: 0.2 } }}
              className={`flex-shrink-0 w-[350px] md:w-[450px] h-[560px] rounded-[48px] p-10 flex flex-col justify-between snap-center border border-black/[0.03] shadow-sm relative overflow-hidden group ${feature.color}`}
            >
              {/* Massive Greyed out Number */}
              <div className="absolute -top-10 -right-4 text-[240px] font-black text-black/[0.04] leading-none select-none">
                {index + 1}
              </div>

              <div className="relative z-10 text-right">
                 <div className={`inline-flex w-20 h-20 rounded-3xl items-center justify-center bg-white shadow-soft ${feature.iconColor}`}>
                    <feature.icon className="w-10 h-10" />
                 </div>
              </div>

              <div className="relative z-10">
                <h3 className="text-4xl font-bold tracking-tight text-[#111827] mb-6">
                  {feature.title}
                </h3>
                <p className="text-xl text-gray-600 font-medium leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
          {/* Spacer for horizontal scroll */}
          <div className="flex-shrink-0 w-8" />
        </div>
      </div>
    </section>
  );
};

export default HowItWorksCarousel;
