"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

const providers = [
  "OpenAI",
  "Anthropic",
  "Google",
  "DeepSeek",
  "xAI",
  "Meta",
  "Mistral",
  "Qwen",
  "Moonshot",
  "Z.AI",
  "MiniMax",
  "OpenRouter",
];

const rails = ["Tempo", "Base", "USDC", "Cloudflare Workers", "MCP"];

const PartnersSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="partners" className="py-32 px-8 border-t border-border">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-16 max-w-3xl"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Networks · Models · Rails
          </span>
          <h2 className="font-heading text-5xl md:text-6xl text-foreground tracking-[-0.03em] leading-[1.02]">
            One endpoint. Every major provider.
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-6 max-w-xl">
            Direct connections to OpenAI, Anthropic, Google, DeepSeek, and xAI
            when keys are configured. OpenRouter fallback covers the long tail.
            Switch providers without changing code — the router resolves model
            aliases to whichever model currently benchmarks best for your topic.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="border-t border-l border-border grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        >
          {providers.map((p) => (
            <div
              key={p}
              className="border-r border-b border-border h-24 flex items-center justify-center hover:bg-card transition-colors duration-500"
            >
              <span className="font-mono text-[12px] tracking-[0.15em] uppercase text-foreground">
                {p}
              </span>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3"
        >
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            Running on
          </span>
          {rails.map((r) => (
            <span
              key={r}
              className="font-mono text-[11px] tracking-[0.1em] text-foreground"
            >
              {r}
            </span>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-24 pt-12 border-t border-border grid md:grid-cols-3 gap-0 border-l"
        >
          <div className="border-r border-b border-border p-10">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-4">
              First MPP integration
            </span>
            <h3 className="font-heading text-2xl text-foreground tracking-[-0.02em] mb-3 leading-tight">
              Frames Websets
            </h3>
            <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide">
              First production integration of MPP — the Tempo + Stripe payment
              protocol — against our endpoint. Agents pay per call in USDC.e on
              Tempo. Proves the dual-rail design end-to-end.
            </p>
          </div>
          <div className="border-r border-b border-border p-10">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-4">
              Want to be next?
            </span>
            <h3 className="font-heading text-2xl text-foreground tracking-[-0.02em] mb-3 leading-tight">
              Pilot program
            </h3>
            <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mb-4">
              Building an agent that needs MPP or x402? Free credits, direct
              founder-to-founder integration support, public co-marketing on
              this site.
            </p>
            <a
              href="mailto:janis.ellerbrock@gmail.com?subject=ArcRouter%20Pilot"
              className="font-mono text-[11px] tracking-[0.15em] uppercase text-foreground hover:underline"
            >
              Email →
            </a>
          </div>
          <div className="border-r border-b border-border p-10">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-4">
              Open source
            </span>
            <h3 className="font-heading text-2xl text-foreground tracking-[-0.02em] mb-3 leading-tight">
              Five public repos
            </h3>
            <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mb-4">
              SDK, MCP server, classifier, and the awesome-arcrouter list — all
              MIT-licensed under the ArcRouterAI org on GitHub. Audit the wire
              format, run it yourself.
            </p>
            <a
              href="https://github.com/ArcRouterAI"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] tracking-[0.15em] uppercase text-foreground hover:underline"
            >
              GitHub →
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default PartnersSection;
