"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Cloud, ArrowRight } from "lucide-react";

export const FooterSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end end"],
  });

  // Circular reveal effect
  const clipPath = useTransform(
    scrollYProgress,
    [0, 1],
    ["circle(0% at 50% 100%)", "circle(150% at 50% 100%)"]
  );

  // Text color fade from grey to white
  const textColor = useTransform(scrollYProgress, [0.5, 1], ["#9ca3af", "#ffffff"]);

  const footerLinks = {
    Product: [
      { label: 'How it Works', href: '#how-it-works' },
      { label: 'Playground', href: '#products' },
      { label: 'Pricing', href: '#pricing' },
    ],
    Developers: [
      { label: 'Documentation', href: 'https://docs.consensuscloud.ai' },
      { label: 'GitHub', href: 'https://github.com/consensuscloud' },
    ],
  };

  return (
    <div ref={containerRef} id="footer" className="relative h-[150vh] bg-white">
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden">
        <motion.div
           style={{ clipPath }}
           className="absolute inset-0 bg-[#4F46E5] rounded-t-[80px] md:rounded-t-[120px] mx-4"
        />

        <motion.div 
            style={{ color: textColor }}
            className="relative z-10 w-full max-w-7xl mx-auto px-8 py-20"
        >
          <div className="grid lg:grid-cols-2 gap-20 items-end">
            <div>
              <h2 className="text-6xl md:text-8xl font-bold tracking-tighter mb-12 leading-[0.85]">
                THE X402
                <br />
                AI GATE.
              </h2>
              <p className="text-2xl font-medium max-w-md opacity-80 mb-12 leading-relaxed">
                The Trust Layer for the Agentic Era. Start building today with no credit card required.
              </p>
 
              <div className="flex flex-wrap gap-4">
                 <a 
                   href="#products"
                   className="h-20 px-12 bg-white text-[#4F46E5] rounded-full font-black text-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-2xl"
                 >
                    Try the Playground <ArrowRight className="w-6 h-6" />
                 </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-12">
               {Object.entries(footerLinks).map(([category, links]) => (
                <div key={category}>
                   <h4 className="font-bold text-white mb-6 uppercase tracking-widest text-sm opacity-50">{category}</h4>
                   <ul className="space-y-4">
                     {links.map(link => (
                       <li key={link.label}>
                         <a 
                           href={link.href} 
                           className="text-lg font-medium hover:text-white transition-colors opacity-80 hover:opacity-100"
                           {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                         >
                           {link.label}
                         </a>
                       </li>
                     ))}
                   </ul>
                </div>
               ))}
            </div>
          </div>

          <div className="mt-40 pt-12 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-8">
             <div className="flex items-center gap-3">
                <Cloud className="w-8 h-8 text-white" />
                <span className="text-2xl font-bold text-white">ConsensusCloud</span>
             </div>

             <p className="text-sm opacity-50 font-medium">
               © {new Date().getFullYear()} ConsensusCloud. All rights reserved.
             </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default FooterSection;
