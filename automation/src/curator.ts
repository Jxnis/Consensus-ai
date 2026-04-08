/**
 * Content Curator
 *
 * Fetches trending AI/LLM/routing topics from HackerNews, Reddit r/LocalLLaMA,
 * and ArXiv cs.AI. Scores by relevance + source popularity.
 * Stores top N topics to KV for the generator to pick up.
 *
 * Expected savings: Runs daily at 6am UTC via cron.
 */

import { Env, Topic } from "./types.js";

const MAX_TOPICS = 8; // Store top 8 — generator picks the best 2-3 daily
const KV_TTL = 60 * 60 * 48; // 48h — topics expire after 2 days

// ─── Relevance Scoring ───────────────────────────────────────────────────────

const KEYWORDS = {
  high: [
    "llm", "llm routing", "model routing", "ai router",
    "benchmark", "evals", "model selection",
    "token cost", "api cost", "inference cost",
    "multi-agent", "agentic", "mcp", "model context protocol",
    "openrouter", "arcrouter", "litellm",
    "claude", "gpt-4", "gemini",
    "prompt engineering", "context window",
  ],
  medium: [
    "ai", "openai", "anthropic", "google ai", "deepseek",
    "language model", "transformer", "fine-tuning",
    "inference", "api", "developer", "devtools",
    "automation", "agent", "workflow",
  ],
  low: [
    "machine learning", "neural network", "model",
    "software", "coding", "tech", "startup",
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

async function fetchHackerNews(): Promise<Topic[]> {
  const topics: Topic[] = [];

  try {
    const ids = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", {
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
          title: item.title!, // guarded by the continue above
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          source: "hn",
          score: item.score || 0,
          relevance,
          fetched_at: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.error("[Curator] HN fetch failed:", err instanceof Error ? err.message : err);
  }

  return topics;
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
  const subreddits = ["LocalLLaMA", "MachineLearning"];

  for (const sub of subreddits) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=30`, {
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

function parseArxivRss(xml: string): { title: string; link: string }[] {
  const items: { title: string; link: string }[] = [];
  // Simple regex-based XML parsing (no DOM in Workers)
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let itemMatch: RegExpExecArray | null;

  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const itemContent = itemMatch[1];
    const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(itemContent);
    const linkMatch = /<link>(.*?)<\/link>/.exec(itemContent);

    if (titleMatch && linkMatch) {
      // Clean HTML entities and extra whitespace
      const title = titleMatch[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
      items.push({ title, link: linkMatch[1].trim() });
    }
  }

  return items.slice(0, 20);
}

async function fetchArxiv(): Promise<Topic[]> {
  const topics: Topic[] = [];

  try {
    const xml = await fetch("https://export.arxiv.org/rss/cs.AI", {
      headers: { "Accept": "application/rss+xml" },
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.text());

    const papers = parseArxivRss(xml);

    for (const { title, link } of papers) {
      if (!title) continue;
      const relevance = scoreRelevance(title);
      if (relevance < 0.2) continue;

      topics.push({
        id: `arxiv-${encodeURIComponent(link)}`,
        title,
        url: link,
        source: "arxiv",
        score: 0, // ArXiv has no upvotes
        relevance,
        fetched_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("[Curator] ArXiv fetch failed:", err instanceof Error ? err.message : err);
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
  sources: { hn: number; reddit: number; arxiv: number };
  date: string;
}

export async function curateTopics(env: Env): Promise<CurateResult> {
  const date = new Date().toISOString().slice(0, 10);

  console.log("[Curator] Starting daily topic curation...");

  // Fetch all sources in parallel
  const [hnTopics, redditTopics, arxivTopics] = await Promise.all([
    fetchHackerNews(),
    fetchReddit(),
    fetchArxiv(),
  ]);

  const allTopics = [...hnTopics, ...redditTopics, ...arxivTopics];

  console.log(
    `[Curator] Raw results — HN: ${hnTopics.length}, Reddit: ${redditTopics.length}, ArXiv: ${arxivTopics.length}`
  );

  // Deduplicate against yesterday
  const fresh = await deduplicateAgainstRecent(env.CONSENSUS_CACHE, allTopics);

  // Rank: weighted score = relevance * 0.7 + normalised_source_score * 0.3
  const hnMax = Math.max(...hnTopics.map((t) => t.score), 1);
  const redditMax = Math.max(...redditTopics.map((t) => t.score), 1);

  const ranked = fresh
    .map((t) => {
      const maxScore = t.source === "hn" ? hnMax : t.source === "reddit" ? redditMax : 1;
      const normScore = t.score / maxScore;
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
    sources: {
      hn: hnTopics.length,
      reddit: redditTopics.length,
      arxiv: arxivTopics.length,
    },
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
