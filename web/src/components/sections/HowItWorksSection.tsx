import { motion } from 'framer-motion';
import { Route, Zap, ShieldCheck } from 'lucide-react';

const HowItWorksSection = () => {
  const steps = [
    {
      number: '01',
      title: 'Route',
      description: 'We analyze your prompt and pick the best council of models for the job.',
      icon: Route,
    },
    {
      number: '02',
      title: 'Race',
      description: 'Requests run in parallel. We stop as soon as consensus is reached.',
      icon: Zap,
    },
    {
      number: '03',
      title: 'Verify',
      description: 'Semantic overlap detection confirms agreement before returning the answer.',
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="section bg-white">
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="heading-2 mb-4">How consensus works</h2>
          <p className="body-large max-w-xl mx-auto">
            Three simple steps to verified, reliable AI responses.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="card p-8 hover:shadow-card-hover transition-all duration-300"
            >
              <div className="mb-6">
                <span className="text-7xl sm:text-8xl font-extrabold text-gray-100">
                  {step.number}
                </span>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                  <step.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="heading-3">{step.title}</h3>
              </div>
              <p className="body-regular">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
