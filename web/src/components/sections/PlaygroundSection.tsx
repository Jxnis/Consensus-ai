import { useState } from 'react';
import { motion } from 'framer-motion';
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

  const [models, setModels] = useState<ModelResponse[]>([
    { name: 'Llama 3', icon: Brain, response: '', confidence: 0, status: 'idle' },
    { name: 'Gemini Flash', icon: Zap, response: '', confidence: 0, status: 'idle' },
    { name: 'Claude Haiku', icon: MessageSquare, response: '', confidence: 0, status: 'idle' },
    { name: 'Mistral Small', icon: Cpu, response: '', confidence: 0, status: 'idle' },
    { name: 'GPT-4o mini', icon: Sparkles, response: '', confidence: 0, status: 'idle' },
  ]);

  const handleRunConsensus = async () => {
    if (!prompt.trim() || isRunning) return;

    setIsRunning(true);
    setShowResults(false);

    // Reset models
    setModels(prev => prev.map(m => ({ ...m, status: 'loading', response: '', confidence: 0 })));

    // Simulate staggered responses
    const sampleResponses = [
      { response: 'The sky appears blue due to Rayleigh scattering of sunlight.', confidence: 0.94 },
      { response: 'Blue light scatters more in the atmosphere, making the sky appear blue.', confidence: 0.96 },
      { response: 'Rayleigh scattering causes shorter blue wavelengths to scatter more.', confidence: 0.92 },
      { response: 'Sunlight interacts with air molecules, scattering blue light preferentially.', confidence: 0.95 },
      { response: 'The atmosphere scatters blue light more than other colors.', confidence: 0.93 },
    ];

    for (let i = 0; i < models.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 400));
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

    setIsRunning(false);
    setShowResults(true);
  };

  const consensusResult = {
    response: 'The sky appears blue due to Rayleigh scattering of sunlight in the atmosphere.',
    agreement: 0.96,
    models: 5,
  };

  return (
    <section id="products" className="section bg-white">
      <div className="container-custom">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="heading-2 mb-4">Try the playground</h2>
          <p className="body-large max-w-xl mx-auto">
            Type a prompt and watch the council vote in real-time.
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
              className="card p-5 min-h-[160px] flex flex-col"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <model.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-semibold text-dark">{model.name}</span>
                </div>
                {model.status === 'complete' && (
                  <span className="text-xs font-semibold text-emerald-600">
                    {(model.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              <div className="flex-1 flex items-center">
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
                  <p className="text-sm text-gray-600 leading-relaxed">{model.response}</p>
                )}
              </div>
            </motion.div>
          ))}

          {/* Consensus Result Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className={`card p-5 min-h-[160px] flex flex-col relative overflow-hidden ${
              showResults ? 'border-2 border-primary shadow-glow' : ''
            }`}
          >
            {showResults && (
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent" />
            )}
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <span className="font-semibold text-dark">Consensus</span>
                </div>
                {showResults && (
                  <span className="text-xs font-semibold text-primary">
                    {(consensusResult.agreement * 100).toFixed(0)}% agreement
                  </span>
                )}
              </div>

              <div className="flex-1 flex items-center">
                {!showResults && !isRunning && (
                  <span className="text-sm text-gray-400">Run consensus to see result</span>
                )}
                {isRunning && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-sm text-gray-500">Aggregating...</span>
                  </div>
                )}
                {showResults && (
                  <div>
                    <p className="text-sm text-gray-700 leading-relaxed mb-2">
                      {consensusResult.response}
                    </p>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-emerald-600 font-medium">
                        Verified by {consensusResult.models} models
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default PlaygroundSection;
