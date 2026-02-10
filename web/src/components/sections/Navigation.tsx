"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, Cloud } from 'lucide-react';

const Navigation = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Playground', href: '#products' },
    { label: 'Docs', href: '#docs' },
    { label: 'Pricing', href: '#pricing' },
  ];

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-7xl px-4"
      >
        <div className={`flex items-center justify-between gap-2 px-6 py-3 rounded-full transition-all duration-300 ${
          isScrolled
            ? 'bg-white/70 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.05)] border border-white/20'
            : 'bg-transparent'
        }`}>
          {/* Logo */}
          <a href="#" className="flex items-center gap-2">
            <div className="relative w-10 h-10 flex items-center justify-center">
              <div className="absolute inset-0 bg-[#4F46E5]/10 rounded-xl" />
              <Cloud className="w-6 h-6 text-[#4F46E5] relative z-10" />
            </div>
            <span className="font-black text-xl text-[#111827] tracking-tighter">
              ConsensusCloud
            </span>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-5 py-2 text-sm font-bold text-gray-500 hover:text-[#111827] transition-colors rounded-full hover:bg-black/5"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* CTA Button */}
          <div className="flex items-center gap-3">
            <a
              href="#footer"
              className="hidden sm:flex items-center gap-2 px-6 py-2.5 bg-[#111827] text-white text-sm font-bold rounded-full hover:bg-[#111827]/90 active:scale-95 transition-all shadow-lg shadow-black/10"
            >
              Get started
            </a>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-[#111827] hover:bg-black/5 rounded-full transition-all"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 md:hidden bg-white/95 backdrop-blur-2xl flex flex-col pt-32 px-10 gap-8"
          >
            <nav className="flex flex-col gap-6">
              {navLinks.map((link, index) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-4xl font-black text-[#111827] hover:text-[#4F46E5] transition-colors"
                >
                  {link.label}
                </motion.a>
              ))}
            </nav>
            <motion.a
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                href="#footer"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full py-6 bg-[#4F46E5] text-white rounded-3xl font-black text-2xl text-center shadow-xl shadow-indigo-200"
            >
                Get Started
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navigation;
