import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, ArrowRight, Rocket, Zap, Building2 } from 'lucide-react';

const PricingSection = () => {
  const [isYearly, setIsYearly] = useState(false);

  const plans = [
    {
      name: 'Starter',
      description: 'Perfect for prototyping',
      price: { monthly: 0, yearly: 0 },
      priceLabel: 'Free',
      icon: Rocket,
      features: [
        '1,000 requests/mo',
        '3-model council',
        'Web dashboard',
        'Community support',
        'Basic analytics',
      ],
      cta: 'Start free',
      highlighted: false,
    },
    {
      name: 'Pro',
      description: 'For production workloads',
      price: { monthly: 49, yearly: 39 },
      priceLabel: null,
      icon: Zap,
      features: [
        '50,000 requests/mo',
        '5-model council',
        'Signed outputs',
        'Priority latency',
        'Advanced analytics',
        'API access',
        'Email support',
      ],
      cta: 'Start trial',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      description: 'For large organizations',
      price: { monthly: null, yearly: null },
      priceLabel: 'Custom',
      icon: Building2,
      features: [
        'Unlimited requests',
        'Custom councils',
        'SLA guarantee',
        'Dedicated support',
        'SSO & audit logs',
        'Custom integrations',
        'On-premise option',
      ],
      cta: 'Contact sales',
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="section bg-[#f9fafb]">
      <div className="container-custom">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="heading-2 mb-4">Simple pricing</h2>
          <p className="body-large max-w-xl mx-auto mb-8">
            Start free, scale as you grow.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-1 p-1 bg-white rounded-full border border-gray-200">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                !isYearly
                  ? 'bg-dark text-white'
                  : 'text-gray-600 hover:text-dark'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                isYearly
                  ? 'bg-dark text-white'
                  : 'text-gray-600 hover:text-dark'
              }`}
            >
              Yearly
              <span className={`text-xs px-2 py-0.5 rounded-full ${isYearly ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700'}`}>
                Save 20%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative rounded-4xl p-6 lg:p-8 transition-all duration-300 ${
                plan.highlighted
                  ? 'bg-white border-2 border-primary shadow-glow'
                  : 'bg-white border border-gray-100 shadow-soft hover:shadow-card-hover'
              }`}
            >
              {/* Popular Badge */}
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-full">
                    Most popular
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className="mb-6">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
                  plan.highlighted ? 'bg-primary/10' : 'bg-gray-100'
                }`}>
                  <plan.icon className={`w-6 h-6 ${plan.highlighted ? 'text-primary' : 'text-gray-600'}`} />
                </div>
                <h3 className="font-bold text-xl text-dark mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-500">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                {plan.priceLabel ? (
                  <span className="text-4xl font-bold text-dark">{plan.priceLabel}</span>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-dark">
                      ${isYearly ? plan.price.yearly : plan.price.monthly}
                    </span>
                    <span className="text-gray-500">/mo</span>
                  </div>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-primary' : 'text-emerald-500'}`} />
                    <span className="text-sm text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                className={`w-full py-3.5 rounded-full font-semibold flex items-center justify-center gap-2 transition-all ${
                  plan.highlighted
                    ? 'bg-primary text-white hover:bg-primary-hover'
                    : 'bg-gray-100 text-dark hover:bg-gray-200'
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </div>

        {/* Bottom Note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center text-sm text-gray-500 mt-12"
        >
          All plans include SSL encryption, 99.9% uptime SLA, and automatic upgrades.
        </motion.p>
      </div>
    </section>
  );
};

export default PricingSection;
