import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";

const singleModelCode = `$ query: "Scan sub-processor agreement for liability shifts."

{
  "analysis": "Liability limited to direct damages. 
    Standard indemnification applies.",
  "risk_score": 3,
  "verification": null,
  "confidence": null,
  "model": "gpt-4o"
}`;

const consensusCode = `$ query: "Scan sub-processor agreement for liability shifts."

{
  "analysis": "CRITICAL: Liability cap excludes data breach. 
    Indemnity clause is one-sided (Vendor only).",
  "risk_score": 8,
  "verification": {
    "semantic_overlap": 0.91,
    "council_agreement": true,
    "flagged_by": ["llama-3.1-70b", "gemini-flash"]
  },
  "confidence": 0.94,
  "council": ["llama-3.1-70b", "gemini-flash", "qwen-2.5"],
  "agreement_ratio": 0.94
}`;

const CodeComparisonSection = () => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [activeTab, setActiveTab] = useState<"single" | "consensus">("consensus");

  return (
    <section className="py-32 px-8">
      <div className="max-w-[1200px] mx-auto grid md:grid-cols-2 gap-16 items-center">
        {/* Left side */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, x: -40 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <span className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase block mb-4">
            Compare
          </span>
          <h2 className="font-heading text-5xl md:text-6xl text-foreground tracking-[-0.03em] mb-6">
            Compare.<br />Validate.<br />Ship.
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mb-8">
            See how single-model outputs drift—and how consensus tightens the answer.
          </p>
          <div className="flex gap-3 flex-wrap">
            {["Confidence score", "Model agreement", "Token overlap"].map((label) => (
              <span
                key={label}
                className="font-mono text-[10px] tracking-wide px-4 py-2 border border-border text-muted-foreground rounded-full"
              >
                {label}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Right side — code block */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="bg-card border border-border rounded-lg overflow-hidden"
        >
          {/* Title bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">›_</span>
              <span className="font-mono text-[11px] text-foreground">comparison.json</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-destructive/60" />
              <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
              <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab("single")}
              className={`flex-1 font-mono text-[11px] tracking-wide py-3 transition-colors duration-300 ${
                activeTab === "single"
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Single model
            </button>
            <button
              onClick={() => setActiveTab("consensus")}
              className={`flex-1 font-mono text-[11px] tracking-wide py-3 transition-colors duration-300 ${
                activeTab === "consensus"
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Consensus
            </button>
          </div>

          {/* Code content */}
          <div className="p-5 relative min-h-[320px]">
            <pre className="font-mono text-[11px] leading-[1.8] text-foreground whitespace-pre-wrap">
              {activeTab === "single" ? singleModelCode : consensusCode}
            </pre>

            {activeTab === "consensus" && (
              <div className="absolute top-5 right-5 flex flex-col gap-2">
                <div className="bg-background border border-border rounded px-3 py-1.5 text-center">
                  <span className="font-mono text-[9px] text-muted-foreground block">Agreement</span>
                  <span className="font-heading text-sm text-foreground">94%</span>
                </div>
                <div className="bg-background border border-border rounded px-3 py-1.5 text-center">
                  <span className="font-mono text-[9px] text-muted-foreground block">Confidence</span>
                  <span className="font-heading text-sm text-foreground">0.94</span>
                </div>
              </div>
            )}
          </div>

          {/* Key differences footer */}
          {activeTab === "consensus" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="border-t border-border px-5 py-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
                  Key Differences
                </span>
                <span className="font-mono text-[10px] text-foreground">Council verified</span>
              </div>
              <div className="space-y-1.5">
                {["Agreement ratio: 94%", "Semantic overlap: 91%", "Council size: 3 models"].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-foreground" />
                    <span className="font-mono text-[11px] text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Bottom bar — no fake LIVE indicator */}
          <div className="border-t border-border px-5 py-3 flex items-center justify-between">
            <span className="font-mono text-[9px] text-muted-foreground">
              Illustrative example • real responses will vary
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CodeComparisonSection;
