"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Box, Cpu, ShieldCheck, Zap, Globe, Layers } from 'lucide-react'
import Terminal from '@/components/Terminal'

export default function Home() {
  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: "circOut" }
  }

  return (
    <main className="min-h-screen bg-black text-white relative isolate selection:bg-indigo-500/30">
      <div className="noise-overlay" />
      
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-indigo-600/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full" />
      </div>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Layers className="w-6 h-6 text-black" />
            </div>
            <span className="text-2xl font-black tracking-[-0.04em]">CONSENSUS</span>
          </div>
          
          <div className="hidden md:flex items-center gap-10 text-[13px] font-bold tracking-[0.1em] text-zinc-400 uppercase">
            <a href="#" className="hover:text-white transition-colors">Infrastructure</a>
            <a href="#" className="hover:text-white transition-colors">SDKs</a>
            <a href="#" className="hover:text-white transition-colors">Pricing</a>
            <button className="h-10 px-6 rounded-lg bg-white text-black font-black flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all">
              LAUNCH APP <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-32 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "circOut" }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-zinc-400 text-xs font-bold tracking-widest mb-10"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            V1.0 PRODUCTION READY
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-7xl md:text-[140px] font-black tracking-[-0.06em] leading-[0.85] mb-12 text-balance"
          >
            SMART <br />
            <span className="text-zinc-800">ARBITRAGE</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xl md:text-2xl text-zinc-400 max-w-2xl mx-auto font-medium mb-16"
          >
            Get GPT-4 accuracy at Llama-3 prices. Consensus routers verify every output across a council of elite models.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="relative"
          >
            <div className="absolute -inset-20 bg-indigo-500/10 blur-[100px] rounded-full -z-10" />
            <Terminal />
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 px-6 bg-zinc-950/50 border-y border-white/5">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
          {[
            { 
              icon: <Cpu className="w-8 h-8 text-indigo-500" />, 
              title: "EDGE ENGINE", 
              desc: "Consensus logic runs on the global edge in under <1ms latency." 
            },
            { 
              icon: <ShieldCheck className="w-8 h-8 text-green-500" />, 
              title: "TRUTH VERIFIED", 
              desc: "Semantic grouping prevents hallucinations by requiring model agreement." 
            },
            { 
              icon: <Zap className="w-8 h-8 text-yellow-500" />, 
              title: "X402 PAYMENTS", 
              desc: "Streaming micropayments built directly into the LLM protocol." 
            }
          ].map((f, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-8 rounded-2xl glass hover:border-white/20 transition-all group"
            >
              <div className="mb-6">{f.icon}</div>
              <h3 className="text-xl font-black tracking-tight mb-4">{f.title}</h3>
              <p className="text-zinc-500 leading-relaxed font-medium">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-3 grayscale opacity-30">
            <Layers className="w-6 h-6" />
            <span className="text-xl font-black tracking-[-0.04em]">CONSENSUS</span>
          </div>
          <p className="text-zinc-600 text-sm font-medium">© 2026 Consensus Intelligence Inc. Built for the Agentic Era.</p>
          <div className="flex gap-8 text-[12px] font-bold tracking-widest text-zinc-500 uppercase">
            <a href="#" className="hover:text-white transition-all">Twitter</a>
            <a href="#" className="hover:text-white transition-all">GitHub</a>
            <a href="#" className="hover:text-white transition-all">Contact</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
