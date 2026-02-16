import { motion, useInView } from "motion/react";
import { useRef } from "react";

const AbstractCirclesSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-32 px-8 overflow-hidden" ref={ref}>
      <div className="max-w-[1200px] mx-auto relative flex items-center justify-center min-h-[400px]">
        {/* Animated circles */}
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={inView ? { scale: 1, opacity: 1 } : {}}
            transition={{ duration: 1.2, delay: i * 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute border border-border rounded-full"
            style={{
              width: `${280 + i * 20}px`,
              height: `${280 + i * 20}px`,
              left: `calc(50% - ${140 + i * 10}px + ${(i - 1.5) * 80}px)`,
              top: `calc(50% - ${140 + i * 10}px)`,
            }}
          />
        ))}

        {/* Center text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="relative z-10 text-center max-w-2xl"
        >
          <h2 className="font-heading text-4xl md:text-6xl text-foreground tracking-[-0.03em] leading-[1.1]">
            Multiple models verify so you don't have to.
          </h2>
        </motion.div>
      </div>
    </section>
  );
};

export default AbstractCirclesSection;
