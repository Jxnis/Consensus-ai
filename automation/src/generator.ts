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
    signal: AbortSignal.timeout(60000), // 60s — council mode needs time for multi-model consensus
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

CRITICAL FORMAT — each tweet must start with "N/" on its own line. Example:

1/ Hook tweet goes here — max 280 chars
2/ Second tweet with data or insight
3/ Third tweet continues the story

Rules:
- EXACTLY 7 tweets, numbered 1/ through 7/
- Each tweet MUST be ≤280 characters (this is a hard limit, count carefully)
- Tweet 1: Strong hook — surprising stat, counterintuitive claim, or bold question
- Tweets 2-6: Technical depth, real data, code snippet if relevant, no fluff
- Tweet 7: Practical takeaway. Mention ArcRouter ONLY if the topic is about LLM routing/costs
- Tone: developer helping developers — no hype, no corporate speak
- Output ONLY the numbered tweets. No intro, no explanation, no commentary.
- DO NOT write paragraphs. Each tweet is a short, standalone statement.`;
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
  return `You are a developer on r/LocalLLaMA or r/MachineLearning sharing a quick insight.

Topic: "${topic.title}"
Source: ${topic.url}

Write a SHORT Reddit comment (80–150 words, 2-3 paragraphs max):
- Open with a concrete observation, data point, or personal experience
- Add one technical insight or practical tip
- Keep it conversational — you're a peer, not a professor
- Do NOT mention ArcRouter unless the topic is specifically about LLM routing
- No bullet lists. No "In summary..." or "In conclusion..." phrases.
- Output ONLY the comment text, nothing else.`;
}

// ─── Tweet Thread Retry ──────────────────────────────────────────────────────

const THREAD_MIN_TWEETS = 5;
const THREAD_MAX_TWEETS = 9;
const THREAD_TARGET = 7;

async function generateThreadWithRetry(
  env: Env,
  topic: Topic,
  maxAttempts = 2
): Promise<string[]> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = attempt === 1
      ? buildThreadPrompt(topic)
      : buildThreadPrompt(topic) + `\n\nIMPORTANT: Your last attempt had the wrong number of tweets. You MUST output EXACTLY ${THREAD_TARGET} tweets. Count them carefully.`;

    const raw = await callArcRouter(env, prompt, topic.title, "council");
    const thread = parseTweetThread(raw);

    if (thread.length >= THREAD_MIN_TWEETS && thread.length <= THREAD_MAX_TWEETS) {
      return thread;
    }

    console.warn(
      `[Generator] Thread attempt ${attempt}: got ${thread.length} tweets (expected ${THREAD_MIN_TWEETS}-${THREAD_MAX_TWEETS})${
        attempt < maxAttempts ? ", retrying..." : ", using as-is"
      }`
    );

    // On last attempt, use whatever we got (if any)
    if (attempt === maxAttempts && thread.length > 0) {
      return thread;
    }
  }

  return [];
}

// ─── Dedup Guard ─────────────────────────────────────────────────────────────

/**
 * Check if we already generated posts today to prevent duplicates
 * when the cron or manual trigger runs twice on the same day.
 */
async function hasGeneratedToday(kv: KVNamespace): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const marker = await kv.get(`generator:ran:${today}`);
  return marker !== null;
}

async function markGeneratedToday(kv: KVNamespace): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await kv.put(`generator:ran:${today}`, "1", { expirationTtl: 60 * 60 * 36 }); // 36h TTL
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export interface GenerateResult {
  posts: GeneratedPost[];
  topics_used: number;
  errors: string[];
  skipped_dedup?: boolean;
}

export async function generatePosts(env: Env, topics: Topic[], force = false): Promise<GenerateResult> {
  const posts: GeneratedPost[] = [];
  const errors: string[] = [];

  // Dedup guard: skip if already generated today (unless forced)
  if (!force && await hasGeneratedToday(env.CONSENSUS_CACHE)) {
    console.log("[Generator] Already generated posts today — skipping (use force=true to override)");
    return { posts: [], topics_used: 0, errors: [], skipped_dedup: true };
  }

  // Generate content for top 2 topics (avoid flooding KV + API costs)
  const selectedTopics = topics.slice(0, 2);

  for (const topic of selectedTopics) {
    console.log(`[Generator] Generating content for: "${topic.title}"`);

    let thread: string[] = [];
    let standalone = "";
    let reddit = "";

    try {
      // Thread uses council mode with retry; standalone runs in parallel
      const [threadResult, standaloneRaw] = await Promise.all([
        generateThreadWithRetry(env, topic),
        callArcRouter(env, buildStandalonePrompt(topic), topic.title, "default"),
      ]);

      thread = threadResult;
      standalone = validateStandaloneTweet(standaloneRaw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Generator] Failed thread/standalone for "${topic.title}":`, msg);
      errors.push(`Thread/standalone for "${topic.title}": ${msg}`);
      continue;
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

  // Mark today as generated (only if we actually produced something)
  if (posts.length > 0) {
    await markGeneratedToday(env.CONSENSUS_CACHE);
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
