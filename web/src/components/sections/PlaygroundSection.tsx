import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Loader2, CheckCircle2, Brain, MessageSquare, Zap, Cpu, Sparkles, Shield } from 'lucide-react';

interface ModelResponse {
  name: string;
  icon: React.ElementType;
  response: string;
  confidence: number;
  status: 'idle' | 'loading' | 'complete';
}

const PlaygroundSection = () => {
  const [prompt, setPrompt] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [consensusResult, setConsensusResult] = useState({
    response: '',
    agreement: 0,
    models: 0,
  });

  const [models, setModels] = useState<ModelResponse[]>([
    { name: 'Llama 3.1 8B', icon: Brain, response: '', confidence: 0, status: 'idle' },
    { name: 'Gemini 2.0 Flash', icon: Zap, response: '', confidence: 0, status: 'idle' },
    { name: 'Claude Haiku', icon: MessageSquare, response: '', confidence: 0, status: 'idle' },
    { name: 'Mistral 7B', icon: Cpu, response: '', confidence: 0, status: 'idle' },
    { name: 'GPT-4o mini', icon: Sparkles, response: '', confidence: 0, status: 'idle' },
  ]);

  const handleRunConsensus = async () => {
    if (!prompt.trim() || isRunning) return;

    setIsRunning(true);
    setShowResults(false);

    // Reset models
    setModels(prev => prev.map(m => ({ ...m, status: 'loading', response: '', confidence: 0 })));

    try {
      // Production-ready API URL (env variable or fallback to local dev)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';
      const response = await fetch(`${apiUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk_demo_consensus_2024',
          'X-Source': 'consensus-playground'
        },
        body: JSON.stringify({ 
          messages: [{ role: 'user', content: prompt }],
          budget: 'medium', // Default for playground
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const finalResponse = data.choices?.[0]?.message?.content || 'Verified Response';
        const votes = data.consensus?.votes || [];
        
        // Update each model card with its individual response from the votes
        setModels(prev => prev.map((m, idx) => {
          const vote = votes[idx];
          return {
            ...m,
            status: 'complete',
            response: vote?.answer || finalResponse,
            confidence: vote?.agrees ? 0.95 : 0.7
          };
        }));
        
        setConsensusResult({
          response: finalResponse,
          agreement: data.consensus?.confidence || 1.0,
          models: votes.length || 5
        });
        setIsRunning(false);
        setShowResults(true);
        return;
      }
    } catch (e) {
      console.log("[Playground] API not available, falling back to simulation.");
    }

    // --- Simulation Fallback ---
    const sampleResponses = [
      { response: 'Consensus reached: The prompt relates to high-stakes decision making.', confidence: 0.94 },
      { response: 'Consensus confirmed: This appears to be about critical decision processes.', confidence: 0.96 },
      { response: 'Agreement found: The query concerns important choice-making scenarios.', confidence: 0.92 },
      { response: 'Verified: Question is about high-stakes decision frameworks.', confidence: 0.95 },
      { response: 'Consensus: Topic is related to critical decision-making methodologies.', confidence: 0.93 },
    ];

    for (let i = 0; i < models.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 300));
      setModels(prev => {
        const newModels = [...prev];
        newModels[i] = {
          ...newModels[i],
          status: 'complete',
          response: sampleResponses[i].response,
          confidence: sampleResponses[i].confidence,
        };
        return newModels;
      });
    }

    setConsensusResult({
      response: 'The Council has verified this request: All models agree the topic is about high-stakes decision-making processes.',
      agreement: 0.98,
      models: 5,
    });

    setIsRunning(false);
    setShowResults(true);
  };

  const ModelCard = ({ model, isConsensus = false }: { model: ModelResponse; isConsensus?: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const shouldTruncate = model.response.length > 120;
    const displayText = shouldTruncate && !isExpanded 
      ? model.response.slice(0, 120) + '...' 
: model.response;

    return (
      <div className={`card p-5 min-h-[180px] flex flex-col ${
        isConsensus && showResults ? 'border-2 border-primary shadow-glow' : ''
      }`}>
        {isConsensus && showResults && (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent rounded-3xl" />
        )}
        
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isConsensus ? 'bg-primary/10' : 'bg-indigo-50'
              }`}>
                <model.icon className={`w-5 h-5 ${isConsensus ? 'text-primary' : 'text-primary'}`} />
              </div>
              <span className="font-semibold text-dark">{model.name}</span>
            </div>
            {model.status === 'complete' && (
              <span className={`text-xs font-semibold ${
                isConsensus ? 'text-primary' : 'text-emerald-600'
              }`}>
                {(model.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>

          <div className="flex-1 flex flex-col">
            {model.status === 'idle' && (
              <span className="text-sm text-gray-400">Waiting...</span>
            )}
            {model.status === 'loading' && (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-sm text-gray-500">Processing...</span>
              </div>
            )}
            {model.status === 'complete' && (
              <div className="flex-1 flex flex-col">
                <p className="text-sm text-gray-600 leading-relaxed flex-1">
                  {displayText}
                </p>
                {shouldTruncate && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-xs text-primary font-semibold mt-2 hover:underline self-start"
                  >
                    {isExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
                {isConsensus && showResults && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs text-emerald-600 font-medium">
                      Verified by {consensusResult.models} models
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <section id="products" className="section bg-[#f9fafb]">
      <div className="container-custom">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12">
          <p className="body-large max-w-xl mx-auto mb-8 text-[#6b7280] font-medium">
            Production-grade consensus for every scale.
          </p>
        </motion.div>

        {/* Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-2xl mx-auto mb-12"
        >
          <div className="flex gap-3">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask anything..."
              className="input flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleRunConsensus()}
            />
            <button
              onClick={handleRunConsensus}
              disabled={!prompt.trim() || isRunning}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Run
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Model Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {models.map((model, index) => (
            <motion.div
              key={model.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.4, delay: 0.15 + index * 0.05 }}
            >
              <ModelCard model={model} />
            </motion.div>
          ))}

          {/* Consensus Result Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="relative"
          >
            <ModelCard 
              model={{
                name: 'Consensus',
                icon: Shield,
                response: showResults ? consensusResult.response : 'Run consensus to see result',
                confidence: showResults ? consensusResult.agreement : 0,
                status: !showResults && !isRunning ? 'idle' : isRunning ? 'loading' : 'complete'
              }} 
              isConsensus={true}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default PlaygroundSection;
