"use client";

import { useState } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import CouncilLogo from "@/components/CouncilLogo";
import { ArrowRight, Check, Copy, Menu, X } from "lucide-react";
import { motion } from "motion/react";

const sections = [
  { id: "introduction", title: "Introduction" },
  { id: "quickstart", title: "Quickstart" },
  { id: "authentication", title: "Authentication" },
  { id: "api-reference", title: "API Reference" },
  { id: "pricing", title: "Pricing & Limits" },
  { id: "sdks", title: "SDKs" },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("introduction");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const apiUrl = "https://consensus-api.workers.dev/v1/chat/completions";

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setActiveSection(id);
      setMobileMenuOpen(false);
    }
  };

  return (
    <ThemeProvider>
      <div className="bg-background min-h-screen flex selection:bg-foreground selection:text-background">
        {/* Sidebar (Desktop) */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-border fixed h-screen top-0 left-0 bg-background/95 backdrop-blur-sm z-30">
          <div className="p-6 border-b border-border">
            <a href="/" className="flex items-center gap-3 group">
              <CouncilLogo className="w-6 h-6 text-foreground transition-transform duration-500 group-hover:rotate-180" />
              <span className="font-heading font-bold text-lg tracking-tight text-foreground">CouncilRouter</span>
            </a>
          </div>
          <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => scrollTo(section.id)}
                className={`w-full text-left px-4 py-2 rounded-lg font-mono text-[11px] uppercase tracking-wider transition-colors ${
                  activeSection === section.id
                    ? "bg-foreground/5 text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
          <div className="p-6 border-t border-border">
            <a
              href="/"
              className="flex items-center justify-between text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to Home <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </aside>

        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 w-full z-40 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <CouncilLogo className="w-5 h-5 text-foreground" />
              <span className="font-heading font-bold text-sm text-foreground">CouncilRouter</span>
            </a>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 z-30 bg-background pt-20 px-6 space-y-4">
                {sections.map(section => (
                    <button
                        key={section.id}
                        onClick={() => scrollTo(section.id)}
                        className="block w-full text-left py-3 border-b border-border font-mono text-sm text-foreground"
                    >
                        {section.title}
                    </button>
                ))}
            </div>
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 w-full">
          <div className="max-w-4xl mx-auto px-6 py-24 lg:px-12 lg:py-16 space-y-24">
            
            {/* Introduction */}
            <section id="introduction" className="space-y-6">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] block">Documentation</span>
              <h1 className="font-heading text-4xl lg:text-5xl text-foreground tracking-tight">CouncilRouter Docs</h1>
              <p className="text-muted-foreground leading-relaxed max-w-2xl text-lg">
                The world's first verified LLM router. Access the intelligence of multiple models through a single, OpenAI-compatible API endpoint.
              </p>
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => scrollTo("quickstart")}
                  className="px-6 py-3 bg-foreground text-background font-mono text-xs uppercase tracking-wider rounded-lg hover:opacity-90 transition-opacity"
                >
                  Start Building
                </button>
                <a 
                  href="https://github.com/consensus-labs/council-router"
                  className="px-6 py-3 border border-border text-foreground font-mono text-xs uppercase tracking-wider rounded-lg hover:bg-foreground/5 transition-colors"
                >
                    View on GitHub
                </a>
              </div>
            </section>

            {/* Quickstart */}
            <section id="quickstart" className="space-y-8 scroll-mt-24">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-4">Quickstart</h2>
                <p className="text-muted-foreground">Replace your existing OpenAI `baseURL` with ours. That's it.</p>
              </div>

              <div className="bg-[#0a0a0b] border border-white/10 rounded-xl overflow-hidden shadow-sm">
                 <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                    <span className="font-mono text-[10px] text-zinc-500 uppercase">Endpoint URL</span>
                    <button 
                         onClick={copyToClipboard} 
                         className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
                     >
                         {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                         {copied ? "Copied" : "Copy"}
                     </button>
                 </div>
                 <div className="p-4 font-mono text-sm text-zinc-300 break-all select-all">
                     {apiUrl}
                 </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-mono text-sm font-bold text-foreground uppercase tracking-wide">Using OpenAI Node.js SDK</h3>
                <div className="bg-[#0a0a0b] p-6 rounded-xl border border-white/10 overflow-x-auto">
<pre className="text-zinc-300 font-mono text-xs leading-relaxed">
{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiUrl}",
  apiKey: "sk_your_api_key", // Optional for free tier
});

async function main() {
  const completion = await client.chat.completions.create({
    model: "consensus-v1",
    messages: [{ role: "user", content: "Explain quantum supremacy." }],
  });

  console.log(completion.choices[0].message);
}

main();`}
</pre>
                </div>
              </div>
            </section>

            {/* Authentication */}
            <section id="authentication" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">Authentication</h2>
                   <p className="text-muted-foreground">We support three tiers of authentication.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <div className="p-6 border border-border rounded-xl bg-card">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                            <span className="text-emerald-500 text-xs font-bold">01</span>
                        </div>
                        <h3 className="font-heading text-lg mb-2">Free Tier</h3>
                        <p className="text-sm text-muted-foreground mb-4">No API key required. Rate limited to 20 req/hour.</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded">No Header</code>
                    </div>

                    <div className="p-6 border border-border rounded-xl bg-card">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
                            <span className="text-blue-500 text-xs font-bold">02</span>
                        </div>
                        <h3 className="font-heading text-lg mb-2">Developer Key</h3>
                        <p className="text-sm text-muted-foreground mb-4">10k req/hour. Monthly invoice.</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded">Authorization: Bearer sk_...</code>
                    </div>
                </div>
            </section>

             {/* Pricing */}
             <section id="pricing" className="space-y-8 scroll-mt-24">
                <div>
                   <h2 className="font-heading text-2xl text-foreground mb-4">Pricing & Limits</h2>
                </div>

                <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-left text-sm font-mono">
                        <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                            <tr>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Tier</th>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Price</th>
                                <th className="p-4 uppercase tracking-wider text-[10px]">Rate Limit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            <tr>
                                <td className="p-4 font-bold">Free</td>
                                <td className="p-4 text-muted-foreground">$0</td>
                                <td className="p-4 text-muted-foreground">20 / hr</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold text-foreground">Developer</td>
                                <td className="p-4 text-muted-foreground">$0.002 / req</td>
                                <td className="p-4 text-muted-foreground">10,000 / hr</td>
                            </tr>
                            <tr>
                                <td className="p-4 font-bold">Enterprise</td>
                                <td className="p-4 text-muted-foreground">Custom</td>
                                <td className="p-4 text-muted-foreground">Unlimited</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
            
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
