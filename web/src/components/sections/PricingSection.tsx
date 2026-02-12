'use client';

import { motion } from 'motion/react';
import { Rocket, Zap, Building2, ArrowRight, Check, Gift } from 'lucide-react';

const PricingSection = () => {
  const plans = [
    {
      name: 'Free',
      description: 'Try it now — no signup',
      priceLabel: '$0',
      unit: '/ forever',
      icon: Gift,
      features: [
        '3 free-tier models',
        'Consensus verification',
        '20 requests / hour',
        'No API key required',
        'Community support',
      ],
      cta: 'Try Playground',
      href: '#products',
      highlighted: false,
    },
    {
      name: 'Developer',
      description: 'Startups & AI Agents',
      priceLabel: '$0.002',
      unit: '/ request',
      icon: Rocket,
      features: [
        '3-5 smart models',
        'Chairman synthesis',
        '1,000 req / hour',
        'API key access',
        'x402 micropayments (USDC)',
      ],
      cta: 'View Docs',
      href: '/docs',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      description: 'Legal & Compliance',
      priceLabel: 'Custom',
      unit: '',
      icon: Building2,
      features: [
        'Custom model selection',
        'Audit trail & logging',
        'Dedicated SLA',
        'White-glove support',
        'Self-hosted option',
      ],
      cta: 'Contact Sales',
      href: 'mailto:sales@consensuscloud.ai?subject=Enterprise Plan Inquiry&body=Hi, I would like to discuss the Enterprise plan for my organization.%0D%0A%0D%0ACompany:%0D%0AUse case:%0D%0AExpected requests/month:%0D%0A',
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="section bg-[#f9fafb] dark:bg-[#0a0a0b]">
      <div className="container-custom">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="heading-2 mb-4 text-[#111827] dark:text-gray-50">Simple, Transparent Pricing.</h2>
          <p className="body-large max-w-xl mx-auto text-[#6b7280] font-medium">
            Start free. Scale with API keys or pay per request with USDC.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative rounded-3xl p-8 transition-all duration-300 ${
                plan.highlighted
                  ? 'bg-white dark:bg-[#18181b] border-2 border-[#2835f8] shadow-2xl shadow-[#2835f8]/10 scale-105'
                  : 'bg-white dark:bg-[#18181b] border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl'
              }`}
            >
              {/* Popular Badge */}
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1.5 bg-[#2835f8] text-white text-xs font-black rounded-full uppercase tracking-widest">
                    Best Value
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className="mb-8">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
                  plan.highlighted ? 'bg-[#2835f8]/10' : 'bg-[#f9fafb]'
                }`}>
                  <plan.icon className={`w-7 h-7 ${plan.highlighted ? 'text-[#2835f8]' : 'text-gray-400'}`} />
                </div>
                <h3 className="font-bold text-2xl text-[#111827] dark:text-gray-50 mb-2">{plan.name}</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium leading-relaxed">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black text-[#111827] dark:text-gray-50">
                    {plan.priceLabel}
                  </span>
                  {plan.unit && <span className="text-gray-400 font-bold">{plan.unit}</span>}
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-10">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-[#2835f8]' : 'text-emerald-500'}`} />
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-medium leading-tight">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href={plan.href}
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 ${
                  plan.highlighted
                    ? 'bg-[#2835f8] text-white hover:bg-[#222eda]'
                    : 'bg-[#111827] text-white hover:bg-gray-800'
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4" />
              </a>
            </motion.div>
          ))}
        </div>

        {/* Bottom Note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center text-sm text-gray-400 font-bold uppercase tracking-widest mt-20"
        >
          No Credit Card Required · Pay with USDC on Base
        </motion.p>
      </div>
    </section>
  );
};

export default PricingSection;
