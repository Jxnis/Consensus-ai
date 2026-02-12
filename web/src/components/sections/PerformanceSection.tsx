import { motion, useInView } from 'motion/react';
import { useRef, useEffect, useState } from 'react';
import { TrendingDown, DollarSign, Clock } from 'lucide-react';

const PerformanceSection = () => {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  const stats = [
    {
      value: 60,
      prefix: '~',
      suffix: '%',
      label: 'Latency reduction',
      description: 'vs single large model',
      icon: TrendingDown,
    },
    {
      value: 40,
      prefix: '~',
      suffix: '%',
      label: 'Cost savings',
      description: 'with council routing',
      icon: DollarSign,
    },
    {
      value: 120,
      prefix: '<',
      suffix: 'ms',
      label: 'Consensus overhead',
      description: 'P99 verification time',
      icon: Clock,
    },
  ];

  return (
    <section ref={sectionRef} className="section bg-indigo-50">
      <div className="container-custom">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="heading-2 mb-4">Faster, cheaper, more reliable</h2>
          <p className="body-large max-w-xl mx-auto">
            Parallel execution plus early stopping means better results at lower cost.
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="card p-8 text-center"
            >
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <stat.icon className="w-7 h-7 text-primary" />
              </div>
              <div className="mb-2">
                <CountUp
                  value={stat.value}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  isInView={isInView}
                  delay={index * 0.2}
                />
              </div>
              <h3 className="font-semibold text-dark text-lg mb-1">{stat.label}</h3>
              <p className="text-gray-500 text-sm">{stat.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// CountUp component for animated numbers
const CountUp = ({ 
  value, 
  prefix = '', 
  suffix = '', 
  isInView, 
  delay = 0 
}: { 
  value: number; 
  prefix?: string; 
  suffix?: string; 
  isInView: boolean;
  delay?: number;
}) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    const timeout = setTimeout(() => {
      const duration = 1500;
      const steps = 60;
      const increment = value / steps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= value) {
          setCount(value);
          clearInterval(timer);
        } else {
          setCount(Math.floor(current));
        }
      }, duration / steps);

      return () => clearInterval(timer);
    }, delay * 1000);

    return () => clearTimeout(timeout);
  }, [isInView, value, delay]);

  return (
    <span className="text-6xl sm:text-7xl lg:text-8xl font-extrabold text-gradient tracking-tight">
      {prefix}{count}{suffix}
    </span>
  );
};

export default PerformanceSection;
