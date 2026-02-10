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
      <div className="max-w-4xl mx-auto">
        <HeroSlideUp delay={0}>
          <h1 className="text-6xl md:text-8xl lg:text-[120px] font-bold tracking-tighter text-[#111827] leading-[0.9] mb-8">
            One prompt.
            <br />
            Multiple models.
          </h1>
        </HeroSlideUp>

        <HeroSlideUp delay={0.1}>
          <h1 className="text-6xl md:text-8xl lg:text-[120px] font-bold tracking-tighter text-[#111827] leading-[0.9]">
            Verified answers.
          </h1>
        </HeroSlideUp>

        <HeroSlideUp delay={0.2} className="mt-12">
          <p className="text-xl md:text-2xl text-[#6b7280] max-w-2xl mx-auto font-medium leading-relaxed">
            ConsensusCloud routes your request to a council of models, 
            then returns the answer they agree on—fast, cheap, and auditable.
          </p>
        </HeroSlideUp>

        <HeroSlideUp delay={0.3} className="mt-16">
          <Button
            asChild
            size="lg"
            className="rounded-full text-lg h-16 px-10 shadow-xl transition-all duration-300 ease-out hover:scale-105 active:scale-95 bg-[#4F46E5] text-white hover:bg-[#4338CA]"
          >
            <a href="#footer">
              Join the Waitlist
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </Button>
        </HeroSlideUp>
      </div>
    </section>
  );
};

export default HeroSection;
