import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Shield, FileSignature, ScrollText, Database, RefreshCw, Lock, CheckCircle } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const SecuritySection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const checklistRef = useRef<HTMLDivElement>(null);

  const features = [
    {
      title: 'Signed responses',
      description: 'EIP-712 signatures for every model output.',
      icon: FileSignature,
      color: 'text-cyan',
      bgColor: 'from-cyan/20 to-cyan/5',
    },
    {
      title: 'Semantic audit log',
      description: 'See exactly why the council agreed.',
      icon: ScrollText,
      color: 'text-violet-400',
      bgColor: 'from-violet-500/20 to-violet-500/5',
    },
    {
      title: 'Edge cache',
      description: 'Sub-millisecond cache hits on repeated prompts.',
      icon: Database,
      color: 'text-emerald-400',
      bgColor: 'from-emerald-500/20 to-emerald-500/5',
    },
    {
      title: 'Fallback routing',
      description: 'Auto-retry with alternate models if a provider lags.',
      icon: RefreshCw,
      color: 'text-amber-400',
      bgColor: 'from-amber-500/20 to-amber-500/5',
    },
  ];

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      const scrollTl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=130%',
          pin: true,
          scrub: 0.6,
        },
      });

      // ENTRANCE (0% - 30%)
      scrollTl.fromTo(
        visualRef.current,
        { x: '-55vw', opacity: 0, scale: 0.96 },
        { x: 0, opacity: 1, scale: 1, ease: 'none' },
        0
      );

      scrollTl.fromTo(
        checklistRef.current,
        { x: '55vw', opacity: 0 },
        { x: 0, opacity: 1, ease: 'none' },
        0
      );

      // SETTLE (30% - 70%) - hold

      // EXIT (70% - 100%)
      scrollTl.fromTo(
        visualRef.current,
        { x: 0, opacity: 1 },
        { x: '-18vw', opacity: 0, ease: 'power2.in' },
        0.7
      );

      scrollTl.fromTo(
        checklistRef.current,
        { x: 0, opacity: 1 },
        { x: '18vw', opacity: 0, ease: 'power2.in' },
        0.7
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="section-pinned flex items-center justify-center z-[60]"
    >
      <div className="w-full h-full flex items-center px-6 lg:px-10 py-20">
        <div className="w-full max-w-[1600px] mx-auto grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Left side - Visual */}
          <div
            ref={visualRef}
            className="glass-card p-8 lg:p-12 relative overflow-hidden min-h-[400px] lg:min-h-[500px] flex items-center justify-center"
          >
            {/* Animated background */}
            <div className="absolute inset-0">
              <div className="absolute top-1/3 left-1/3 w-40 h-40 bg-cyan/10 rounded-full blur-3xl animate-pulse-glow" />
              <div className="absolute bottom-1/3 right-1/3 w-48 h-48 bg-cyan/5 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1.5s' }} />
            </div>

            {/* Security visualization */}
            <div className="relative z-10 flex flex-col items-center">
              <div className="relative">
                {/* Central shield */}
                <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-cyan/30 to-cyan/10 border border-cyan/40 flex items-center justify-center glow-cyan">
                  <Shield className="w-14 h-14 text-cyan" />
                </div>
                
                {/* Orbiting security icons */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-14 h-14 rounded-xl bg-navy-800 border border-white/10 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-14 h-14 rounded-xl bg-navy-800 border border-white/10 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-cyan" />
                </div>
                <div className="absolute top-1/2 -translate-y-1/2 -left-6 w-14 h-14 rounded-xl bg-navy-800 border border-white/10 flex items-center justify-center">
                  <FileSignature className="w-6 h-6 text-violet-400" />
                </div>
                <div className="absolute top-1/2 -translate-y-1/2 -right-6 w-14 h-14 rounded-xl bg-navy-800 border border-white/10 flex items-center justify-center">
                  <Database className="w-6 h-6 text-amber-400" />
                </div>

                {/* Connection rings */}
                <svg className="absolute inset-0 w-28 h-28 pointer-events-none" style={{ transform: 'scale(2.5)' }}>
                  <circle
                    cx="56"
                    cy="56"
                    r="50"
                    fill="none"
                    stroke="rgba(41, 185, 255, 0.1)"
                    strokeWidth="1"
                    strokeDasharray="8 8"
                    className="animate-spin"
                    style={{ animationDuration: '30s' }}
                  />
                </svg>
                <svg className="absolute inset-0 w-28 h-28 pointer-events-none" style={{ transform: 'scale(1.8)' }}>
                  <circle
                    cx="56"
                    cy="56"
                    r="50"
                    fill="none"
                    stroke="rgba(41, 185, 255, 0.15)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    className="animate-spin"
                    style={{ animationDuration: '20s', animationDirection: 'reverse' }}
                  />
                </svg>
              </div>

              <p className="mt-20 text-center text-slate-muted text-sm max-w-xs">
                Every response is cryptographically signed and auditable
              </p>
            </div>
          </div>

          {/* Right side - Checklist */}
          <div ref={checklistRef} className="space-y-4">
            <h2 className="font-heading font-light text-3xl lg:text-4xl text-slate-text mb-8">
              Verify every answer.
            </h2>

            {features.map((feature) => (
              <div
                key={feature.title}
                className="glass-card p-5 group hover:border-cyan/30 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.bgColor} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                    <feature.icon className={`w-5 h-5 ${feature.color}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-heading font-medium text-lg text-slate-text mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-slate-muted leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SecuritySection;
