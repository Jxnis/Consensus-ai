/**
 * Content Generator
 *
 * Takes curated topics from KV → calls ArcRouter API (dogfooding!) →
 * produces Twitter threads, standalone tweets, and Reddit comments.
 * Stores drafts in KV with status "pending_review".
 * Sends email notification with review link.
 */

import { Env, Topic, GeneratedPost } from "./types.js";

const ARCROUTER_BASE = "https://api.arcrouter.com";
const MAX_TWEET_LENGTH = 280;
const KV_TTL = 60 * 60 * 24 * 7; // 7 days

// ─── ArcRouter API Call ───────────────────────────────────────────────────────

async function callArcRouter(
  env: Env,
  systemPrompt: string,
  userMessage: string,
  mode: "council" | "default" = "default"
): Promise<string> {
  const response = await fetch(`${ARCROUTER_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ARCROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "arc-router-v1",
      mode,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ArcRouter API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0]?.message?.content ?? "";
}

// ─── Tweet Validation ─────────────────────────────────────────────────────────

/**
 * Split and validate a Twitter thread response.
 * The LLM returns tweets as "1/ ...\n2/ ...\n3/ ..."
 * We parse, validate length, and truncate if needed.
 */
function parseTweetThread(raw: string): string[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+\//.test(l));

  if (lines.length === 0) {
    // Fallback: LLM didn't use numbered format — split by blank line
    return raw
      .split(/\n\n+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && t.length <= MAX_TWEET_LENGTH)
      .slice(0, 10);
  }

  return lines.map((line) => {
    // Remove numbering prefix for the tweet content
    const content = line.replace(/^\d+\/\s*/, "");
    if (content.length <= MAX_TWEET_LENGTH) return content;
    // Truncate hard at 277 + ellipsis — never go over 280
    return content.slice(0, 277) + "...";
  });
}

function validateStandaloneTweet(raw: string): string {
  const tweet = raw.trim().split("\n")[0] ?? raw.trim(); // Take first line only
  if (tweet.length <= MAX_TWEET_LENGTH) return tweet;
  return tweet.slice(0, 277) + "...";
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

function buildThreadPrompt(topic: Topic): string {
  return `You are a senior AI/ML developer sharing technical insights on Twitter/X.

Write a 7-tweet thread about: "${topic.title}"
Source: ${topic.url}

Rules:
- Each tweet starts with its number and a slash: "1/ ... 2/ ..."
- Each tweet must be ≤280 characters (COUNT CAREFULLY)
- Tweet 1: Strong hook — surprising stat, counterintuitive claim, or bold question
- Tweets 2-6: Technical depth, real data, code snippet if relevant, no fluff
- Tweet 7: Practical takeaway + one subtle mention of ArcRouter ONLY if directly relevant to the topic (routing, benchmarks, LLM costs)
- Tone: developer helping developers — no hype, no corporate speak
- Write exactly 7 numbered tweets. No preamble, no explanation.`;
}

function buildStandalonePrompt(topic: Topic): string {
  return `You are a developer sharing a quick insight on Twitter/X.

Write ONE punchy tweet about: "${topic.title}"
Source: ${topic.url}

Rules:
- MAX 240 characters (leave room for a link)
- Strong hook — a surprising fact, opinion, or question
- Technical but accessible
- No hashtags unless they add real value
- Do NOT mention ArcRouter unless the topic is directly about LLM routing/cost
- Output only the tweet text, nothing else`;
}

function buildRedditPrompt(topic: Topic): string {
  return `You are a helpful developer participating in r/LocalLLaMA or r/MachineLearning.

Write a helpful Reddit comment responding to this discussion: "${topic.title}"
Source: ${topic.url}

Rules:
- 150–300 words
- Lead with genuine value: explain something, share data, correct a misconception
- Mention ArcRouter ONLY if someone directly asks about routing solutions or LLM cost tools
- Tone: casual, knowledgeable, community member — not a product pitch
- No bullet-list spam — write in natural paragraphs
- Output only the comment text, nothing else`;
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export interface GenerateResult {
  posts: GeneratedPost[];
  topics_used: number;
  errors: string[];
}

export async function generatePosts(env: Env, topics: Topic[]): Promise<GenerateResult> {
  const posts: GeneratedPost[] = [];
  const errors: string[] = [];

  // Generate content for top 2 topics (avoid flooding KV + API costs)
  const selectedTopics = topics.slice(0, 2);

  for (const topic of selectedTopics) {
    console.log(`[Generator] Generating content for: "${topic.title}"`);

    // Run thread + standalone in parallel; reddit runs last (lower priority)
    let thread: string[] = [];
    let standalone = "";
    let reddit = "";

    try {
      // Thread uses council mode for higher quality (multiple models agree)
      const [threadRaw, standaloneRaw] = await Promise.all([
        callArcRouter(env, buildThreadPrompt(topic), topic.title, "council"),
        callArcRouter(env, buildStandalonePrompt(topic), topic.title, "default"),
      ]);

      thread = parseTweetThread(threadRaw);
      standalone = validateStandaloneTweet(standaloneRaw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Generator] Failed thread/standalone for "${topic.title}":`, msg);
      errors.push(`Thread/standalone for "${topic.title}": ${msg}`);
      continue; // Skip this topic entirely rather than storing partial content
    }

    try {
      const redditRaw = await callArcRouter(env, buildRedditPrompt(topic), topic.title, "default");
      reddit = redditRaw.trim();
    } catch (err) {
      // Reddit comment failing is non-fatal — still save thread + standalone
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Generator] Reddit comment failed for "${topic.title}":`, msg);
      reddit = "";
    }

    if (thread.length === 0 && !standalone) {
      errors.push(`Empty content generated for "${topic.title}" — skipped`);
      continue;
    }

    const post: GeneratedPost = {
      id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      topic,
      twitter_thread: thread,
      twitter_standalone: standalone,
      reddit_comment: reddit,
      created_at: new Date().toISOString(),
      status: "pending_review",
    };

    await env.CONSENSUS_CACHE.put(
      `posts:pending:${post.id}`,
      JSON.stringify(post),
      { expirationTtl: KV_TTL }
    );

    posts.push(post);
    console.log(`[Generator] Stored post ${post.id} (${thread.length} tweets)`);
  }

  return { posts, topics_used: selectedTopics.length, errors };
}

// ─── Email Notification ───────────────────────────────────────────────────────

export async function sendReviewEmail(
  env: Env,
  posts: GeneratedPost[]
): Promise<void> {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "re_placeholder") {
    console.log("[Generator] RESEND_API_KEY not set — skipping email");
    return;
  }

  const reviewUrl = `${env.WORKER_URL}/review?token=${env.REVIEW_TOKEN}`;

  const postSummaries = posts
    .map(
      (p, i) =>
        `${i + 1}. "${p.topic.title}" (${p.twitter_thread.length} tweets + standalone + reddit)`
    )
    .join("\n");

  const body = `Hi!

ArcRouter Content Pipeline generated ${posts.length} post(s) for your review:

${postSummaries}

Review and approve here:
${reviewUrl}

This link is valid for 7 days.

---
Generated daily by ArcRouter Content Pipeline
Powered by ArcRouter council mode 🚀`;

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
        subject: `📝 ${posts.length} post(s) ready for review — ArcRouter Content Pipeline`,
        text: body,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Generator] Resend email failed:", err);
    } else {
      console.log(`[Generator] Review email sent to ${env.REVIEW_EMAIL}`);
    }
  } catch (err) {
    console.error("[Generator] Email send threw:", err instanceof Error ? err.message : err);
  }
}

// ─── KV Helpers ──────────────────────────────────────────────────────────────

export async function getPendingPosts(kv: KVNamespace): Promise<GeneratedPost[]> {
  const list = await kv.list({ prefix: "posts:pending:" });
  const posts: GeneratedPost[] = [];

  for (const key of list.keys) {
    const json = await kv.get(key.name);
    if (json) posts.push(JSON.parse(json) as GeneratedPost);
  }

  return posts.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getApprovedPosts(kv: KVNamespace): Promise<GeneratedPost[]> {
  const list = await kv.list({ prefix: "posts:approved:" });
  const posts: GeneratedPost[] = [];

  for (const key of list.keys) {
    const json = await kv.get(key.name);
    if (json) posts.push(JSON.parse(json) as GeneratedPost);
  }

  return posts;
}
