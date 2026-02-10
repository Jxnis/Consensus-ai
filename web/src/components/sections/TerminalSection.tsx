import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Clock, CheckCircle2 } from 'lucide-react';

const TerminalSection = () => {
  const [activeTab, setActiveTab] = useState<'single' | 'consensus'>('consensus');

  const singleModelOutput = `{
  "answer": "The capital of France is Paris.",
  "confidence": 0.92,
  "sources": ["wikipedia"],
  "latency_ms": 845
}`;

  const consensusOutput = `{
  "answer": "The capital of France is Paris.",
  "confidence": 0.98,
  "agreement_ratio": 0.95,
  "council": ["gpt-4o", "llama-3", "claude-haiku"],
  "latency_ms": 342,
  "verification": {
    "semantic_overlap": 0.97,
    "token_consensus": true
  }
}`;

  return (
    <section className="section bg-gray-100">
      <div className="container-custom">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left side - Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="heading-2 mb-6">
              Compare.
              <br />
              <span className="text-gradient">Validate.</span>
              <br />
              Ship.
            </h2>
            <p className="body-large mb-8">
              See how single-model outputs drift—and how consensus tightens the answer.
            </p>
            <div className="flex flex-wrap gap-3">
              <div className="tag">
                <Terminal className="w-4 h-4 text-primary" />
                Live diff view
              </div>
              <div className="tag">
                <Clock className="w-4 h-4 text-primary" />
                Latency tracking
              </div>
              <div className="tag">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                Token overlap
              </div>
            </div>
          </motion.div>

          {/* Right side - Terminal */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="card overflow-hidden">
              {/* Terminal Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-mono text-gray-500">comparison.json</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100">
                <button
                  onClick={() => setActiveTab('single')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-all ${
                    activeTab === 'single'
                      ? 'text-dark border-b-2 border-primary bg-white'
                      : 'text-gray-500 hover:text-dark hover:bg-gray-50'
                  }`}
                >
                  Single model
                </button>
                <button
                  onClick={() => setActiveTab('consensus')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-all ${
                    activeTab === 'consensus'
                      ? 'text-dark border-b-2 border-primary bg-white'
                      : 'text-gray-500 hover:text-dark hover:bg-gray-50'
                  }`}
                >
                  Consensus
                </button>
              </div>

              {/* Terminal Content */}
              <div className="p-6 bg-white">
                {/* Prompt */}
                <div className="mb-4 font-mono text-sm">
                  <span className="text-primary">$</span>{' '}
                  <span className="text-gray-600">prompt:</span>{' '}
                  <span className="text-gray-400">"What is the capital of France?"</span>
                </div>

                {/* Output */}
                <div className="relative">
                  <AnimatePresence mode="wait">
                    <motion.pre
                      key={activeTab}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="font-mono text-sm leading-relaxed overflow-x-auto"
                    >
                      <code className="text-dark">
                        {activeTab === 'single' ? singleModelOutput : consensusOutput}
                      </code>
                    </motion.pre>
                  </AnimatePresence>

                  {/* Metrics */}
                  <div className="absolute top-0 right-0 flex flex-col gap-2">
                    <div className="px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-xs text-gray-500 block">Latency</span>
                      <span className="text-sm font-semibold text-dark">
                        {activeTab === 'single' ? '845ms' : '342ms'}
                      </span>
                    </div>
                    <div className="px-3 py-2 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-xs text-gray-500 block">Confidence</span>
                      <span className={`text-sm font-semibold ${activeTab === 'single' ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {activeTab === 'single' ? '92%' : '98%'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Key Differences */}
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Key differences</span>
                    <span className="text-xs font-medium text-primary">
                      {activeTab === 'consensus' ? 'Consensus verified' : 'Single source'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {activeTab === 'consensus' ? (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-gray-600">Agreement ratio: 95%</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-gray-600">Semantic overlap: 97%</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-gray-600">Token consensus: verified</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center">
                            <span className="text-amber-600 text-xs">!</span>
                          </div>
                          <span className="text-gray-600">Single point of failure</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-4 h-4 rounded-full bg-amber-100 flex items-center justify-center">
                            <span className="text-amber-600 text-xs">!</span>
                          </div>
                          <span className="text-gray-600">No verification layer</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Terminal Footer */}
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs font-mono text-gray-400">
                  Live diff view • latency • token overlap
                </span>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  <span className="text-xs font-mono text-primary">LIVE</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default TerminalSection;
