/**
 * Content Curator
 *
 * Fetches trending AI/LLM/routing topics from multiple sources:
 *   - HackerNews (top stories + newest)
 *   - Reddit (5 subreddits)
 *   - ArXiv cs.AI
 *   - Polymarket AI prediction markets
 *   - RSS feeds: TechCrunch AI, The Verge AI, Axios, CoinDesk, OpenAI Blog
 *   - HuggingFace daily papers
 *
 * Scores by relevance + source popularity.
 * Stores top N topics to KV for the generator to pick up.
 *
 * Expected schedule: Runs daily at 6am UTC via cron.
 */

import { Env, Topic } from "./types.js";

const MAX_TOPICS = 12; // Increased from 8 — more sources = more quality picks
const KV_TTL = 60 * 60 * 48; // 48h — topics expire after 2 days

// ─── Relevance Scoring ───────────────────────────────────────────────────────

const KEYWORDS = {
  high: [
    "llm", "llm routing", "model routing", "ai router",
    "benchmark", "evals", "model selection",
    "token cost", "api cost", "inference cost",
    "multi-agent", "agentic", "mcp", "model context protocol",
    "openrouter", "arcrouter", "litellm",
    "claude", "gpt-4", "gpt-5", "gemini",
    "prompt engineering", "context window",
  ],
  medium: [
    "ai", "openai", "anthropic", "google ai", "deepseek",
    "language model", "transformer", "fine-tuning",
    "inference", "api", "developer", "devtools",
    "automation", "agent", "workflow",
    "x402", "crypto payments", "stablecoin",
    "prediction market", "polymarket",
    "base chain", "coinbase",
  ],
  low: [
    "machine learning", "neural network", "model",
    "software", "coding", "tech", "startup",
    "crypto", "blockchain", "web3", "defi",
  ],
} as const;

function scoreRelevance(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of KEYWORDS.high)   if (lower.includes(kw)) score += 0.35;
  for (const kw of KEYWORDS.medium) if (lower.includes(kw)) score += 0.15;
  for (const kw of KEYWORDS.low)    if (lower.includes(kw)) score += 0.05;
  return Math.min(score, 1.0);
}

// ─── HackerNews ──────────────────────────────────────────────────────────────

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  type?: string;
}

async function fetchHNStories(endpoint: string, label: string): Promise<Topic[]> {
  const topics: Topic[] = [];

  try {
    const ids = await fetch(`https://hacker-news.firebaseio.com/v0/${endpoint}.json`, {
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.json()) as number[];

    // Fetch top 40 in parallel batches of 10
    const batches = [ids.slice(0, 10), ids.slice(10, 20), ids.slice(20, 30), ids.slice(30, 40)];

    for (const batch of batches) {
      const items = await Promise.allSettled(
        batch.map((id) =>
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
            signal: AbortSignal.timeout(4000),
          }).then((r) => r.json() as Promise<HNItem>)
        )
      );

      for (const result of items) {
        if (result.status !== "fulfilled" || !result.value?.title) continue;
        const item = result.value;
        if (item.type !== "story") continue;

        const relevance = scoreRelevance(item.title + " " + (item.text || ""));
        if (relevance < 0.2) continue;

        topics.push({
          id: `hn-${item.id}`,
          title: item.title!,
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          source: "hn",
          score: item.score || 0,
          relevance,
          fetched_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error(`[Curator] HN ${label} failed:`, err instanceof Error ? err.message : err);
  }

  return topics;
}

async function fetchHackerNews(): Promise<Topic[]> {
  // Fetch both top stories and newest in parallel
  const [top, newest] = await Promise.all([
    fetchHNStories("topstories", "top"),
    fetchHNStories("newstories", "newest"),
  ]);

  // Dedup by ID (a story can appear in both)
  const seen = new Set<string>();
  const combined: Topic[] = [];
  for (const t of [...top, ...newest]) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      combined.push(t);
    }
  }
  return combined;
}

// ─── Reddit ───────────────────────────────────────────────────────────────────

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    score: number;
    permalink: string;
    url: string;
    is_self: boolean;
  };
}

async function fetchReddit(): Promise<Topic[]> {
  const topics: Topic[] = [];
  const subreddits = [
    "LocalLLaMA",
    "MachineLearning",
    "artificial",
    "ChatGPT",
    "ClaudeAI",
  ];

  for (const sub of subreddits) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25`, {
        headers: { "User-Agent": "ArcRouter-ContentBot/1.0 (by ArcRouter)" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.error(`[Curator] Reddit r/${sub} returned ${res.status}`);
        continue;
      }

      const data = await res.json() as { data: { children: RedditPost[] } };

      for (const { data: post } of data.data.children) {
        if (!post.title) continue;

        const relevance = scoreRelevance(post.title + " " + (post.is_self ? post.selftext : ""));
        if (relevance < 0.2) continue;

        topics.push({
          id: `reddit-${post.id}`,
          title: post.title,
          url: `https://reddit.com${post.permalink}`,
          source: "reddit",
          score: post.score,
          relevance,
          fetched_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[Curator] Reddit r/${sub} failed:`, err instanceof Error ? err.message : err);
    }
  }

  return topics;
}

// ─── ArXiv ────────────────────────────────────────────────────────────────────

function parseRssItems(xml: string): { title: string; link: string; description?: string }[] {
  const items: { title: string; link: string; description?: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemContent = itemMatch[1];
    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(itemContent);
    const linkMatch = /<link>(.*?)<\/link>/.exec(itemContent);
    const descMatch = /<description>([\s\S]*?)<\/description>/.exec(itemContent);

    if (titleMatch && linkMatch) {
      const title = titleMatch[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .trim();
      const description = descMatch?.[1]
        ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        ?.replace(/<[^>]+>/g, "") // Strip HTML tags
        ?.trim();
      items.push({ title, link: linkMatch[1].trim(), description });
    }
  }

  return items;
}

async function fetchArxiv(): Promise<Topic[]> {
  const topics: Topic[] = [];

  try {
    const xml = await fetch("https://export.arxiv.org/rss/cs.AI", {
      headers: { "Accept": "application/rss+xml" },
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.text());

    const papers = parseRssItems(xml).slice(0, 20);

    for (const { title, link } of papers) {
      if (!title) continue;
      const relevance = scoreRelevance(title);
      if (relevance < 0.2) continue;

      topics.push({
        id: `arxiv-${encodeURIComponent(link)}`,
        title,
        url: link,
        source: "arxiv",
        score: 0,
        relevance,
        fetched_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[Curator] ArXiv fetch failed:", err instanceof Error ? err.message : err);
  }

  return topics;
}

// ─── Polymarket AI Markets ───────────────────────────────────────────────────

interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  volume: number;
  active: boolean;
  markets: Array<{
    question: string;
    outcomePrices: string; // JSON stringified array e.g. '["0.73","0.27"]'
  }>;
}

async function fetchPolymarket(): Promise<Topic[]> {
  const topics: Topic[] = [];

  try {
    const res = await fetch(
      "https://gamma-api.polymarket.com/events?tag_slug=ai&active=true&limit=15&order=volume24hr&ascending=false",
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) {
      console.error(`[Curator] Polymarket returned ${res.status}`);
      return topics;
    }

    const events = await res.json() as PolymarketEvent[];

    for (const event of events) {
      if (!event.title || !event.active) continue;

      // Parse probability from the first market's outcome prices
      let probability = "";
      if (event.markets?.[0]?.outcomePrices) {
        try {
          const prices = JSON.parse(event.markets[0].outcomePrices) as string[];
          if (prices[0]) {
            const pct = Math.round(parseFloat(prices[0]) * 100);
            probability = ` (${pct}% probability)`;
          }
        } catch { /* ignore parse errors */ }
      }

      const titleWithProb = `${event.title}${probability}`;
      const searchText = `${event.title} ${event.description}`;
      const relevance = scoreRelevance(searchText);
      if (relevance < 0.15) continue; // Lower threshold — Polymarket content is high value

      topics.push({
        id: `polymarket-${event.id}`,
        title: titleWithProb,
        url: `https://polymarket.com/event/${event.slug}`,
        source: "polymarket",
        score: Math.round(event.volume / 1000), // Normalize volume to comparable range
        relevance: Math.min(relevance + 0.1, 1.0), // Boost — prediction markets are unique content
        fetched_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[Curator] Polymarket fetch failed:", err instanceof Error ? err.message : err);
  }

  return topics;
}

// ─── RSS Feed Sources ────────────────────────────────────────────────────────

interface RssFeedConfig {
  url: string;
  source: Topic["source"];
  label: string;
  maxItems: number;
}

const RSS_FEEDS: RssFeedConfig[] = [
  {
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    source: "techcrunch",
    label: "TechCrunch AI",
    maxItems: 15,
  },
  {
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    source: "theverge",
    label: "The Verge AI",
    maxItems: 15,
  },
  {
    url: "https://www.axios.com/technology/artificial-intelligence/feed",
    source: "axios",
    label: "Axios AI",
    maxItems: 10,
  },
  {
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    source: "coindesk",
    label: "CoinDesk",
    maxItems: 10,
  },
  {
    url: "https://openai.com/blog/rss.xml",
    source: "openai_blog",
    label: "OpenAI Blog",
    maxItems: 10,
  },
];

async function fetchRssFeed(config: RssFeedConfig): Promise<Topic[]> {
  const topics: Topic[] = [];

  try {
    const res = await fetch(config.url, {
      headers: {
        "Accept": "application/rss+xml, application/xml, text/xml",
        "User-Agent": "ArcRouter-ContentBot/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[Curator] ${config.label} RSS returned ${res.status}`);
      return topics;
    }

    const xml = await res.text();
    const items = parseRssItems(xml).slice(0, config.maxItems);

    for (const { title, link, description } of items) {
      if (!title) continue;

      const searchText = `${title} ${description || ""}`;
      const relevance = scoreRelevance(searchText);
      if (relevance < 0.2) continue;

      topics.push({
        id: `${config.source}-${encodeURIComponent(link)}`,
        title,
        url: link,
        source: config.source,
        score: 0, // RSS feeds don't have upvotes
        relevance,
        fetched_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`[Curator] ${config.label} RSS failed:`, err instanceof Error ? err.message : err);
  }

  return topics;
}

async function fetchAllRssFeeds(): Promise<Topic[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map((config) => fetchRssFeed(config))
  );

  const topics: Topic[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      topics.push(...result.value);
    }
  }
  return topics;
}

// ─── HuggingFace Papers ──────────────────────────────────────────────────────

async function fetchHuggingFacePapers(): Promise<Topic[]> {
  const topics: Topic[] = [];

  try {
    // HF papers API returns JSON with daily papers
    const res = await fetch("https://huggingface.co/api/daily_papers", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // Fallback: try the HTML page
      console.warn(`[Curator] HF Papers API returned ${res.status}, skipping`);
      return topics;
    }

    const papers = await res.json() as Array<{
      title: string;
      paper: { id: string; title: string; summary?: string };
      numUpvotes?: number;
    }>;

    for (const paper of papers.slice(0, 15)) {
      const title = paper.paper?.title || paper.title;
      if (!title) continue;

      const searchText = `${title} ${paper.paper?.summary || ""}`;
      const relevance = scoreRelevance(searchText);
      if (relevance < 0.2) continue;

      topics.push({
        id: `hf-${paper.paper?.id || encodeURIComponent(title)}`,
        title,
        url: `https://huggingface.co/papers/${paper.paper?.id || ""}`,
        source: "hf_papers",
        score: paper.numUpvotes || 0,
        relevance,
        fetched_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[Curator] HuggingFace Papers failed:", err instanceof Error ? err.message : err);
  }

  return topics;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Remove topics we already processed recently (same ID from yesterday's run).
 */
async function deduplicateAgainstRecent(
  kv: KVNamespace,
  topics: Topic[]
): Promise<Topic[]> {
  const yesterday = new Date(Date.now() - 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  const recentJSON = await kv.get(`curator:topics:${yesterday}`);
  if (!recentJSON) return topics;

  const recent: Topic[] = JSON.parse(recentJSON);
  const recentIds = new Set(recent.map((t) => t.id));

  return topics.filter((t) => !recentIds.has(t.id));
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export interface CurateResult {
  topics: Topic[];
  total_found: number;
  sources: Record<string, number>;
  date: string;
}

export async function curateTopics(env: Env): Promise<CurateResult> {
  const date = new Date().toISOString().slice(0, 10);

  console.log("[Curator] Starting daily topic curation...");

  // Fetch all sources in parallel
  const [hnTopics, redditTopics, arxivTopics, polymarketTopics, rssTopics, hfTopics] =
    await Promise.all([
      fetchHackerNews(),
      fetchReddit(),
      fetchArxiv(),
      fetchPolymarket(),
      fetchAllRssFeeds(),
      fetchHuggingFacePapers(),
    ]);

  const allTopics = [
    ...hnTopics,
    ...redditTopics,
    ...arxivTopics,
    ...polymarketTopics,
    ...rssTopics,
    ...hfTopics,
  ];

  // Build source breakdown for logging
  const sourceCounts: Record<string, number> = {};
  for (const t of allTopics) {
    sourceCounts[t.source] = (sourceCounts[t.source] || 0) + 1;
  }

  console.log(
    `[Curator] Raw results — ${Object.entries(sourceCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")} (total: ${allTopics.length})`
  );

  // Deduplicate against yesterday
  const fresh = await deduplicateAgainstRecent(env.CONSENSUS_CACHE, allTopics);

  // Rank: weighted score = relevance * 0.7 + normalised_source_score * 0.3
  // Calculate max scores per source for normalization
  const maxBySource: Record<string, number> = {};
  for (const t of fresh) {
    const current = maxBySource[t.source] || 0;
    if (t.score > current) maxBySource[t.source] = t.score;
  }

  const ranked = fresh
    .map((t) => {
      const maxScore = maxBySource[t.source] || 1;
      const normScore = maxScore > 0 ? t.score / maxScore : 0;
      return { ...t, _rank: t.relevance * 0.7 + normScore * 0.3 };
    })
    .sort((a, b) => b._rank - a._rank)
    .slice(0, MAX_TOPICS)
    .map(({ _rank: _, ...t }) => t); // Remove internal _rank field

  // Store to KV
  await env.CONSENSUS_CACHE.put(
    `curator:topics:${date}`,
    JSON.stringify(ranked),
    { expirationTtl: KV_TTL }
  );

  console.log(`[Curator] Stored ${ranked.length} topics for ${date}`);

  return {
    topics: ranked,
    total_found: allTopics.length,
    sources: sourceCounts,
    date,
  };
}

/**
 * Get today's curated topics from KV.
 * Returns null if curator hasn't run today yet.
 */
export async function getTodaysTopics(kv: KVNamespace): Promise<Topic[] | null> {
  const date = new Date().toISOString().slice(0, 10);
  const json = await kv.get(`curator:topics:${date}`);
  return json ? (JSON.parse(json) as Topic[]) : null;
}
