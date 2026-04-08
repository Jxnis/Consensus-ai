/**
 * Article Generator
 *
 * Weekly pipeline: picks the most relevant topic from the last 7 days →
 * calls ArcRouter REASONING tier to generate a 1500-2000 word Dev.to article →
 * stores draft in KV + sends email for review.
 *
 * Trigger: weekly Monday cron (configured in wrangler.jsonc) OR manual endpoint.
 */

import { Env, Topic, GeneratedArticle } from "./types.js";

const KV_TTL = 60 * 60 * 24 * 30; // 30 days
const ARCROUTER_BASE = "https://api.arcrouter.com";

// ─── Topic Selection ──────────────────────────────────────────────────────────

/**
 * Scan the last N days of curated topics and pick the best one for a long-form
 * article. We prefer topics not yet used for articles + highest relevance.
 */
async function pickArticleTopic(kv: KVNamespace): Promise<Topic | null> {
  const days: Topic[][] = [];
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `curator:topics:${d.toISOString().slice(0, 10)}`;
    const json = await kv.get(key);
    if (json) days.push(JSON.parse(json) as Topic[]);
  }

  if (days.length === 0) return null;

  const allTopics = days.flat();

  // Get already-used article topics so we don't repeat
  const usedList = await kv.list({ prefix: "articles:" });
  const usedTitles = new Set<string>();
  for (const key of usedList.keys) {
    const json = await kv.get(key.name);
    if (json) {
      const article = JSON.parse(json) as GeneratedArticle;
      usedTitles.add(article.topic.title);
    }
  }

  // Filter out used topics, then rank by relevance
  const candidates = allTopics
    .filter((t) => !usedTitles.has(t.title))
    .sort((a, b) => b.relevance - a.relevance);

  return candidates[0] ?? null;
}

// ─── Article Generation ───────────────────────────────────────────────────────

const ARTICLE_SYSTEM_PROMPT = `You are a senior AI engineer writing technical content for Dev.to.

Your articles are read by thousands of developers. They value: real data, honest analysis,
working code examples, and clear takeaways. They hate: hype, vague statements, and
marketing-speak disguised as technical content.

Your writing style:
- Concrete over abstract (show numbers, show code)
- Critical and honest (if something has trade-offs, say so)
- Developer-first (assume the reader writes code daily)
- No fluff — every paragraph earns its place

Output format: return ONLY the article in this exact structure:

---TITLE---
[Article title — specific and benefit-focused, not clickbait]
---DESCRIPTION---
[SEO meta description, 140-160 chars, mentions the main keyword]
---TAGS---
[4-5 tags comma-separated: e.g., ai, llm, typescript, productivity]
---BODY---
[Full article in Markdown. Use ##/### for headings. Include code blocks.]`;

function buildArticleUserPrompt(topic: Topic): string {
  return `Write a comprehensive Dev.to article about: "${topic.title}"
Source/inspiration: ${topic.url}

Requirements:
- 1500–2000 words
- Structure: Hook intro → Why this matters → Technical deep-dive → Code example or data → Practical takeaways → Conclusion
- Include at least ONE code block (TypeScript or Python preferred)
- Be specific — include real numbers/benchmarks if discussing performance
- Mention ArcRouter ONLY if the topic is directly about LLM routing, model selection, or API cost optimisation
- The article should stand alone — readers shouldn't need to read the source first

Write the full article now. Start with ---TITLE--- as instructed.`;
}

interface ParsedArticle {
  title: string;
  description: string;
  tags: string[];
  body: string;
}

function parseArticleResponse(raw: string): ParsedArticle {
  const extract = (marker: string, nextMarker: string) => {
    const start = raw.indexOf(`---${marker}---`);
    const end = raw.indexOf(`---${nextMarker}---`);
    if (start === -1) return "";
    const content = end === -1
      ? raw.slice(start + marker.length + 6)
      : raw.slice(start + marker.length + 6, end);
    return content.trim();
  };

  const title = extract("TITLE", "DESCRIPTION");
  const description = extract("DESCRIPTION", "TAGS");
  const tagsRaw = extract("TAGS", "BODY");
  const body = extract("BODY", "END"); // END won't exist, so takes till EOF

  return {
    title: title || "Untitled",
    description: description.slice(0, 160),
    tags: tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean).slice(0, 5)
      : ["ai", "llm"],
    body: body || raw, // Fallback: use raw content if parsing fails
  };
}

async function callArcRouterReasoning(env: Env, systemPrompt: string, userMessage: string): Promise<string> {
  const response = await fetch(`${ARCROUTER_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ARCROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "arc-router-v1",
      mode: "council",         // Multi-model consensus for quality
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(60000), // Articles need more time
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ArcRouter API ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? "";
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export interface GenerateArticleResult {
  article: GeneratedArticle | null;
  error?: string;
}

export async function generateWeeklyArticle(env: Env): Promise<GenerateArticleResult> {
  console.log("[ArticleGenerator] Starting weekly article generation...");

  const topic = await pickArticleTopic(env.CONSENSUS_CACHE);
  if (!topic) {
    return { article: null, error: "No topics available. Run the curator for at least 1 day first." };
  }

  console.log(`[ArticleGenerator] Selected topic: "${topic.title}"`);

  let parsed: ParsedArticle;
  try {
    const raw = await callArcRouterReasoning(env, ARTICLE_SYSTEM_PROMPT, buildArticleUserPrompt(topic));
    parsed = parseArticleResponse(raw);
    console.log(`[ArticleGenerator] Generated article: "${parsed.title}" (${parsed.body.length} chars)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ArticleGenerator] Generation failed:", msg);
    return { article: null, error: msg };
  }

  const article: GeneratedArticle = {
    id: `article-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    topic,
    title: parsed.title,
    markdown: parsed.body,
    tags: parsed.tags,
    seo_description: parsed.description,
    created_at: new Date().toISOString(),
    status: "pending_review",
  };

  await env.CONSENSUS_CACHE.put(
    `articles:pending:${article.id}`,
    JSON.stringify(article),
    { expirationTtl: KV_TTL }
  );

  console.log(`[ArticleGenerator] Stored draft ${article.id}`);
  return { article };
}

// ─── Email Notification ───────────────────────────────────────────────────────

export async function sendArticleReviewEmail(env: Env, article: GeneratedArticle): Promise<void> {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "re_placeholder") {
    console.log("[ArticleGenerator] RESEND_API_KEY not set — skipping email");
    return;
  }

  const reviewUrl = `${env.WORKER_URL}/review?token=${env.REVIEW_TOKEN}`;

  // Include first 500 chars of article body as preview
  const preview = article.markdown.slice(0, 500).replace(/#+\s/g, "").trim();

  const body = `Hi!

Your weekly ArcRouter article draft is ready for review.

Title: ${article.title}
Tags: ${article.tags.join(", ")}
Length: ~${Math.round(article.markdown.split(" ").length)} words

Preview:
---
${preview}...
---

Review + approve here:
${reviewUrl}

Edit in your text editor, then approve to publish to Dev.to.

---
ArcRouter Content Pipeline`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ArcRouter Bot <bot@arcrouter.com>",
        to: [env.REVIEW_EMAIL],
        subject: `📄 Weekly article ready: "${article.title}"`,
        text: body,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) console.error("[ArticleGenerator] Email failed:", await res.text());
    else console.log(`[ArticleGenerator] Review email sent`);
  } catch (err) {
    console.error("[ArticleGenerator] Email threw:", err instanceof Error ? err.message : err);
  }
}

// ─── KV Helpers ──────────────────────────────────────────────────────────────

export async function getPendingArticles(kv: KVNamespace): Promise<GeneratedArticle[]> {
  const list = await kv.list({ prefix: "articles:pending:" });
  const articles: GeneratedArticle[] = [];
  for (const key of list.keys) {
    const json = await kv.get(key.name);
    if (json) articles.push(JSON.parse(json) as GeneratedArticle);
  }
  return articles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getApprovedArticles(kv: KVNamespace): Promise<GeneratedArticle[]> {
  const list = await kv.list({ prefix: "articles:approved:" });
  const articles: GeneratedArticle[] = [];
  for (const key of list.keys) {
    const json = await kv.get(key.name);
    if (json) articles.push(JSON.parse(json) as GeneratedArticle);
  }
  return articles;
}
