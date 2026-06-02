"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import NavigationNew from "@/components/sections/NavigationNew";
import FooterNew from "@/components/sections/FooterNew";
import OnChainPaymentsSection from "@/components/sections/OnChainPaymentsSection";
import { motion } from "motion/react";

const flow = [
  { n: "01", t: "Client requests", b: "POST /v1/chat/completions with messages and budget. No auth header needed." },
  { n: "02", t: "Server returns 402", b: "WWW-Authenticate: Payment (MPP) and an x402 challenge body. Price is tier-based: SIMPLE $0.001 to PREMIUM $0.015. Council = 5x." },
  { n: "03", t: "Client signs", b: "mppx signs MPP credential. @arcrouter/sdk signs x402 EIP-712. Both run automatically." },
  { n: "04", t: "Retry with credential", b: "Same request with Authorization: Payment OR X-PAYMENT header. Router verifies, charges, then routes to the model." },
  { n: "05", t: "Response + receipt", b: "200 OK with the model output plus Payment-Receipt or X-PAYMENT-RESPONSE header. Cryptographic proof for reconciliation." },
];

const PaymentsProductPage = () => (
  <ThemeProvider>
    <main className="bg-background min-h-screen selection:bg-foreground selection:text-background transition-colors duration-500 overflow-x-hidden">
      <NavigationNew />

      <section className="min-h-[70vh] flex flex-col justify-center px-8 pt-32 pb-16">
        <div className="max-w-[1400px] mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mb-8 flex items-center gap-3"
          >
            <span className="inline-block w-2 h-2 bg-foreground" />
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
              Product — On-Chain Payments
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 }}
            className="font-heading text-[clamp(3rem,10vw,9rem)] leading-[1.02] tracking-[-0.03em] text-foreground"
          >
            Pay per call.<br />USDC. Done.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-12 max-w-2xl"
          >
            Two production payment rails on every endpoint. Your agent advertises
            a wallet, our server advertises a price, the protocol does the rest.
            No Stripe form, no signup wall, no API key rotation.
          </motion.p>
        </div>
      </section>

      <OnChainPaymentsSection />

      <section className="py-32 px-8 border-t border-border">
        <div className="max-w-[1400px] mx-auto">
          <div className="mb-16 max-w-3xl">
            <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
              Payment flow
            </span>
            <h2 className="font-heading text-5xl md:text-6xl text-foreground tracking-[-0.03em] leading-[1.02]">
              Five steps. No state held.
            </h2>
          </div>

          <div className="grid md:grid-cols-5 border-t border-l border-border">
            {flow.map((s) => (
              <div key={s.n} className="border-r border-b border-border p-8 hover:bg-card transition-colors duration-500">
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground block mb-4">{s.n}</span>
                <h3 className="font-heading text-xl text-foreground tracking-[-0.02em] mb-3 leading-tight">{s.t}</h3>
                <p className="font-mono text-[11px] text-muted-foreground leading-relaxed tracking-wide">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32 px-8 border-t border-border">
        <div className="max-w-[1000px] mx-auto text-center">
          <h2 className="font-heading text-4xl md:text-5xl text-foreground tracking-[-0.03em] leading-tight mb-6">
            Ready to test?
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground tracking-wide max-w-xl mx-auto mb-10">
            Free tier needs no wallet. Paid rails take a Tempo or Base USDC
            balance — fund with $0.50 and you can run hundreds of requests.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/docs#authentication" className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 bg-foreground text-background transition-all duration-500 hover:tracking-[0.3em]">
              Read the auth docs
            </a>
            <a href="/#playground" className="font-mono text-[11px] tracking-[0.15em] uppercase px-8 py-4 border border-foreground text-foreground transition-all duration-500 hover:bg-foreground hover:text-background">
              Try free tier
            </a>
          </div>
        </div>
      </section>

      <FooterNew />
    </main>
  </ThemeProvider>
);

export default PaymentsProductPage;
