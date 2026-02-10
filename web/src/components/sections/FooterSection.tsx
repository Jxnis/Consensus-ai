"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Cloud, Github, Twitter, MessageCircle, Mail, ArrowRight } from "lucide-react";

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
    Product: ['Features', 'Pricing', 'Changelog', 'Roadmap'],
    Developers: ['Documentations', 'API Reference', 'SDKs', 'Status'],
    Company: ['About', 'Blog', 'Careers', 'Contact'],
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
                JOIN THE 
                <br />
                COUNCIL.
              </h2>
              <p className="text-2xl font-medium max-w-md opacity-80 mb-12">
                The world's first decentralized intelligence arbitrage network. Built for the agentic era.
              </p>

              <div className="flex flex-wrap gap-4">
                 <div className="flex-1 min-w-[300px] relative">
                    <input 
                      type="email" 
                      placeholder="Enter your email"
                      className="w-full h-20 bg-white/10 border border-white/20 rounded-full px-8 text-white placeholder:text-white/40 outline-none focus:bg-white/20 transition-all text-xl font-medium"
                    />
                    <button className="absolute right-3 top-3 bottom-3 px-8 bg-white text-[#4F46E5] rounded-full font-bold text-lg hover:scale-105 transition-transform flex items-center gap-2">
                       Join <ArrowRight className="w-5 h-5" />
                    </button>
                 </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
               {Object.entries(footerLinks).map(([category, links]) => (
                <div key={category}>
                   <h4 className="font-bold text-white mb-6 uppercase tracking-widest text-sm opacity-50">{category}</h4>
                   <ul className="space-y-4">
                     {links.map(link => (
                       <li key={link}>
                         <a href="#" className="text-lg font-medium hover:text-white transition-colors opacity-80 hover:opacity-100">{link}</a>
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

             <div className="flex items-center gap-8">
                <a href="#" className="hover:scale-125 transition-transform"><Twitter className="w-6 h-6" /></a>
                <a href="#" className="hover:scale-125 transition-transform"><Github className="w-6 h-6" /></a>
                <a href="#" className="hover:scale-125 transition-transform"><MessageCircle className="w-6 h-6" /></a>
                <a href="#" className="hover:scale-125 transition-transform"><Mail className="w-6 h-6" /></a>
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
