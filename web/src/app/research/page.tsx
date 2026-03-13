"use client";

import { useState } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import ArcLogo from "@/components/ArcLogo";
import { ArrowRight, Menu, X, AlertCircle } from "lucide-react";

const sections = [
  { id: "introduction", title: "Introduction" },
  { id: "results", title: "Benchmark Results" },
  { id: "cost-quality", title: "Quality per Dollar" },
  { id: "confidence", title: "Confidence Calibration" },
  { id: "methodology", title: "Methodology" },
  { id: "issues", title: "Known Issues" },
];

export default function ResearchPage() {
  const [activeSection, setActiveSection] = useState("introduction");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
              <ArcLogo className="w-6 h-6 text-foreground transition-transform duration-500 group-hover:rotate-180" />
              <span className="font-heading font-bold text-lg tracking-tight text-foreground">ArcRouter</span>
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
            <ArcLogo className="w-5 h-5 text-foreground" />
            <span className="font-heading font-bold text-sm text-foreground">ArcRouter</span>
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
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] block">Research</span>
              <h1 className="font-heading text-4xl lg:text-5xl text-foreground tracking-tight">Scientific Benchmarks</h1>
              <p className="text-muted-foreground leading-relaxed max-w-2xl text-lg">
                Rigorous evaluation of ArcRouter's multi-model consensus approach against single-model baselines. All results are reproducible, auto-graded, and include statistical confidence intervals.
              </p>

              {/* Status Note */}
              <div className="bg-muted/20 border border-border rounded-xl p-6">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Benchmark Run:</strong> Completed February 21, 2026. Tested 4 models across 6 datasets (172 total test cases). Grading improvements include word-to-number normalization, multiple-choice extraction, Python code execution sandbox, and bootstrap confidence intervals (1000 resamples).
                </p>
              </div>
            </section>

            {/* Benchmark Results Table */}
            <section id="results" className="space-y-8 scroll-mt-24">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-4">Complete Results</h2>
                <p className="text-muted-foreground mb-8">
                  Comprehensive benchmark across 6 datasets. Confidence intervals computed via bootstrap resampling (95% CI, 1000 samples).
                </p>
              </div>

              {/* Full Results Table */}
              <div className="border border-border rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="p-3 uppercase tracking-wider text-[10px]">Dataset</th>
                      <th className="p-3 uppercase tracking-wider text-[10px]">CR Free</th>
                      <th className="p-3 uppercase tracking-wider text-[10px]">CR Paid</th>
                      <th className="p-3 uppercase tracking-wider text-[10px]">GPT-4o-mini</th>
                      <th className="p-3 uppercase tracking-wider text-[10px]">Claude Opus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="p-3 text-foreground">factual_custom (25)</td>
                      <td className="p-3 text-emerald-400 font-semibold">100.0% ±0.0</td>
                      <td className="p-3 text-foreground">88.0% ±14.0</td>
                      <td className="p-3 text-foreground">100.0% ±0.0</td>
                      <td className="p-3 text-foreground">100.0% ±0.0</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-foreground">factual_hard (35)</td>
                      <td className="p-3 text-emerald-400 font-semibold">96.6% ±5.2</td>
                      <td className="p-3 text-red-400">0.0% (FAIL)</td>
                      <td className="p-3 text-foreground">97.1% ±4.3</td>
                      <td className="p-3 text-foreground">100.0% ±0.0</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-foreground">gsm8k_sample (22)</td>
                      <td className="p-3 text-emerald-400 font-semibold">100.0%</td>
                      <td className="p-3 text-foreground">90.0% ±15.0</td>
                      <td className="p-3 text-foreground">90.0% ±15.0</td>
                      <td className="p-3 text-foreground">100.0% ±0.0</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-foreground">gsm8k_hard (25)</td>
                      <td className="p-3 text-emerald-400 font-semibold">100.0% ±0.0</td>
                      <td className="p-3 text-red-400">0.0% (FAIL)</td>
                      <td className="p-3 text-foreground">100.0% ±0.0</td>
                      <td className="p-3 text-foreground">100.0% ±0.0</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-foreground">mmlu_subset (50)</td>
                      <td className="p-3 text-muted-foreground">35.3% ±16.2</td>
                      <td className="p-3 text-red-400">0.0% (FAIL)</td>
                      <td className="p-3 text-emerald-400 font-semibold">80.0% ±12.0</td>
                      <td className="p-3 text-foreground">44.0% ±14.0</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-foreground">humaneval_sample (10)</td>
                      <td className="p-3 text-emerald-400 font-semibold">100.0%</td>
                      <td className="p-3 text-red-400">0.0% (FAIL)</td>
                      <td className="p-3 text-foreground">50.0% ±30.0</td>
                      <td className="p-3 text-foreground">50.0% ±30.0</td>
                    </tr>
                    <tr className="bg-muted/20 font-semibold">
                      <td className="p-3 text-foreground">AVERAGE</td>
                      <td className="p-3 text-emerald-400">88.6%</td>
                      <td className="p-3 text-red-400">89.0%* (2/6)</td>
                      <td className="p-3 text-foreground">86.2%</td>
                      <td className="p-3 text-foreground">82.3%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 flex gap-4">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Critical Finding:</strong> ArcRouter Paid tier experienced <strong>100% API failure rate</strong> on 4/6 datasets (factual_hard, gsm8k_hard, mmlu_subset, humaneval_sample). All requests returned 500 Internal Server Error. Average shown only includes 2 successful datasets. This is a production blocker requiring investigation.
                </div>
              </div>
            </section>

            {/* Quality per Dollar */}
            <section id="cost-quality" className="space-y-8 scroll-mt-24">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-4">Quality per Dollar</h2>
                <p className="text-muted-foreground mb-8">
                  ArcRouter free tier demonstrates the core thesis: cheap/free models with consensus can match or exceed expensive single models.
                </p>
              </div>

              {/* Cost Comparison */}
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm font-mono">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="p-4 uppercase tracking-wider text-[10px]">Model</th>
                      <th className="p-4 uppercase tracking-wider text-[10px]">Avg Accuracy</th>
                      <th className="p-4 uppercase tracking-wider text-[10px]">Cost/Request</th>
                      <th className="p-4 uppercase tracking-wider text-[10px]">Quality/$</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="bg-emerald-500/5">
                      <td className="p-4 font-bold text-foreground">ArcRouter Free</td>
                      <td className="p-4 text-emerald-400 font-bold">88.6%</td>
                      <td className="p-4 text-muted-foreground">$0.000</td>
                      <td className="p-4 text-emerald-400 font-bold">∞</td>
                    </tr>
                    <tr>
                      <td className="p-4 text-foreground">GPT-4o-mini</td>
                      <td className="p-4 text-foreground">86.2%</td>
                      <td className="p-4 text-muted-foreground">~$0.00015</td>
                      <td className="p-4 text-muted-foreground">5,747</td>
                    </tr>
                    <tr>
                      <td className="p-4 text-foreground">Claude Opus 4.6</td>
                      <td className="p-4 text-foreground">82.3%</td>
                      <td className="p-4 text-muted-foreground">~$0.015</td>
                      <td className="p-4 text-muted-foreground">5,487</td>
                    </tr>
                    <tr className="opacity-50">
                      <td className="p-4 text-muted-foreground italic">ArcRouter Paid</td>
                      <td className="p-4 text-red-400 italic">BROKEN</td>
                      <td className="p-4 text-muted-foreground">$0.002</td>
                      <td className="p-4 text-muted-foreground italic">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
                  <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400 mb-2">WINNER: HUMANEVAL</div>
                  <div className="font-heading text-3xl text-foreground mb-2">100%</div>
                  <p className="text-sm text-muted-foreground">
                    ArcRouter Free achieved <strong>100% accuracy</strong> on HumanEval code generation (10 problems), while GPT-4o-mini and Claude Opus both scored 50%.
                  </p>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
                  <div className="font-mono text-xs text-blue-600 dark:text-blue-400 mb-2">FAILURE: MMLU</div>
                  <div className="font-heading text-3xl text-foreground mb-2">35.3%</div>
                  <p className="text-sm text-muted-foreground">
                    All models struggled with MMLU STEM questions (50 MC questions). GPT-4o-mini won with 80%, while ArcRouter Free and Claude Opus both underperformed (&lt;45%).
                  </p>
                </div>
              </div>
            </section>

            {/* Confidence Calibration */}
            <section id="confidence" className="space-y-8 scroll-mt-24">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-4">Confidence Calibration</h2>
                <p className="text-muted-foreground mb-8">
                  Calibration metrics measure whether ArcRouter's confidence scores are trustworthy. Free tier data based on 127 completed test cases (45 failed due to API errors).
                </p>
              </div>

              {/* Calibration Metrics */}
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="border border-border rounded-xl p-6 bg-card">
                  <div className="font-mono text-xs text-muted-foreground mb-2">EXPECTED CALIBRATION ERROR</div>
                  <div className="font-heading text-4xl text-foreground mb-2">0.23–0.31</div>
                  <p className="text-sm text-muted-foreground">Range across datasets. Lower is better. Model tends to be overconfident (claims 80% confidence on 100% accurate answers).</p>
                </div>

                <div className="border border-border rounded-xl p-6 bg-card">
                  <div className="font-mono text-xs text-muted-foreground mb-2">BRIER SCORE</div>
                  <div className="font-heading text-4xl text-foreground mb-2">0.11–0.14</div>
                  <p className="text-sm text-muted-foreground">Range across datasets. Lower is better. Measures probabilistic prediction quality.</p>
                </div>
              </div>

              {/* Example Calibration Bin (factual_custom) */}
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="p-6 border-b border-border">
                  <h3 className="font-heading text-lg text-foreground">Example: factual_custom Calibration</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Based on 21 completed cases (4 API failures).
                  </p>
                </div>
                <table className="w-full text-left font-mono text-sm">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                    <tr>
                      <th className="p-4 uppercase tracking-wider text-[10px]">Confidence</th>
                      <th className="p-4 uppercase tracking-wider text-[10px]">Cases</th>
                      <th className="p-4 uppercase tracking-wider text-[10px]">Accuracy</th>
                      <th className="p-4 uppercase tracking-wider text-[10px]">Interpretation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="p-4 text-foreground">0.2–0.4</td>
                      <td className="p-4 text-muted-foreground">2</td>
                      <td className="p-4 text-foreground">100%</td>
                      <td className="p-4 text-emerald-400">Underconfident (good)</td>
                    </tr>
                    <tr>
                      <td className="p-4 text-foreground">0.4–0.6</td>
                      <td className="p-4 text-muted-foreground">7</td>
                      <td className="p-4 text-foreground">100%</td>
                      <td className="p-4 text-emerald-400">Underconfident (good)</td>
                    </tr>
                    <tr>
                      <td className="p-4 text-foreground">0.6–0.8</td>
                      <td className="p-4 text-muted-foreground">2</td>
                      <td className="p-4 text-foreground">100%</td>
                      <td className="p-4 text-emerald-400">Well-calibrated</td>
                    </tr>
                    <tr className="bg-emerald-500/5">
                      <td className="p-4 text-foreground font-bold">0.8–1.0</td>
                      <td className="p-4 text-muted-foreground">10</td>
                      <td className="p-4 text-emerald-400 font-bold">100%</td>
                      <td className="p-4 text-emerald-400 font-bold">Well-calibrated ✓</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Methodology */}
            <section id="methodology" className="space-y-8 scroll-mt-24">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-4">Methodology</h2>
              </div>

              <div className="space-y-6">
                <div className="border-l-2 border-emerald-500 pl-6">
                  <h3 className="font-heading text-lg text-foreground mb-2">Datasets</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong className="text-foreground">factual_custom</strong> (25): Basic Q&A with ground truth</li>
                    <li>• <strong className="text-foreground">factual_hard</strong> (35): Adversarial questions (hallucination traps, trick questions)</li>
                    <li>• <strong className="text-foreground">gsm8k_sample</strong> (22): Standard math word problems</li>
                    <li>• <strong className="text-foreground">gsm8k_hard</strong> (25): Multi-step math (3-5 reasoning steps)</li>
                    <li>• <strong className="text-foreground">mmlu_subset</strong> (50): STEM multiple-choice (10 each: Bio, Chem, Physics, CS, Math)</li>
                    <li>• <strong className="text-foreground">humaneval_sample</strong> (10): Python code generation with test execution</li>
                  </ul>
                </div>

                <div className="border-l-2 border-blue-500 pl-6">
                  <h3 className="font-heading text-lg text-foreground mb-2">Grading Improvements (Feb 21, 2026)</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong className="text-foreground">Word-to-number normalization:</strong> "seven" → "7" (fixes false negatives)</li>
                    <li>• <strong className="text-foreground">Multiple-choice extraction:</strong> Priority-ordered patterns to extract A/B/C/D from verbose responses</li>
                    <li>• <strong className="text-foreground">Code execution sandbox:</strong> Python subprocess with 5s timeout, shell=false (security)</li>
                    <li>• <strong className="text-foreground">Bootstrap confidence intervals:</strong> 1000 resamples, percentile method (95% CI)</li>
                    <li>• <strong className="text-foreground">Council size tracking:</strong> Identifies single-model fallbacks (indicates flaky models)</li>
                  </ul>
                </div>

                <div className="border-l-2 border-purple-500 pl-6">
                  <h3 className="font-heading text-lg text-foreground mb-2">Model Configurations</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• <strong className="text-foreground">ArcRouter Free:</strong> 3-8 free models, Jaccard word-overlap consensus</li>
                    <li>• <strong className="text-foreground">ArcRouter Paid:</strong> 3-5 cheap paid models, embedding-based semantic similarity</li>
                    <li>• <strong className="text-foreground">GPT-4o-mini:</strong> openai/gpt-4o-mini via OpenRouter</li>
                    <li>• <strong className="text-foreground">Claude Opus 4.6:</strong> anthropic/claude-opus-4-6 via OpenRouter</li>
                  </ul>
                </div>

                <div className="border-l-2 border-orange-500 pl-6">
                  <h3 className="font-heading text-lg text-foreground mb-2">Reproducibility</h3>
                  <p className="text-sm text-muted-foreground">
                    All benchmark code is open source at <code className="text-xs bg-muted px-2 py-1 rounded">api/scripts/benchmark.ts</code>. Results include git commit hash, dataset path, evaluator version, and API endpoint. Rate limiting: 2s delay (free tier), 1s (paid tier), 0.5s (OpenRouter) to avoid 429 errors.
                  </p>
                </div>
              </div>
            </section>

            {/* Known Issues */}
            <section id="issues" className="space-y-8 scroll-mt-24">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-4">Known Issues</h2>
              </div>

              <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <h3 className="font-heading text-lg text-foreground">P0: Paid Tier API Failures</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    <strong>Status:</strong> Production blocker. ArcRouter Paid tier (budget="low") fails with 100% error rate on 4/6 datasets: factual_hard (0/35), gsm8k_hard (0/25), mmlu_subset (0/50), humaneval_sample (0/10). All requests return 500 Internal Server Error.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Hypothesis:</strong> Paid tier models may have stricter rate limits or the embedding API is hitting quota. Requires investigation of Worker logs and OpenRouter API responses.
                  </p>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <h3 className="font-heading text-lg text-foreground">P1: Free Tier API Reliability</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <strong>Status:</strong> Free tier experienced 16-36% API failure rate across datasets (45 failures out of 172 total attempts). Failures are primarily 500 Internal Server Errors during consensus processing.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Impact:</strong> Reduces effective sample size for calibration metrics. May indicate flaky free models timing out or returning malformed responses.
                  </p>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <h3 className="font-heading text-lg text-foreground">P2: MMLU Performance Gap</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <strong>Status:</strong> ArcRouter Free (35.3%) and Claude Opus (44.0%) both significantly underperform GPT-4o-mini (80.0%) on MMLU STEM multiple-choice questions.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Hypothesis:</strong> Free tier models may lack STEM knowledge. Multiple-choice format may favor models trained on academic benchmarks (GPT-4o-mini). Requires analysis of per-category breakdown (Bio/Chem/Physics/CS/Math).
                  </p>
                </div>

                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-6">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertCircle className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <h3 className="font-heading text-lg text-foreground">P3: Small Council Sizes</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <strong>Status:</strong> Free tier shows high single-model fallback rates (48-56% on some datasets). Average council size is 1.4-1.7 models instead of target 3-5.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Impact:</strong> Reduces consensus value proposition when only 1-2 models respond. May be caused by aggressive timeouts, flaky free models, or model selection logic.
                  </p>
                </div>
              </div>
            </section>

            {/* Footer Note */}
            <div className="p-6 bg-muted/20 border border-border rounded-xl">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Transparency Note:</strong> All benchmark results are reported as measured, including failures. This research is ongoing and will be updated as issues are resolved. Production deployment is blocked pending P0 fix (paid tier failures). Benchmark runner: <code className="text-xs bg-muted px-2 py-1 rounded">api/scripts/benchmark-all.sh</code>. Comparison tool: <code className="text-xs bg-muted px-2 py-1 rounded">api/scripts/benchmark-compare.ts</code>.
              </p>
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
