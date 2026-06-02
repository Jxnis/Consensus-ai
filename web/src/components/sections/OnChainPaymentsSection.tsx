"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

const rails = [
  {
    name: "MPP",
    network: "Tempo",
    chainId: "chainId 4217",
    rfc: "RFC 7235 (HTTP Authorization)",
    asset: "USDC.e",
    finality: "~500ms",
    description:
      "Machine Payments Protocol by Tempo + Stripe. Server advertises price in WWW-Authenticate: Payment, client signs with mppx, retries. Sub-cent payments with fee sponsorship support.",
    header: "Authorization: Payment <credential>",
  },
  {
    name: "x402",
    network: "Base",
    chainId: "chainId 8453",
    rfc: "HTTP 402 Payment Required",
    asset: "USDC",
    finality: "~2s",
    description:
      "Coinbase x402 spec. Standard 402 → EIP-712 typed signature → retry. Compatible with @x402/core, viem, MetaMask, Coinbase Wallet, Phantom (EVM mode).",
    header: "X-PAYMENT <credential>",
  },
];

const OnChainPaymentsSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="payments" className="py-32 px-8 border-t border-border">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-16 max-w-3xl"
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            On-Chain Payments
          </span>
          <h2 className="font-heading text-5xl md:text-7xl text-foreground tracking-[-0.03em] leading-[1.02]">
            Pay-per-call. Wallet-native.
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-6">
            Two production-grade payment rails on every endpoint. No signup, no
            API key, no Stripe form. Your agent points an OpenAI SDK at our URL
            and pays in USDC per request. We advertise the price in the 402,
            verify the signed proof, then return the LLM response.
          </p>
        </motion.div>

        <div ref={ref} className="grid md:grid-cols-2 border-t border-l border-border">
          {rails.map((rail, i) => (
            <motion.div
              key={rail.name}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: i * 0.15 }}
              className="border-r border-b border-border p-10 group"
            >
              <div className="flex items-baseline gap-4 mb-6">
                <h3 className="font-heading text-4xl text-foreground tracking-[-0.02em]">
                  {rail.name}
                </h3>
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
                  {rail.network} · {rail.chainId}
                </span>
              </div>

              <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mb-6">
                {rail.description}
              </p>

              <dl className="grid grid-cols-2 gap-y-3 gap-x-6 mb-6 pt-6 border-t border-border">
                <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Spec</dt>
                <dd className="font-mono text-[11px] text-foreground">{rail.rfc}</dd>
                <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Asset</dt>
                <dd className="font-mono text-[11px] text-foreground">{rail.asset}</dd>
                <dt className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">Finality</dt>
                <dd className="font-mono text-[11px] text-foreground">{rail.finality}</dd>
              </dl>

              <pre className="font-mono text-[11px] text-foreground bg-card border border-border p-4 overflow-x-auto">
                {rail.header}
              </pre>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pt-10 border-t border-border"
        >
          <p className="font-mono text-[11px] text-muted-foreground tracking-wide max-w-xl">
            Dual-rail by design. The 402 challenge advertises both — your client
            picks whichever wallet it holds. Prices stay in parity across rails
            so there is no arbitrage to manage.
          </p>
          <a
            href="/products/on-chain-payments"
            className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background"
          >
            Read the spec
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default OnChainPaymentsSection;
