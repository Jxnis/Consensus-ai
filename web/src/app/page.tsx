"use client";

import Navigation from '@/components/sections/Navigation';
import HeroSection from '@/components/sections/HeroSection';
import HowItWorksSection from '@/components/sections/HowItWorksSection';
import TerminalSection from '@/components/sections/TerminalSection';
import PlaygroundSection from '@/components/sections/PlaygroundSection';
import PerformanceSection from '@/components/sections/PerformanceSection';
import PricingSection from '@/components/sections/PricingSection';
import FooterSection from '@/components/sections/FooterSection';
import SecuritySection from '@/components/sections/SecuritySection';
import UseCasesSection from '@/components/sections/UseCasesSection';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main>
        <HeroSection />
        <HowItWorksSection />
        <TerminalSection />
        <PlaygroundSection />
        <PerformanceSection />
        <SecuritySection />
        <UseCasesSection />
        <PricingSection />
        <FooterSection />
      </main>
    </div>
  );
}
