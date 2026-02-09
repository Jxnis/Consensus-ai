import Terminal from '@/components/Terminal'

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 selection:bg-indigo-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <nav className="border-b border-slate-800/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg shadow-lg shadow-indigo-500/20" />
            <span className="font-bold text-xl tracking-tight">Consensus<span className="text-indigo-400">Cloud</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400 font-mono">
            <a href="#" className="hover:text-slate-100 transition-colors">DOCS</a>
            <a href="#" className="hover:text-slate-100 transition-colors">PRICING</a>
            <a href="#" className="bg-slate-100 text-slate-950 px-4 py-1.5 rounded-full hover:bg-slate-200 transition-all font-sans">GET STARTED</a>
          </div>
        </div>
      </nav>

      <section className="max-w-7xl mx-auto px-6 pt-24 pb-32">
        <div className="text-center space-y-8 mb-24">
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter">
            Intelligence <br /> 
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-blue-400 to-indigo-400">Arbitrage.</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto font-medium">
            Stop paying the \"Smart Model\" tax. Route every query to a council of elite local models and get GPT-4 accuracy at Llama-3 prices.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button className="h-12 px-8 rounded-full bg-indigo-600 hover:bg-indigo-500 font-bold transition-all shadow-xl shadow-indigo-500/20">
              BUILD WITH CONSENSUS
            </button>
            <button className="h-12 px-8 rounded-full border border-slate-800 hover:bg-slate-900 font-bold transition-all">
              VIEW DOCS
            </button>
          </div>
        </div>

        <div className="relative max-w-4xl mx-auto">
          <div className="absolute inset-0 bg-indigo-500/20 blur-[120px] rounded-full -z-10" />
          <Terminal />
        </div>
      </section>

      <footer className="border-t border-slate-900 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2 grayscale opacity-50">
             <div className="w-6 h-6 bg-slate-400 rounded-sm" />
             <span className="font-bold text-lg tracking-tight">ConsensusCloud</span>
          </div>
          <p className="text-sm text-slate-500">© 2026 Consensus Intelligence Inc. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
