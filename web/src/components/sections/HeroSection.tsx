"use client";

import { ArrowRight } from "lucide-react";
import { HeroSlideUp } from "@/lib/motion-presets";
import { Button } from "@/components/ui/Button";

export const HeroSection = () => {
  return (
    <section
      id="home"
      className="relative z-10 flex flex-col items-center justify-center min-h-[90vh] text-center px-4 py-32 bg-[#f5f5f4]"
    >
      <div className="max-w-6xl mx-auto">
        <HeroSlideUp delay={0}>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full border border-indigo-100 mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
            </span>
            <span className="text-xs font-bold text-indigo-700 tracking-tight uppercase">Powered by x402 — No Credit Card Required for Agents</span>
          </div>
        </HeroSlideUp>

        <HeroSlideUp delay={0.1}>
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter text-[#111827] leading-[0.8] mb-12">
            Multiple Models.
            <br />
            One Consensus.
          </h1>
        </HeroSlideUp>

        <HeroSlideUp delay={0.2}>
          <p className="text-xl md:text-3xl text-[#6b7280] max-w-3xl mx-auto font-medium leading-tight">
            The world's first verified LLM router. Get GPT-4 level reliability at a fraction of the cost. The ultimate OpenAI alternative for production-grade AI agents.
          </p>
        </HeroSlideUp>

        <HeroSlideUp delay={0.3} className="mt-16">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="rounded-full text-lg h-20 px-12 shadow-2xl transition-all duration-300 ease-out hover:scale-105 active:scale-95 bg-[#4F46E5] text-white hover:bg-[#4338CA] font-black"
            >
              <a href="#products">
                Deploy your Council
                <ArrowRight className="ml-2 h-6 w-6" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="rounded-full text-lg h-20 px-12 border-2 border-black/10 hover:bg-black/5 font-bold"
            >
              <a href="#docs">
                View API Ref
              </a>
            </Button>
          </div>
        </HeroSlideUp>
      </div>
    </section>
  );
};

export default HeroSection;
