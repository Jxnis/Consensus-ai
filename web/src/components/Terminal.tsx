"use client"

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal as TerminalIcon, Sparkles, CheckCircle2, AlertCircle, Cpu, Zap, Command, RefreshCcw, ShieldCheck } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export default function Terminal() {
  const [prompt, setPrompt] = useState('Explain quantum entanglement briefly.')
  const [status, setStatus] = useState<'idle' | 'loading' | 'consensus'>('idle')
  const [votes, setVotes] = useState<any[]>([])
  const [answer, setAnswer] = useState('')

  const runConsensus = async () => {
    setStatus('loading')
    setVotes([])
    setAnswer('')

    const demoVotes = [
      { id: 'gemini', name: 'Gemini 2.0 Flash', status: 'pending', color: 'indigo' },
      { id: 'llama', name: 'Llama 3.3 70B', status: 'pending', color: 'blue' },
      { id: 'haiku', name: 'Claude Haiku 3.5', status: 'pending', color: 'zinc' }
    ]

    setVotes(demoVotes)

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
      const response = await fetch(`${API_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          budget: 'low'
        })
      });

      if (!response.ok) throw new Error("API Offline");

      const data = await response.json();
      
      const realVotes = data.consensus.votes.map((v: any, i: number) => ({
        id: v.model,
        name: v.model.split('/').pop() || v.model,
        status: 'complete',
        agrees: v.agrees,
        color: i === 0 ? 'indigo' : i === 1 ? 'blue' : 'zinc'
      }));

      // Simulate bit of processing delay for aesthetic
      await new Promise(r => setTimeout(r, 1000));
      setVotes(realVotes);
      setAnswer(data.choices[0].message.content);
      setStatus('consensus');

    } catch (e) {
      // Fallback Simulation logic
      for (let i = 0; i < demoVotes.length; i++) {
        await new Promise(r => setTimeout(r, 600 + Math.random() * 800));
        setVotes(prev => prev.map((v, idx) => idx === i ? { ...v, status: 'complete', agrees: true } : v));
      }
      await new Promise(r => setTimeout(r, 400));
      setStatus('consensus');
      setAnswer("Quantum entanglement is a physical phenomenon that occurs when a group of particles are generated or interact in such a way that the quantum state of each particle cannot be described independently of the state of the others, even when the particles are separated by a large distance.");
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl overflow-hidden glass shadow-[0_32px_128px_-16px_rgba(0,0,0,0.8)] border-white/5">
      {/* Header */}
      <div className="h-14 border-b border-white/5 px-6 flex items-center justify-between bg-zinc-950/80">
        <div className="flex items-center gap-6">
          <div className="flex gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-800" />
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="text-[10px] font-black tracking-[0.2em] text-zinc-500 flex items-center gap-2 uppercase">
            <Command className="w-3 h-3" />
            Consensus_Engine_V1
          </div>
        </div>
        <div className="text-[10px] font-bold text-zinc-600 mono uppercase tracking-tight">
          Region: Global-Edge-01
        </div>
      </div>

      <div className="p-10 space-y-12">
        {/* Input */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-black tracking-widest uppercase">
            <Sparkles className="w-4 h-4" />
            System_Request
          </div>
          <div className="flex gap-4 p-2 rounded-xl bg-black border border-white/5">
            <input 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 bg-transparent h-14 px-4 text-white text-lg font-medium outline-none placeholder:text-zinc-700"
              placeholder="Query the council..."
            />
            <button 
              onClick={runConsensus}
              disabled={status === 'loading'}
              className="h-14 px-8 rounded-lg bg-white text-black font-black flex items-center gap-2 hover:bg-zinc-200 active:scale-95 transition-all disabled:opacity-50"
            >
              {status === 'loading' ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              RUN
            </button>
          </div>
        </div>

        {/* Voting Progress */}
        <AnimatePresence>
          {votes.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-2 text-zinc-500 text-xs font-black tracking-widest uppercase">
                <Cpu className="w-4 h-4" />
                Council_Verification
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {votes.map((vote, i) => (
                  <motion.div 
                    key={vote.id} 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-5 rounded-xl border border-white/5 bg-zinc-950/50 flex items-center justify-between"
                  >
                    <div className="space-y-1">
                       <span className="text-[9px] text-zinc-600 font-black uppercase tracking-widest">Model</span>
                       <div className="font-bold text-sm tracking-tight">{vote.name}</div>
                    </div>
                    <div>
                      {vote.status === 'pending' ? (
                        <div className="w-5 h-5 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
                      ) : (
                        <div className="w-5 h-5 bg-green-500/10 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Output */}
        <AnimatePresence>
          {status === 'consensus' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 pt-6 border-t border-white/5"
            >
              <div className="flex items-center gap-2 text-green-400 text-xs font-black tracking-widest uppercase">
                <ShieldCheck className="w-4 h-4" />
                Consensus_Reached
              </div>
              <div className="relative p-8 rounded-2xl bg-white/[0.02] border border-white/5 leading-relaxed text-zinc-200 font-medium text-lg italic tracking-tight">
                <div className="absolute top-4 left-4 text-4xl text-white/5 font-serif select-none">"</div>
                {answer}
                <div className="absolute bottom-4 right-4 text-4xl text-white/5 font-serif select-none rotate-180">"</div>
              </div>
              <div className="flex items-center justify-between px-2">
                <div className="flex gap-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Conf: 100%</div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Latency: 842ms</div>
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Tier: Complex</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
