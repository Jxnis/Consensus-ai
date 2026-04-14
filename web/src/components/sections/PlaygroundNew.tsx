import { useState, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Brain, Shield, Loader2, Zap } from 'lucide-react';

interface ModelCard {
  model: string;
  answer: string;
  agrees: boolean;
  status: 'loading' | 'complete';
}

interface RoutingMeta {
  selected_model: string;
  model_name: string;
  topic_detected: string;
  complexity_tier: string;
  complexity_confidence: number;
  is_agentic: boolean;
  estimated_cost_usd: number;
  savings_vs_gpt4_pct: number;
  call_path: string;
  models_considered: number;
  data_source: string;
}

const PlaygroundNew = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  const [mode, setMode] = useState<"route" | "council">("route");
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"idle" | "thinking" | "responding" | "consensus">("idle");
  const [error, setError] = useState<string | null>(null);

  // Smart route state
  const [routeResult, setRouteResult] = useState<{ response: string; meta: RoutingMeta } | null>(null);

  // Council state
  const [consensusPercent, setConsensusPercent] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [modelCards, setModelCards] = useState<ModelCard[]>([]);
  const [consensusResult, setConsensusResult] = useState({ response: '', agreement: 0 });

  const resetState = () => {
    setShowResult(false);
    setConsensusPercent(0);
    setModelCards([]);
    setRouteResult(null);
    setError(null);
  };

  const handleRun = async () => {
    if (!prompt.trim() || phase !== 'idle') return;
    setPhase("thinking");
    resetState();

    if (mode === "route") {
      await handleSmartRoute();
    } else {
      await handleCouncil();
    }
  };

  const handleSmartRoute = async () => {
    try {
      const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          budget: 'auto',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'Something went wrong. Try again.');
        setPhase("idle");
        return;
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        routing?: {
          selected_model?: string;
          model_name?: string;
          topic_detected?: string;
          complexity_tier?: string;
          complexity_confidence?: number;
          is_agentic?: boolean;
          estimated_cost_usd?: number;
          savings_vs_gpt4_pct?: number;
          call_path?: string;
          models_considered?: number;
          data_source?: string;
        };
      };

      const content = data.choices?.[0]?.message?.content || '';
      const meta: RoutingMeta = {
        selected_model: data.routing?.selected_model || 'unknown',
        model_name: data.routing?.model_name || '',
        topic_detected: data.routing?.topic_detected || 'general',
        complexity_tier: data.routing?.complexity_tier || 'MEDIUM',
        complexity_confidence: data.routing?.complexity_confidence ?? 0,
        is_agentic: data.routing?.is_agentic ?? false,
        estimated_cost_usd: data.routing?.estimated_cost_usd ?? 0,
        savings_vs_gpt4_pct: data.routing?.savings_vs_gpt4_pct ?? 0,
        call_path: data.routing?.call_path || 'openrouter',
        models_considered: data.routing?.models_considered ?? 0,
        data_source: data.routing?.data_source || 'd1_semantic',
      };

      setRouteResult({ response: content, meta });
      setPhase("idle");
    } catch {
      setError('Network error. Check your connection and try again.');
      setPhase("idle");
    }
  };

  const handleCouncil = async () => {
    try {
      const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          mode: 'council',
          budget: 'free',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'Something went wrong. Try again.');
        setPhase("idle");
        return;
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        consensus?: {
          confidence?: number;
          votes?: Array<{ model: string; answer: string; agrees: boolean }>;
        };
      };

      const finalResponse = data.choices?.[0]?.message?.content || '';
      const votes = data.consensus?.votes || [];
      const agreementScore = data.consensus?.confidence || 0;

      const cards: ModelCard[] = votes.map(v => ({
        model: v.model,
        answer: v.answer,
        agrees: v.agrees,
        status: 'complete' as const,
      }));

      setPhase("responding");
      setModelCards(cards);
      setConsensusResult({ response: finalResponse, agreement: agreementScore });

      setTimeout(() => {
        setPhase("consensus");
        const target = Math.round(agreementScore * 100);
        let p = 0;
        const interval = setInterval(() => {
          p += 2;
          setConsensusPercent(Math.min(p, target));
          if (p >= target) {
            clearInterval(interval);
            setShowResult(true);
            setPhase("idle");
          }
        }, 20);
      }, 1200);

    } catch {
      setError('Network error. Check your connection and try again.');
      setPhase("idle");
    }
  };

  const handleModeSwitch = (newMode: "route" | "council") => {
    if (phase !== 'idle') return;
    setMode(newMode);
    resetState();
  };

  const formatModel = (model: string) => {
    // Shorten "google/gemini-2.0-flash-001" → "gemini-2.0-flash"
    const parts = model.split('/');
    return parts[parts.length - 1].replace(/-\d{3}$/, '');
  };

  const formatCost = (usd: number) => {
    if (usd === 0) return '$0.000';
    if (usd < 0.001) return `$${usd.toFixed(5)}`;
    return `$${usd.toFixed(4)}`;
  };

  const formatCallPath = (path: string) => {
    if (path.startsWith('direct:')) return path.replace('direct:', '');
    return 'openrouter';
  };

  return (
    <section id="playground" className="py-32 px-8">
      <div className="max-w-[1200px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Try It Live
          </span>
          <h2 className="font-heading text-5xl md:text-7xl text-foreground mb-12 tracking-[-0.03em]">
            Playground
          </h2>
        </motion.div>

        {/* Tab switcher */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="flex gap-0 max-w-xs mx-auto mb-10"
        >
          <button
            onClick={() => handleModeSwitch("route")}
            className={`flex-1 font-mono text-[10px] tracking-[0.2em] uppercase px-6 py-3 border transition-all duration-300 ${
              mode === "route"
                ? "bg-foreground text-background border-foreground"
                : "bg-transparent text-muted-foreground border-border hover:border-foreground/50"
            }`}
          >
            Smart Route
          </button>
          <button
            onClick={() => handleModeSwitch("council")}
            className={`flex-1 font-mono text-[10px] tracking-[0.2em] uppercase px-6 py-3 border border-l-0 transition-all duration-300 ${
              mode === "council"
                ? "bg-foreground text-background border-foreground"
                : "bg-transparent text-muted-foreground border-border hover:border-foreground/50"
            }`}
          >
            Council Verify
          </button>
        </motion.div>

        {/* Mode description */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center mb-10"
        >
          <p className="font-mono text-[11px] text-muted-foreground">
            {mode === "route"
              ? "Routes to the best model for your prompt — see topic, complexity, model selected, and cost"
              : "Queries 3–5 models in parallel and returns the consensus answer"}
          </p>
        </motion.div>

        {/* Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.25, duration: 0.6 }}
          className="flex gap-0 mb-12 max-w-2xl mx-auto"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRun()}
            placeholder={mode === "route" ? "Ask anything — routes to the best model automatically" : "Ask anything — free tier, no signup needed"}
            disabled={phase !== 'idle'}
            className="flex-1 font-mono text-[12px] bg-transparent border border-border px-6 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors duration-500 disabled:opacity-50"
          />
          <button
            onClick={handleRun}
            disabled={phase !== 'idle' || !prompt.trim()}
            className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 bg-foreground text-background border border-foreground transition-all duration-500 hover:tracking-[0.3em] disabled:opacity-30 disabled:hover:tracking-[0.15em]"
          >
            {phase === 'thinking'
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : mode === "route" ? 'Route' : 'Verify'
            }
          </button>
        </motion.div>

        {/* Error state */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-2xl mx-auto mb-8 px-6 py-4 border border-destructive/30 bg-destructive/5"
          >
            <p className="font-mono text-[11px] text-destructive">{error}</p>
          </motion.div>
        )}

        {/* Loading state */}
        {phase === 'thinking' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center mb-12"
          >
            <p className="font-mono text-[11px] text-muted-foreground tracking-widest uppercase">
              {mode === "route" ? "Routing to best model..." : "Querying the council..."}
            </p>
          </motion.div>
        )}

        {/* ── SMART ROUTE RESULTS ── */}
        {mode === "route" && routeResult && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            {/* Routing metadata panel */}
            <div className="border border-border p-6 mb-4 bg-card">
              <div className="grid grid-cols-3 gap-x-8 gap-y-5">
                <div>
                  <p className="font-mono text-[9px] text-muted-foreground tracking-[0.25em] uppercase mb-1">Topic</p>
                  <p className="font-mono text-[12px] text-foreground">{routeResult.meta.topic_detected}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-muted-foreground tracking-[0.25em] uppercase mb-1">Complexity</p>
                  <p className="font-mono text-[12px] text-foreground">
                    {routeResult.meta.complexity_tier}
                    {routeResult.meta.complexity_confidence > 0 && (
                      <span className="text-muted-foreground text-[10px] ml-1">
                        ({Math.round(routeResult.meta.complexity_confidence * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-muted-foreground tracking-[0.25em] uppercase mb-1">Model</p>
                  <p className="font-mono text-[12px] text-foreground truncate">
                    {routeResult.meta.model_name || formatModel(routeResult.meta.selected_model)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-muted-foreground tracking-[0.25em] uppercase mb-1">Cost</p>
                  <p className="font-mono text-[12px] text-foreground">{formatCost(routeResult.meta.estimated_cost_usd)}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-muted-foreground tracking-[0.25em] uppercase mb-1">Savings vs GPT-4o</p>
                  <p className="font-mono text-[12px] text-emerald-600">{routeResult.meta.savings_vs_gpt4_pct}%</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] text-muted-foreground tracking-[0.25em] uppercase mb-1">Provider</p>
                  <p className="font-mono text-[12px] text-foreground">{formatCallPath(routeResult.meta.call_path)}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                <span className="font-mono text-[9px] text-muted-foreground tracking-[0.2em] uppercase">
                  {routeResult.meta.models_considered > 0 ? `${routeResult.meta.models_considered} models scored` : 'benchmark-verified routing'}
                </span>
                {routeResult.meta.is_agentic && (
                  <span className="font-mono text-[9px] text-amber-600 tracking-[0.2em] uppercase">
                    agentic detected
                  </span>
                )}
              </div>
            </div>

            {/* Response card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="border border-foreground p-8 bg-card"
            >
              <div className="flex items-center gap-3 mb-4">
                <Zap className="w-4 h-4 text-foreground" />
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-foreground">
                  Response
                </span>
              </div>
              <p className="font-heading text-xl md:text-2xl text-foreground leading-relaxed">
                {routeResult.response}
              </p>
            </motion.div>
          </motion.div>
        )}

        {/* ── COUNCIL RESULTS ── */}
        {mode === "council" && (
          <>
            {/* Dynamic Model Cards */}
            {modelCards.length > 0 && (
              <div className={`grid gap-6 mb-10 max-w-4xl mx-auto ${modelCards.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                {modelCards.map((card, i) => (
                  <motion.div
                    key={`${card.model}-${i}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: i * 0.08 }}
                    className="border border-border p-6 flex flex-col justify-between min-h-[200px] bg-card"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Brain className="w-3 h-3 text-muted-foreground" />
                        <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase truncate max-w-[140px]">
                          {card.model}
                        </span>
                      </div>
                      <span className={`font-mono text-[9px] tracking-widest uppercase ${card.agrees ? 'text-emerald-600' : 'text-muted-foreground/60'}`}>
                        {card.agrees ? 'agrees' : 'dissents'}
                      </span>
                    </div>
                    <p className="font-mono text-[10px] text-foreground leading-[1.7] line-clamp-6">
                      {card.answer}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Consensus Bar */}
            {(phase === "consensus" || showResult) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-8 max-w-3xl mx-auto"
              >
                <div className="flex justify-between font-mono text-[10px] text-muted-foreground mb-3 tracking-[0.2em] uppercase">
                  <span>Consensus Score</span>
                  <span>{consensusPercent}%</span>
                </div>
                <div className="h-px bg-border relative overflow-hidden">
                  <motion.div
                    className="h-full absolute top-0 left-0 bg-foreground"
                    style={{ width: `${consensusPercent}%` }}
                  />
                </div>
              </motion.div>
            )}

            {/* Council Result Card */}
            {showResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="border border-foreground p-8 max-w-3xl mx-auto bg-card"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Shield className="w-4 h-4 text-foreground" />
                  <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-foreground">
                    Council Consensus
                  </span>
                </div>
                <p className="font-heading text-xl md:text-2xl text-foreground leading-relaxed">
                  {consensusResult.response}
                </p>
                <div className="mt-6 pt-6 border-t border-border flex justify-between items-center">
                  <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                    {modelCards.length} model{modelCards.length !== 1 ? 's' : ''} • {Math.round(consensusResult.agreement * 100)}% agreement
                  </span>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default PlaygroundNew;
