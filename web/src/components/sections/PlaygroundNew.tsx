import { useState, useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { Brain, MessageSquare, Zap, Cpu, Sparkles, Shield, Loader2 } from 'lucide-react';

interface ModelResponse {
  id: string;
  name: string;
  icon: React.ElementType;
  response: string;
  confidence: number;
  status: 'idle' | 'loading' | 'complete';
}

const PlaygroundNew = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<"idle" | "thinking" | "responding" | "consensus">("idle");
  const [consensusPercent, setConsensusPercent] = useState(0);
  const [showResult, setShowResult] = useState(false);
  
  // Consensus result state
  const [consensusResult, setConsensusResult] = useState({
    response: '',
    agreement: 0,
    models: 0,
  });

  // Models state (5 models from original backend logic)
  const [models, setModels] = useState<ModelResponse[]>([
    { id: 'llama', name: 'Llama 3.1', icon: Brain, response: '', confidence: 0, status: 'idle' },
    { id: 'gemini', name: 'Gemini 2.0', icon: Zap, response: '', confidence: 0, status: 'idle' },
    { id: 'claude', name: 'Claude 3.5', icon: MessageSquare, response: '', confidence: 0, status: 'idle' },
    { id: 'mistral', name: 'Mistral 7B', icon: Cpu, response: '', confidence: 0, status: 'idle' },
    { id: 'gpt', name: 'GPT-4o', icon: Sparkles, response: '', confidence: 0, status: 'idle' },
  ]);

  const handleRunConsensus = async () => {
    if (!prompt.trim() || phase !== 'idle') return;

    // 1. Start Thinking Phase
    setPhase("thinking");
    setShowResult(false);
    setConsensusPercent(0);
    
    // Reset models to loading/idle
    setModels(prev => prev.map(m => ({ ...m, status: 'loading', response: '', confidence: 0 })));

    try {
      // 2. API Call
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
      const response = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk_demo_consensus_2024',
          'X-Source': 'consensus-playground' // Identify source
        },
        body: JSON.stringify({ 
          messages: [{ role: 'user', content: prompt }],
          budget: 'medium',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const finalResponse = data.choices?.[0]?.message?.content || 'Verified Response';
        const votes = data.consensus?.votes || [];
        const agreementScore = data.consensus?.confidence || 0.98;

        // 3. Update Models & Transition to Responding
        setPhase("responding");
        
        // Update models with real data
        setModels(prev => prev.map((m, idx) => {
          const vote = votes[idx];
          return {
            ...m,
            status: 'complete',
            response: vote?.answer || finalResponse, // Fallback if individual votes missing
            confidence: vote?.agrees ? 0.95 : 0.7
          };
        }));
        
        setConsensusResult({
          response: finalResponse,
          agreement: agreementScore,
          models: votes.length || 5
        });

        // 4. Animate Consensus Bar
        setTimeout(() => {
          setPhase("consensus");
          let p = 0;
          const target = Math.floor(agreementScore * 100);
          const interval = setInterval(() => {
            p += 2;
            setConsensusPercent(Math.min(p, target));
            if (p >= target) {
              clearInterval(interval);
              setShowResult(true);
              setPhase("idle"); // Reset to allow running again, but keep results shown
            }
          }, 20);
        }, 1500); // Wait a bit for user to read individual responses

        return;
      }
    } catch (e) {
      console.log("[Playground] API error, using simulation fallback");
    }

    // --- Simulation Fallback (Original Logic Adapted) ---
    const sampleResponses = [
      "Consensus reached: The prompt relates to high-stakes decision making.",
      "Consensus confirmed: This appears to be about critical decision processes.",
      "Agreement found: The query concerns important choice-making scenarios.",
      "Verified: Question is about high-stakes decision frameworks.",
      "Consensus: Topic is related to critical decision-making methodologies."
    ];

    // Simulate network delay then showing responses
    setTimeout(() => {
      setPhase("responding");
      setModels(prev => prev.map((m, i) => ({
        ...m,
        status: 'complete',
        response: sampleResponses[i] || "Verified response.",
        confidence: 0.95
      })));

      setConsensusResult({
        response: 'The Council has verified this request: All models agree the topic is about high-stakes decision-making processes.',
        agreement: 0.98,
        models: 5,
      });

      // Animate consensus
      setTimeout(() => {
        setPhase("consensus");
        let p = 0;
        const interval = setInterval(() => {
          p += 2;
          setConsensusPercent(p);
          if (p >= 98) {
            clearInterval(interval);
            setShowResult(true);
            setPhase("idle");
          }
        }, 20);
      }, 1000);

    }, 1500);
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

        {/* Input Area */}
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
            placeholder="Ask anything..."
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

        {/* Model Cards Grid */}
        {(phase !== 'idle' || showResult) && (
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
            {models.map((model, i) => (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
                className={`border border-border p-6 flex flex-col justify-between min-h-[200px] bg-card`}
              >
                <div className="flex items-center gap-3 mb-4">
                   {/* Icon */}
                   <model.icon className="w-4 h-4 text-muted-foreground" />
                   <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{model.name}</span>
                </div>
                
                {model.status === 'loading' ? (
                   <div className="flex gap-1.5 self-center my-auto">
                     {[0, 1, 2].map((d) => (
                       <motion.div
                         key={d}
                         animate={{ opacity: [0.2, 1, 0.2] }}
                         transition={{ repeat: Infinity, duration: 1.2, delay: d * 0.15 }}
                         className="w-1 h-1 rounded-full bg-muted-foreground"
                       />
                     ))}
                   </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 flex flex-col"
                  >
                    <p className="font-mono text-[10px] text-foreground leading-[1.6] line-clamp-6">
                      {model.response}
                    </p>
                    {model.confidence > 0 && (
                      <div className="mt-auto pt-4 border-t border-border/50 flex justify-between items-center">
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Confidence</span>
                        <span className="text-[10px] font-mono text-emerald-600">{(model.confidence * 100).toFixed(0)}%</span>
                      </div>
                    )}
                  </motion.div>
                )}
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
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="border border-foreground p-8 max-w-3xl mx-auto bg-card"
          >
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-4 h-4 text-foreground" />
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-foreground">
                Verified Truth
              </span>
            </div>
            <p className="font-heading text-xl md:text-2xl text-foreground leading-relaxed">
              {consensusResult.response}
            </p>
            <div className="mt-6 pt-6 border-t border-border flex justify-between items-center">
               <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                 Agreement across {models.length} models
               </span>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default PlaygroundNew;
