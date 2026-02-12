"use client";

import Navigation from '@/components/sections/Navigation';
import HeroSection from '@/components/sections/HeroSection';
import StickyDashboardSection from '@/components/sections/StickyDashboardSection';
import HowItWorksCarousel from '@/components/sections/HowItWorksCarousel';
import TerminalSection from '@/components/sections/TerminalSection';
import PlaygroundSection from '@/components/sections/PlaygroundSection';
import ExpandingStackedCards from '@/components/sections/ExpandingStackedCards';
import PricingSection from '@/components/sections/PricingSection';
import FooterSection from '@/components/sections/FooterSection';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f4] selection:bg-[#2835f8]/20 overflow-x-hidden">
      <Navigation />
      
      <main>
        {/* Airy Hero Section */}
        <HeroSection />
        
        {/* Parallax Expanding Dashboard */}
        <StickyDashboardSection />
        
        {/* Feature Carousel (Phantom style) */}
        <HowItWorksCarousel />
        
        {/* Stable Comparison Section */}
        <TerminalSection />
        
        {/* Interactive Playground */}
        <div id="products">
          <PlaygroundSection />
        </div>
        
        {/* Expanding Stacked Cards (Performance) */}
        <ExpandingStackedCards />
        
        {/* Pricing */}
        <PricingSection />
        
        {/* Circular Reveal Footer */}
        <FooterSection />
      </main>
    </div>
  );
}
