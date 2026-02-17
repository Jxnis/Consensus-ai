"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import NavigationNew from "@/components/sections/NavigationNew";
import HeroNew from "@/components/sections/HeroNew";
import QuickStartSection from "@/components/sections/QuickStartSection";
import HowItWorksNew from "@/components/sections/HowItWorksNew";
import StatsSection from "@/components/sections/StatsSection";
import CodeComparisonSection from "@/components/sections/CodeComparisonSection";
import AbstractCirclesSection from "@/components/sections/AbstractCirclesSection";
import PlaygroundNew from "@/components/sections/PlaygroundNew";
import PricingNew from "@/components/sections/PricingNew";
import FooterNew from "@/components/sections/FooterNew";

export default function LandingPage() {
  return (
    <ThemeProvider>
       <main className="bg-background min-h-screen selection:bg-foreground selection:text-background transition-colors duration-500 overflow-x-hidden">
        <NavigationNew />
        <HeroNew />
        <QuickStartSection />
        <HowItWorksNew />
        <StatsSection />
        <CodeComparisonSection />
        <AbstractCirclesSection />
        <PlaygroundNew />
        <PricingNew />
        <FooterNew />
      </main>
    </ThemeProvider>
  );
}
