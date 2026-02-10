import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Bot, HeadphonesIcon, BookOpen, Scale, ArrowUpRight } from 'lucide-react';

const UseCasesSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  const useCases = [
    {
      title: 'AI Agents',
      description: 'Give your agent a council of experts so it doesn\'t hallucinate in production.',
      icon: Bot,
      color: 'from-cyan/20 to-cyan/5',
      iconColor: 'text-cyan',
    },
    {
      title: 'Customer Support',
      description: 'Consistent answers across channels, even when models update.',
      icon: HeadphonesIcon,
      color: 'from-violet-500/20 to-violet-500/5',
      iconColor: 'text-violet-400',
    },
    {
      title: 'Research & Summaries',
      description: 'Compare sources, detect drift, and cite with confidence.',
      icon: BookOpen,
      color: 'from-emerald-500/20 to-emerald-500/5',
      iconColor: 'text-emerald-400',
    },
    {
      title: 'Compliance & Finance',
      description: 'Signed outputs and audit trails for high-stakes decisions.',
      icon: Scale,
      color: 'from-amber-500/20 to-amber-500/5',
      iconColor: 'text-amber-400',
    },
  ];

  return (
    <section
      ref={sectionRef}
      className="section-flowing z-[70] py-24 lg:py-32"
    >
      <div className="w-full px-6 lg:px-10">
        <div className="max-w-[1400px] mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-16"
          >
            <h2 className="font-heading font-light text-4xl sm:text-5xl lg:text-6xl text-slate-text mb-4">
              Built for <span className="text-cyan">real workflows</span>
            </h2>
            <p className="text-lg text-slate-muted max-w-2xl mx-auto">
              From AI agents to compliance, ConsensusCloud adapts to your needs.
            </p>
          </motion.div>

          {/* Use cases grid */}
          <div className="grid sm:grid-cols-2 gap-6">
            {useCases.map((useCase, index) => (
              <motion.div
                key={useCase.title}
                initial={{ opacity: 0, y: 40, scale: 0.99 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ 
                  duration: 0.5, 
                  delay: index * 0.1,
                  ease: [0.22, 1, 0.36, 1]
                }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className="glass-card p-6 lg:p-8 group cursor-pointer hover:border-cyan/30 transition-all duration-300 min-h-[280px] flex flex-col"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${useCase.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <useCase.icon className={`w-6 h-6 ${useCase.iconColor}`} />
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-slate-muted opacity-0 group-hover:opacity-100 group-hover:text-cyan transition-all" />
                </div>

                <h3 className="font-heading font-medium text-xl lg:text-2xl text-slate-text mb-3">
                  {useCase.title}
                </h3>
                <p className="text-slate-muted leading-relaxed flex-1">
                  {useCase.description}
                </p>

                <div className="mt-6 pt-4 border-t border-white/[0.06]">
                  <span className="text-sm text-cyan group-hover:underline">
                    Learn more
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default UseCasesSection;
