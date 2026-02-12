"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { CheckCircle2 } from "lucide-react";

export const StickyDashboardSection = () => {
  const containerRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Scale from 0.85 to 1 as you scroll
  const scale = useTransform(scrollYProgress, [0, 0.3], [0.85, 1]);
  // Opacity from 0 to 1 as you scroll
  const opacity = useTransform(scrollYProgress, [0, 0.25], [0, 1]);

  const modelStatus = [
    { name: 'GPT-4o mini', status: 'online', latency: '45ms' },
    { name: 'Llama 3.1', status: 'online', latency: '38ms' },
    { name: 'Claude Haiku', status: 'online', latency: '52ms' },
    { name: 'Gemini Flash', status: 'online', latency: '41ms' },
    { name: 'Mistral Small', status: 'online', latency: '35ms' },
  ];

  return (
    <section ref={containerRef} className="relative z-20 h-[150vh] bg-[#f5f2ff]">
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden px-4">
        <motion.div
          style={{ scale, opacity }}
          className="w-full max-w-4xl"
        >
          <div className="bg-white rounded-[40px] p-10 md:p-16 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-white relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#EEF2FF] to-white/50 opacity-100" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-12">
                <h3 className="text-2xl font-bold tracking-tight text-[#111827]">Council Status</h3>
                <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-full border border-emerald-100">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                  </span>
                  <span className="text-sm font-bold text-emerald-700 tracking-tight">OPERATIONAL</span>
                </div>
              </div>

              <div className="grid gap-4">
                {modelStatus.map((model, index) => (
                  <motion.div
                    key={model.name}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between p-5 bg-[#f9fafb]/80 border border-gray-100 rounded-2xl hover:bg-white hover:border-[#2835f8]/20 transition-all duration-300 group"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:bg-[#2835f8] group-hover:text-white transition-colors duration-300">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="block font-bold text-lg text-[#111827]">{model.name}</span>
                        <span className="text-sm text-gray-500 font-medium">Verified Layer</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <span className="block text-sm font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Latency</span>
                        <span className="font-mono font-bold text-[#111827]">{model.latency}</span>
                      </div>
                      <div className="w-24 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-center">
                        <span className="text-xs font-black text-emerald-700 uppercase tracking-tighter">{model.status}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default StickyDashboardSection;
