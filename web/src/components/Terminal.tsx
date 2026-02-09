"use client"

import React, { useState, useEffect } from 'react'
import { Terminal as TerminalIcon, Sparkles, CheckCircle2, AlertCircle, Cpu, Zap } from 'lucide-react'

export default function Terminal() {
  const [prompt, setPrompt] = useState('Explain quantum entanglement briefly.')
  const [status, setStatus] = useState('idle') // idle, loading, consensus
  const [votes, setVotes] = useState<any[]>([])
  const [answer, setAnswer] = useState('')

  const simulate = async () => {
    setStatus('loading')
    setVotes([])
    setAnswer('')

    const demoVotes = [
      { id: 'gemini-flash', name: 'Gemini Flash 1.5', status: 'pending', color: 'text-blue-400' },
      { id: 'llama-3', name: 'Llama 3.1 8B', status: 'pending', color: 'text-orange-400' },
      { id: 'haiku', name: 'Claude Haiku 3', status: 'pending', color: 'text-indigo-400' }
    ]

    setVotes(demoVotes)

    for (let i = 0; i < demoVotes.length; i++) {
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1000))
      setVotes(prev => prev.map((v, idx) => idx === i ? { ...v, status: 'complete' } : v))
    }

    await new Promise(r => setTimeout(r, 600))
    setStatus('consensus')
    setAnswer("Quantum entanglement occurs when a pair of particles are generated or interact such that the state of each particle cannot be described independently of the others. Even when separated by large distances, a measurement of one particle instantly influences the state of the other.")
  }

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      <div className="h-12 border-b border-slate-800 px-4 flex items-center justify-between bg-slate-900/40">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center gap-1.5">
          <Zap className="w-3 h-3" />
          Consensus Edge (v1.0)
        </div>
      </div>

      <div className="p-8 space-y-8 font-mono text-sm uppercase">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-indigo-400 font-bold">
            <Sparkles className="w-4 h-4" />
            INPUT_PROMPT
          </div>
          <div className="flex gap-4">
            <input 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg h-12 px-4 text-slate-100 outline-none focus:border-indigo-500/50 transition-colors"
              placeholder="Enter prompt..."
            />
            <button 
              onClick={simulate}
              disabled={status === 'loading'}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 rounded-lg font-bold disabled:opacity-50 transition-all"
            >
              RUN_CONSENSUS
            </button>
          </div>
        </div>

        {votes.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-blue-400 font-bold">
              <Cpu className="w-4 h-4" />
              COUNCIL_VOTING
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {votes.map((vote) => (
                <div key={vote.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                  <div className="flex flex-col">
                     <span className="text-[10px] text-slate-500">MODEL</span>
                     <span className={`font-bold ${vote.color}`}>{vote.name}</span>
                  </div>
                  {vote.status === 'pending' ? (
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse ring-4 ring-indigo-500/20" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {status === 'consensus' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2 text-green-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              FINAL_CONSENSUS
            </div>
            <div className="bg-slate-950 border border-slate-800 p-6 rounded-xl leading-relaxed text-slate-300 normal-case font-sans italic">
              "{answer}"
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
