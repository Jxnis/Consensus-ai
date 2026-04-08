/**
 * Dev.to Publisher
 *
 * Publishes an approved article draft to Dev.to via their API.
 * After publishing, auto-generates social announcement posts
 * (adds them to the pending review queue for Twitter/Reddit).
 */

import { Env, GeneratedArticle, GeneratedPost, Topic } from "./types.js";

const DEVTO_API = "https://dev.to/api/articles";

// ─── Dev.to API ───────────────────────────────────────────────────────────────

interface DevtoArticlePayload {
  article: {
    title: string;
    published: boolean;
    body_markdown: string;
    tags: string[];
    description: string;
    canonical_url?: string;
  };
}

interface DevtoArticleResponse {
  id: number;
  url: string;
  slug: string;
  title: string;
}

async function publishToDevto(
  article: GeneratedArticle,
  env: Env,
  dryRun: boolean
): Promise<{ url: string; id: number }> {
  if (dryRun) {
    console.log(`[Publisher] DRY RUN — Would publish: "${article.title}"`);
    return { url: `https://dev.to/arcrouter/${article.id}`, id: 0 };
  }

  if (!env.DEVTO_API_KEY || env.DEVTO_API_KEY === "placeholder") {
    throw new Error("DEVTO_API_KEY not configured");
  }

  const payload: DevtoArticlePayload = {
    article: {
      title: article.title,
      published: true,
      body_markdown: article.markdown,
      tags: article.tags,
      description: article.seo_description,
    },
  };

  const res = await fetch(DEVTO_API, {
    method: "POST",
    headers: {
      "api-key": env.DEVTO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Dev.to API ${res.status}: ${err}`);
  }

  const data = await res.json() as DevtoArticleResponse;
  return { url: data.url, id: data.id };
}

// ─── Auto-Generate Announcement Posts ─────────────────────────────────────────

/**
 * After publishing an article, generate announcement posts for Twitter and Reddit.
 * These go into the review queue — you still approve before they go live.
 */
async function generateAnnouncementPosts(
  article: GeneratedArticle,
  articleUrl: string,
  env: Env
): Promise<void> {
  const ARCROUTER_BASE = "https://api.arcrouter.com";

  const twitterPrompt = `Write 2 tweets announcing a new Dev.to article.

Article: "${article.title}"
URL: ${articleUrl}
Tags: ${article.tags.join(", ")}

Requirements:
- Tweet 1: The hook — what's the most interesting insight from the article? Make devs click.
- Tweet 2: The thread starter — "I just published: [article title] ${articleUrl} — here's what you'll learn:"
- Each tweet ≤ 240 chars (leave room for URL)
- No hashtag spam
- Output format:
TWEET1: [tweet text]
TWEET2: [tweet text]`;

  const redditPrompt = `Write a Reddit comment for sharing a new technical article.

Article: "${article.title}"
URL: ${articleUrl}

Write a SHORT, genuine comment (2-3 sentences) that:
- Explains what the article covers and why it's useful
- Is honest (not marketing-speak)
- Ends with the URL
- Feels like a developer sharing something useful, not promoting their own content

Output: just the comment text`;

  try {
    const [announcementRaw, redditRaw] = await Promise.all([
      fetch(`${ARCROUTER_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.ARCROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "arc-router-v1",
          mode: "default",
          messages: [{ role: "user", content: twitterPrompt }],
          stream: false,
        }),
        signal: AbortSignal.timeout(20000),
      }).then((r) => r.json() as Promise<{ choices: Array<{ message: { content: string } }> }>),

      fetch(`${ARCROUTER_BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.ARCROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: "arc-router-v1",
          mode: "default",
          messages: [{ role: "user", content: redditPrompt }],
          stream: false,
        }),
        signal: AbortSignal.timeout(20000),
      }).then((r) => r.json() as Promise<{ choices: Array<{ message: { content: string } }> }>),
    ]);

    const announcementText = announcementRaw.choices[0]?.message?.content ?? "";
    const redditText = (redditRaw.choices[0]?.message?.content ?? "").trim();

    // Parse the two tweets — fix truncation with explicit length checks
    const tweet1Match = announcementText.match(/TWEET1:\s*(.+)/);
    const tweet2Match = announcementText.match(/TWEET2:\s*(.+)/);

    const raw1 = (tweet1Match?.[1] ?? "").trim();
    const raw2 = (tweet2Match?.[1] ?? "").trim();
    const tweet1 = raw1.length > 277 ? raw1.slice(0, 277) + "..." : raw1;
    const tweet2 = raw2.length > 277 ? raw2.slice(0, 277) + "..." : raw2;

    const thread = [tweet1, tweet2].filter(Boolean);

    if (thread.length === 0 && !redditText) return;

    // Create a synthetic topic for this announcement post
    const syntheticTopic: Topic = {
      id: `article-announcement-${article.id}`,
      title: `[Article] ${article.title}`,
      url: articleUrl,
      source: "hn", // Doesn't matter for announcements
      score: 0,
      relevance: 1.0,
      fetched_at: new Date().toISOString(),
    };

    const announcementPost: GeneratedPost = {
      id: `announce-${article.id}`,
      topic: syntheticTopic,
      twitter_thread: thread,
      twitter_standalone: tweet1 || `📝 New article: "${article.title}" ${articleUrl}`,
      reddit_comment: redditText,
      created_at: new Date().toISOString(),
      status: "pending_review",
    };

    await env.CONSENSUS_CACHE.put(
      `posts:pending:${announcementPost.id}`,
      JSON.stringify(announcementPost),
      { expirationTtl: 60 * 60 * 24 * 7 }
    );

    console.log(`[Publisher] Announcement post queued for review: ${announcementPost.id}`);
  } catch (err) {
    // Non-fatal — article is already published, announcement is nice-to-have
    console.warn("[Publisher] Announcement generation failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export interface PublishResult {
  success: boolean;
  url?: string;
  devto_id?: number;
  announcement_queued: boolean;
  error?: string;
  dry_run: boolean;
}

export async function publishArticle(
  env: Env,
  articleId: string,
  dryRun = false,
  force = false  // Must be explicitly true to publish a pending (not-yet-approved) article
): Promise<PublishResult> {
  // Always check approved first
  const approvedJson = await env.CONSENSUS_CACHE.get(`articles:approved:${articleId}`);

  // Only fall through to pending if force=true (for debugging/emergency use)
  const pendingJson = !approvedJson && force
    ? await env.CONSENSUS_CACHE.get(`articles:pending:${articleId}`)
    : null;

  const json = approvedJson ?? pendingJson;

  if (!json) {
    const msg = !approvedJson && !force
      ? "Article not found in approved queue. Approve it in the review UI first."
      : "Article not found";
    return { success: false, error: msg, announcement_queued: false, dry_run: dryRun };
  }

  const article = JSON.parse(json) as GeneratedArticle;


  let articleUrl: string;
  let devtoId: number;

  try {
    const result = await publishToDevto(article, env, dryRun);
    articleUrl = result.url;
    devtoId = result.id;
    console.log(`[Publisher] Published to Dev.to: ${articleUrl}`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Publisher] Dev.to publish failed:", error);
    return { success: false, error, announcement_queued: false, dry_run: dryRun };
  }

  // Update article status in KV
  const published: GeneratedArticle = {
    ...article,
    status: "published",
    devto_url: articleUrl,
    published_at: new Date().toISOString(),
  };

  // Move from approved → published
  await env.CONSENSUS_CACHE.delete(`articles:approved:${articleId}`);
  await env.CONSENSUS_CACHE.delete(`articles:pending:${articleId}`);
  await env.CONSENSUS_CACHE.put(
    `articles:published:${articleId}`,
    JSON.stringify(published),
    { expirationTtl: 60 * 60 * 24 * 90 } // 90 days — keep records
  );

  // Queue announcement posts (non-blocking)
  let announcementQueued = false;
  if (!dryRun) {
    try {
      await generateAnnouncementPosts(published, articleUrl, env);
      announcementQueued = true;
    } catch { /* non-fatal */ }
  }

  return {
    success: true,
    url: articleUrl,
    devto_id: devtoId,
    announcement_queued: announcementQueued,
    dry_run: dryRun,
  };
}
