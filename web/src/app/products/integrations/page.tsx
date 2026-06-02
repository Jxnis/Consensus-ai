"use client";

import { ThemeProvider } from "@/components/ThemeProvider";
import NavigationNew from "@/components/sections/NavigationNew";
import FooterNew from "@/components/sections/FooterNew";
import IntegrationsSection from "@/components/sections/IntegrationsSection";
import { motion } from "motion/react";

const IntegrationsProductPage = () => (
  <ThemeProvider>
    <main className="bg-background min-h-screen selection:bg-foreground selection:text-background transition-colors duration-500 overflow-x-hidden">
      <NavigationNew />

      <section className="min-h-[70vh] flex flex-col justify-center px-8 pt-32 pb-16">
        <div className="max-w-[1400px] mx-auto w-full">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="mb-8 flex items-center gap-3">
            <span className="inline-block w-2 h-2 bg-foreground" />
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-muted-foreground">Product — Integrations</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9 }} className="font-heading text-[clamp(3rem,10vw,9rem)] leading-[1.02] tracking-[-0.03em] text-foreground">
            Three paths.<br />Same router.
          </motion.h1>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.4 }} className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide mt-12 max-w-2xl">
            The same endpoint underneath. Pick the surface that matches your
            stack — pure HTTP for portability, our typed SDK for batteries-included
            wallet handling, or an MCP server when you live inside Claude Code.
          </motion.p>
        </div>
      </section>

      <IntegrationsSection />

      <section className="py-32 px-8 border-t border-border">
        <div className="max-w-[1100px] mx-auto">
          <div className="mb-12">
            <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">Already an OpenAI shop?</span>
            <h2 className="font-heading text-4xl md:text-5xl text-foreground tracking-[-0.03em] leading-tight mb-6">Migration is a one-line diff.</h2>
            <p className="font-mono text-[12px] text-muted-foreground leading-relaxed tracking-wide max-w-2xl">
              Change <span className="text-foreground">baseURL</span> to <span className="text-foreground">https://api.arcrouter.com/v1</span>.
              Use <span className="text-foreground">model: &quot;auto&quot;</span> and let the router decide,
              or pass an alias like <span className="text-foreground">&quot;claude&quot;</span> /
              <span className="text-foreground"> &quot;gpt&quot;</span> /
              <span className="text-foreground"> &quot;gemini&quot;</span> and it resolves to whichever model currently
              benchmarks best.
            </p>
          </div>

          <pre className="font-mono text-[11px] text-foreground bg-card border border-border p-6 overflow-x-auto leading-relaxed">
{`- const client = new OpenAI({ apiKey: process.env.OPENAI_KEY });
+ const client = new OpenAI({
+   baseURL: "https://api.arcrouter.com/v1",
+   apiKey: "mpp-handled-via-mppx",
+ });

const res = await client.chat.completions.create({
  messages: [{ role: "user", content: prompt }],
- model: "gpt-4o",
+ model: "auto",  // or "claude" / "gpt" / "gemini" / "deepseek"
});

- console.log(res.choices[0].message.content);
+ console.log(res.choices[0].message.content);
+ console.log(res.routing);  // model picked, cost, savings`}
          </pre>
        </div>
      </section>

      <FooterNew />
    </main>
  </ThemeProvider>
);

export default IntegrationsProductPage;
