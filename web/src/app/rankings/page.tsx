"use client";

import { useState, useEffect, useMemo } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import ArcLogo from "@/components/ArcLogo";
import { ArrowRight, Menu, X, ChevronUp, ChevronDown, Search } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://consensus-api.janis-ellerbrock.workers.dev";

const DOMAINS = ["code", "math", "science", "writing", "reasoning", "general"] as const;
type Domain = (typeof DOMAINS)[number];

interface ModelScore {
  quality: number;
  value: number;
  rank: number;
}

interface Model {
  id: string;
  name: string;
  provider: string;
  pricing: {
    input_per_1m: number;
    output_per_1m: number;
    is_free: boolean;
  };
  scores: Partial<Record<Domain, ModelScore>>;
  benchmarks: string[];
  last_updated: string;
}

type SortField = "name" | "provider" | "input" | "output" | Domain;
type SortDir = "asc" | "desc";

const sections = [
  { id: "overview", title: "Overview" },
  { id: "rankings", title: "Rankings" },
  { id: "methodology", title: "Methodology" },
];

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "—";
  if (price === 0) return "Free";
  if (price < 0.01) return `$${price.toFixed(4)}`;
  if (price < 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(2)}`;
}

function formatScore(score: number | undefined): string {
  if (score === undefined) return "—";
  return score.toFixed(1);
}

function getBestScore(scores: Partial<Record<Domain, ModelScore>>): number {
  let best = 0;
  for (const domain of DOMAINS) {
    const s = scores[domain];
    if (s && s.quality > best) best = s.quality;
  }
  return best;
}

function getAvgScore(scores: Partial<Record<Domain, ModelScore>>): number {
  const vals: number[] = [];
  for (const domain of DOMAINS) {
    const s = scores[domain];
    if (s) vals.push(s.quality);
  }
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export default function RankingsPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Filters
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<"all" | Domain>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "free" | "paid">("all");
  const [scoredOnly, setScoredOnly] = useState(true);

  // Sort
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch(`${API_URL}/v1/models/scores`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setModels(data.models || []);
        if (data.models?.length > 0) {
          setLastUpdated(data.models[0].last_updated || "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load models");
      } finally {
        setLoading(false);
      }
    }
    fetchModels();
  }, []);

  const filteredModels = useMemo(() => {
    let result = models;

    // Scored only
    if (scoredOnly) {
      result = result.filter(m => Object.keys(m.scores).length > 0);
    }

    // Domain filter
    if (domainFilter !== "all") {
      result = result.filter(m => m.scores[domainFilter] !== undefined);
    }

    // Type filter
    if (typeFilter === "free") {
      result = result.filter(m => m.pricing.is_free);
    } else if (typeFilter === "paid") {
      result = result.filter(m => !m.pricing.is_free);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      if (sortField === "name") {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortField === "provider") {
        aVal = a.provider.toLowerCase();
        bVal = b.provider.toLowerCase();
      } else if (sortField === "input") {
        aVal = a.pricing.input_per_1m ?? 0;
        bVal = b.pricing.input_per_1m ?? 0;
      } else if (sortField === "output") {
        aVal = a.pricing.output_per_1m ?? 0;
        bVal = b.pricing.output_per_1m ?? 0;
      } else {
        // Domain sort — sort by quality score in that domain
        aVal = a.scores[sortField]?.quality ?? -1;
        bVal = b.scores[sortField]?.quality ?? -1;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return result;
  }, [models, search, domainFilter, typeFilter, scoredOnly, sortField, sortDir]);

  const scoredCount = useMemo(() => models.filter(m => Object.keys(m.scores).length > 0).length, [models]);
  const freeCount = useMemo(() => models.filter(m => m.pricing.is_free).length, [models]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const scrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setActiveSection(id);
      setMobileMenuOpen(false);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-foreground" />
      : <ChevronDown className="w-3 h-3 text-foreground" />;
  };

  const ThButton = ({ field, children, className = "" }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th
      className={`p-3 uppercase tracking-wider text-[10px] cursor-pointer hover:text-foreground transition-colors select-none ${className}`}
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        <SortIcon field={field} />
      </span>
    </th>
  );

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

            {/* Filters in sidebar */}
            <div className="pt-6 mt-6 border-t border-border space-y-4">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] px-4 block">Filters</span>

              {/* Domain filter */}
              <div className="px-4 space-y-2">
                <span className="font-mono text-[10px] text-muted-foreground block">Domain</span>
                <div className="flex flex-wrap gap-1">
                  {["all", ...DOMAINS].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDomainFilter(d as "all" | Domain)}
                      className={`px-2 py-1 rounded font-mono text-[10px] transition-colors ${
                        domainFilter === d
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type filter */}
              <div className="px-4 space-y-2">
                <span className="font-mono text-[10px] text-muted-foreground block">Type</span>
                <div className="flex gap-1">
                  {(["all", "free", "paid"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-2 py-1 rounded font-mono text-[10px] transition-colors ${
                        typeFilter === t
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scored only toggle */}
              <div className="px-4">
                <button
                  onClick={() => setScoredOnly(!scoredOnly)}
                  className={`font-mono text-[10px] transition-colors ${
                    scoredOnly ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {scoredOnly ? "[x]" : "[ ]"} Scored only
                </button>
              </div>
            </div>
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
            {/* Mobile filters */}
            <div className="pt-4 space-y-4">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] block">Filters</span>
              <div className="space-y-2">
                <span className="font-mono text-[10px] text-muted-foreground block">Domain</span>
                <div className="flex flex-wrap gap-1">
                  {["all", ...DOMAINS].map((d) => (
                    <button
                      key={d}
                      onClick={() => { setDomainFilter(d as "all" | Domain); setMobileMenuOpen(false); }}
                      className={`px-3 py-1.5 rounded font-mono text-[10px] transition-colors ${
                        domainFilter === d
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="font-mono text-[10px] text-muted-foreground block">Type</span>
                <div className="flex gap-1">
                  {(["all", "free", "paid"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setTypeFilter(t); setMobileMenuOpen(false); }}
                      className={`px-3 py-1.5 rounded font-mono text-[10px] transition-colors ${
                        typeFilter === t
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 w-full">
          <div className="max-w-6xl mx-auto px-6 py-24 lg:px-12 lg:py-16 space-y-24">

            {/* Overview */}
            <section id="overview" className="space-y-6">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] block">Rankings</span>
              <h1 className="font-heading text-4xl lg:text-5xl text-foreground tracking-tight">Model Rankings</h1>
              <p className="text-muted-foreground leading-relaxed max-w-2xl text-lg">
                Live benchmark scores for {models.length} language models. Data aggregated daily from HuggingFace Open LLM Leaderboard, LiveBench, and LiveCodeBench.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border border-border rounded-xl p-6 bg-card">
                  <div className="font-mono text-[10px] text-muted-foreground mb-2">TOTAL MODELS</div>
                  <div className="font-heading text-3xl text-foreground">{loading ? "—" : models.length}</div>
                </div>
                <div className="border border-border rounded-xl p-6 bg-card">
                  <div className="font-mono text-[10px] text-muted-foreground mb-2">SCORED</div>
                  <div className="font-heading text-3xl text-foreground">{loading ? "—" : scoredCount}</div>
                </div>
                <div className="border border-border rounded-xl p-6 bg-card">
                  <div className="font-mono text-[10px] text-muted-foreground mb-2">FREE MODELS</div>
                  <div className="font-heading text-3xl text-foreground">{loading ? "—" : freeCount}</div>
                </div>
                <div className="border border-border rounded-xl p-6 bg-card">
                  <div className="font-mono text-[10px] text-muted-foreground mb-2">LAST UPDATED</div>
                  <div className="font-mono text-sm text-foreground">
                    {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : "—"}
                  </div>
                </div>
              </div>
            </section>

            {/* Rankings Table */}
            <section id="rankings" className="space-y-8 scroll-mt-24">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-4">All Models</h2>
                <p className="text-muted-foreground mb-6">
                  Click column headers to sort. Quality scores are composites from multiple benchmarks per domain (0-100 scale).
                </p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search models..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-lg font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/30 transition-colors"
                />
              </div>

              {/* Mobile filter pills */}
              <div className="lg:hidden flex flex-wrap gap-2">
                {domainFilter !== "all" && (
                  <span className="px-2 py-1 rounded bg-foreground/10 font-mono text-[10px] text-foreground flex items-center gap-1">
                    {domainFilter}
                    <button onClick={() => setDomainFilter("all")} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                  </span>
                )}
                {typeFilter !== "all" && (
                  <span className="px-2 py-1 rounded bg-foreground/10 font-mono text-[10px] text-foreground flex items-center gap-1">
                    {typeFilter}
                    <button onClick={() => setTypeFilter("all")} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                  </span>
                )}
              </div>

              {/* Results count */}
              <div className="font-mono text-[10px] text-muted-foreground">
                {filteredModels.length} model{filteredModels.length !== 1 ? "s" : ""}
              </div>

              {/* Table */}
              {loading ? (
                <div className="border border-border rounded-xl p-12 text-center">
                  <p className="font-mono text-sm text-muted-foreground">Loading models...</p>
                </div>
              ) : error ? (
                <div className="border border-border rounded-xl p-12 text-center">
                  <p className="font-mono text-sm text-red-400">{error}</p>
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                      <tr>
                        <ThButton field="name" className="sticky left-0 bg-muted/50 z-10 min-w-[200px]">Model</ThButton>
                        <ThButton field="provider">Provider</ThButton>
                        <ThButton field="input">Input $/1M</ThButton>
                        <ThButton field="output">Output $/1M</ThButton>
                        {DOMAINS.map(d => (
                          <ThButton key={d} field={d}>{d}</ThButton>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredModels.map((model) => {
                        const bestDomain = Object.entries(model.scores).reduce<{ domain: string; quality: number } | null>(
                          (best, [domain, score]) => {
                            if (!best || score.quality > best.quality) return { domain, quality: score.quality };
                            return best;
                          },
                          null
                        );

                        return (
                          <tr key={model.id} className="hover:bg-foreground/[0.02] transition-colors">
                            <td className="p-3 text-foreground sticky left-0 bg-background z-10 min-w-[200px]">
                              <div className="font-semibold text-xs">{model.name}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{model.id}</div>
                            </td>
                            <td className="p-3 text-muted-foreground">{model.provider}</td>
                            <td className="p-3 text-muted-foreground">{formatPrice(model.pricing.input_per_1m)}</td>
                            <td className="p-3 text-muted-foreground">{formatPrice(model.pricing.output_per_1m)}</td>
                            {DOMAINS.map(d => {
                              const score = model.scores[d];
                              const isBest = bestDomain?.domain === d && score !== undefined;
                              return (
                                <td
                                  key={d}
                                  className={`p-3 ${
                                    score === undefined
                                      ? "text-muted-foreground/30"
                                      : isBest
                                        ? "text-emerald-500 dark:text-emerald-400 font-semibold"
                                        : "text-foreground"
                                  }`}
                                >
                                  {formatScore(score?.quality)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {filteredModels.length === 0 && (
                        <tr>
                          <td colSpan={4 + DOMAINS.length} className="p-8 text-center text-muted-foreground">
                            No models match your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Methodology */}
            <section id="methodology" className="space-y-8 scroll-mt-24">
              <div>
                <h2 className="font-heading text-2xl text-foreground mb-4">Methodology</h2>
              </div>

              <div className="space-y-6">
                <div className="border-l-2 border-emerald-500 pl-6">
                  <h3 className="font-heading text-lg text-foreground mb-2">Data Sources</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li><strong className="text-foreground">HuggingFace Open LLM Leaderboard</strong> — General, reasoning, and science benchmarks across 130+ models</li>
                    <li><strong className="text-foreground">LiveBench</strong> — Monthly refreshed benchmarks for coding, math, reasoning, writing, and data analysis</li>
                    <li><strong className="text-foreground">LiveCodeBench</strong> — Contamination-free code generation benchmark from LeetCode, Codeforces, and AtCoder</li>
                    <li><strong className="text-foreground">OpenRouter</strong> — Real-time pricing data for 345+ models</li>
                  </ul>
                </div>

                <div className="border-l-2 border-blue-500 pl-6">
                  <h3 className="font-heading text-lg text-foreground mb-2">Scoring</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li><strong className="text-foreground">Quality score</strong> — Weighted composite of benchmark results per domain (0-100). Higher is better.</li>
                    <li><strong className="text-foreground">Value score</strong> — Quality adjusted for price. Factors in cost-effectiveness so cheaper models with good scores rank higher.</li>
                    <li><strong className="text-foreground">Domain scores</strong> — Per-domain quality scores. A model may excel at code but be average at writing.</li>
                  </ul>
                </div>

                <div className="border-l-2 border-purple-500 pl-6">
                  <h3 className="font-heading text-lg text-foreground mb-2">How ArcRouter Uses These Scores</h3>
                  <p className="text-sm text-muted-foreground">
                    When you send a query, our semantic routing engine detects the topic, queries the benchmark database for the best-scoring models in that domain, and uses embedding-based reranking to select the optimal model. This means your math question goes to the best math model, your code question goes to the best code model — automatically, at the lowest cost.
                  </p>
                </div>
              </div>

              <div className="bg-muted/20 border border-border rounded-xl p-6">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Data freshness:</strong> Scores are recomputed daily at 06:00 UTC via automated scrapers. Pricing is updated from OpenRouter in real-time. Benchmark data may lag 1-7 days behind source leaderboards.
                </p>
              </div>
            </section>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}
