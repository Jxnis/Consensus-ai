import { useState, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Brain, Shield, Loader2 } from 'lucide-react';

interface ModelCard {
  model: string;
  answer: string;
  agrees: boolean;
  status: 'loading' | 'complete';
}

const PlaygroundNew = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"idle" | "thinking" | "responding" | "consensus">("idle");
  const [consensusPercent, setConsensusPercent] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [modelCards, setModelCards] = useState<ModelCard[]>([]);
  const [consensusResult, setConsensusResult] = useState({
    response: '',
    agreement: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const handleRunConsensus = async () => {
    if (!prompt.trim() || phase !== 'idle') return;

    setPhase("thinking");
    setShowResult(false);
    setConsensusPercent(0);
    setModelCards([]);
    setError(null);

    try {
      const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
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

      // Build model cards from real API response
      const cards: ModelCard[] = votes.map(v => ({
        model: v.model,
        answer: v.answer,
        agrees: v.agrees,
        status: 'complete' as const,
      }));

      setPhase("responding");
      setModelCards(cards);
      setConsensusResult({ response: finalResponse, agreement: agreementScore });

      // Animate consensus bar
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
            Interactive
          </span>
          <h2 className="font-heading text-5xl md:text-7xl text-foreground mb-16 tracking-[-0.03em]">
            Consensus Playground
          </h2>
        </motion.div>

        {/* Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="flex gap-0 mb-12 max-w-2xl mx-auto"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRunConsensus()}
            placeholder="Ask anything — free tier, no signup needed"
            disabled={phase !== 'idle'}
            className="flex-1 font-mono text-[12px] bg-transparent border border-border px-6 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors duration-500 disabled:opacity-50"
          />
          <button
            onClick={handleRunConsensus}
            disabled={phase !== 'idle' || !prompt.trim()}
            className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 bg-foreground text-background border border-foreground transition-all duration-500 hover:tracking-[0.3em] disabled:opacity-30 disabled:hover:tracking-[0.15em]"
          >
            {phase === 'thinking' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run Council'}
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
              Querying the council...
            </p>
          </motion.div>
        )}

        {/* Dynamic Model Cards — rendered from API response */}
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

        {/* Result Card */}
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
      </div>
    </section>
  );
};

export default PlaygroundNew;
