"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import NavigationNew from "@/components/sections/NavigationNew";
import HeroNew from "@/components/sections/HeroNew";
import StatsSection from "@/components/sections/StatsSection";
import QuickStartSection from "@/components/sections/QuickStartSection";
import IntegrationsSection from "@/components/sections/IntegrationsSection";
import HowItWorksNew from "@/components/sections/HowItWorksNew";
import OnChainPaymentsSection from "@/components/sections/OnChainPaymentsSection";
import AgentWorkflowsSection from "@/components/sections/AgentWorkflowsSection";
import CouncilSection from "@/components/sections/CouncilSection";
import BenchmarksSection from "@/components/sections/BenchmarksSection";
import PartnersSection from "@/components/sections/PartnersSection";
import UseCasesSection from "@/components/sections/UseCasesSection";
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
        <StatsSection />
        <QuickStartSection />
        <IntegrationsSection />
        <HowItWorksNew />
        <OnChainPaymentsSection />
        <BenchmarksSection />
        <AgentWorkflowsSection />
        <CouncilSection />
        <PartnersSection />
        <UseCasesSection />
        <CodeComparisonSection />
        <AbstractCirclesSection />
        <PlaygroundNew />
        <PricingNew />
        <FooterNew />
      </main>
    </ThemeProvider>
  );
}
