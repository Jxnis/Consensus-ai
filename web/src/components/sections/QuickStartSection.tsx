import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";
import { Copy, Check } from "lucide-react";

const tabs = [
  {
    id: "api",
    label: "API",
    comment: "# Drop-in OpenAI replacement. Works everywhere.",
    prefix: "$",
    value: "https://api.arcrouter.com/v1/chat/completions",
  },
  {
    id: "sdk",
    label: "SDK",
    comment: "# TypeScript SDK — smart routing + x402 micropayments",
    prefix: "$",
    value: "npm install @arcrouter/sdk",
  },
  {
    id: "mcp",
    label: "MCP",
    comment: "# Add to Claude Code, Cursor, or Cline in one command",
    prefix: "$",
    value: "claude mcp add arcrouter --transport http https://api.arcrouter.com/mcp",
  },
];

const QuickStartSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("api");

  const active = tabs.find(t => t.id === activeTab)!;

  const handleCopy = () => {
    navigator.clipboard.writeText(active.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-32 px-8">
      <div className="max-w-[1000px] mx-auto">
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="mb-8"
        >
            {/* Terminal Container - Theme Aware */}
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-2xl relative group transition-colors duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    </div>
                    {/* Tabs */}
                    <div className="flex items-center gap-1">
                        {tabs.map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setCopied(false); }}
                            className={`font-mono text-[10px] tracking-[0.15em] px-3 py-1 rounded-md uppercase transition-colors duration-200 ${
                              activeTab === tab.id
                                ? "bg-foreground text-background"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                    </div>
                    <div className="w-16" />
                </div>

                {/* Content */}
                <div className="p-6 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-4 font-mono text-sm md:text-base w-full">
                        <div className="text-muted-foreground text-xs md:text-sm">
                            <span>{active.comment}</span>
                        </div>
                        <div className="flex items-center gap-3 text-foreground bg-muted/40 p-5 rounded-lg border border-border">
                            <span className="text-green-600 dark:text-green-500 select-none">{active.prefix}</span>
                            <span className="break-all">{active.value}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleCopy}
                        className="absolute right-4 bottom-4 md:static md:self-end px-5 py-2.5 bg-muted hover:bg-muted/80 border border-border rounded-lg text-xs font-mono text-foreground transition-colors flex items-center gap-2"
                    >
                        {copied ? <Check size={14} className="text-green-600 dark:text-green-500" /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
            </div>

            <p className="mt-6 text-center text-xs font-mono text-muted-foreground">
                Compatible with OpenAI SDKs, Claude Code, Cursor, Cline, and all OpenAI-compatible tools.
            </p>
        </motion.div>
      </div>
    </section>
  );
};

export default QuickStartSection;
