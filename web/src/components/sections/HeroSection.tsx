import { motion } from 'framer-motion';
import { ArrowRight, Activity, Zap, Shield, CheckCircle2 } from 'lucide-react';

const HeroSection = () => {
  const modelStatus = [
    { name: 'GPT-4o mini', status: 'online', latency: '45ms' },
    { name: 'Llama 3.1', status: 'online', latency: '38ms' },
    { name: 'Claude Haiku', status: 'online', latency: '52ms' },
    { name: 'Gemini Flash', status: 'online', latency: '41ms' },
    { name: 'Mistral Small', status: 'online', latency: '35ms' },
  ];

  return (
    <section className="section pt-32 pb-20 sm:pt-40 sm:pb-32">
      <div className="container-custom">
        <div className="flex flex-col items-center text-center">
          {/* Tag */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full text-sm font-medium text-primary">
              <Zap className="w-4 h-4" />
              THE FUTURE OF AI RELIABILITY
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="heading-1 mb-6"
          >
            <span className="block">One prompt.</span>
            <span className="block text-gradient">Multiple models.</span>
            <span className="block">Verified answers.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="body-large max-w-2xl mb-10"
          >
            ConsensusCloud routes your request to a council of models, 
            then returns the answer they agree on—fast, cheap, and auditable.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-wrap gap-4 mb-16"
          >
            <a href="#get-started" className="btn-primary">
              Get started
              <ArrowRight className="w-4 h-4" />
            </a>
            <a href="#docs" className="btn-secondary">
              Read the docs
            </a>
          </motion.div>

          {/* Feature Pills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="flex flex-wrap justify-center gap-3 mb-16"
          >
            <div className="tag">
              <Activity className="w-4 h-4 text-primary" />
              Dynamic council selection
            </div>
            <div className="tag">
              <Zap className="w-4 h-4 text-primary" />
              Racing algorithm
            </div>
            <div className="tag">
              <Shield className="w-4 h-4 text-primary" />
              Semantic verification
            </div>
          </motion.div>

          {/* Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="w-full max-w-3xl"
          >
            <div className="card p-6 sm:p-8 gradient-hero">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-dark">Live model status</h3>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <span className="text-xs font-medium text-emerald-600">LIVE</span>
                </div>
              </div>

              <div className="space-y-3">
                {modelStatus.map((model, index) => (
                  <motion.div
                    key={model.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + index * 0.1 }}
                    className="flex items-center justify-between p-3 bg-white/60 backdrop-blur-sm rounded-2xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium text-dark">{model.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-500 font-mono">{model.latency}</span>
                      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 rounded-full text-xs font-medium text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {model.status}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
