/**
 * Scheduler / Publisher
 *
 * Posts approved content to Twitter (threads + standalone) and Reddit (comments).
 * Supports dry_run=true for testing without real API calls.
 *
 * Twitter: Uses OAuth 1.0a (required for posting on behalf of a user).
 * Reddit:  Uses OAuth 2 refresh token flow.
 */

import { Env, GeneratedPost } from "./types.js";

// ─── Twitter OAuth 1.0a ───────────────────────────────────────────────────────
// CF Workers have WebCrypto — we implement HMAC-SHA1 signing

async function hmacSha1(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function pctEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

async function buildOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  env: Env
): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: env.TWITTER_CLIENT_ID,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: env.TWITTER_ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  // Build signature base string
  const allParams = { ...params, ...oauthParams };
  const sortedParams = Object.entries(allParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pctEncode(k)}=${pctEncode(v)}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    pctEncode(url),
    pctEncode(sortedParams),
  ].join("&");

  const signingKey = `${pctEncode(env.TWITTER_CLIENT_SECRET)}&${pctEncode(env.TWITTER_ACCESS_SECRET)}`;
  const signature = await hmacSha1(signingKey, baseString);

  const headerParts = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const headerStr = Object.entries(headerParts)
    .map(([k, v]) => `${pctEncode(k)}="${pctEncode(v)}"`)
    .join(", ");

  return `OAuth ${headerStr}`;
}

// ─── Twitter API ──────────────────────────────────────────────────────────────

const TWITTER_API = "https://api.twitter.com/2/tweets";

interface TweetResponse {
  data: { id: string; text: string };
}

async function postTweet(
  text: string,
  env: Env,
  replyTo?: string
): Promise<string> {
  const body: Record<string, unknown> = { text };
  if (replyTo) body.reply = { in_reply_to_tweet_id: replyTo };

  const oauthHeader = await buildOAuthHeader("POST", TWITTER_API, {}, env);

  const res = await fetch(TWITTER_API, {
    method: "POST",
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter API ${res.status}: ${err}`);
  }

  const data = await res.json() as TweetResponse;
  return data.data.id;
}

async function postTwitterThread(
  tweets: string[],
  env: Env,
  dryRun: boolean
): Promise<string[]> {
  const ids: string[] = [];

  if (dryRun) {
    console.log(`[Scheduler] DRY RUN — Would post ${tweets.length}-tweet thread:`);
    tweets.forEach((t, i) => console.log(`  ${i + 1}/ ${t}`));
    return tweets.map((_, i) => `dry-run-${i}`);
  }

  let lastId: string | undefined;
  for (const tweet of tweets) {
    const id = await postTweet(tweet, env, lastId);
    ids.push(id);
    lastId = id;
    // Small delay between tweets to avoid rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  return ids;
}

async function postTwitterStandalone(
  tweet: string,
  env: Env,
  dryRun: boolean
): Promise<string> {
  if (dryRun) {
    console.log(`[Scheduler] DRY RUN — Would post standalone tweet: ${tweet}`);
    return "dry-run-standalone";
  }
  return postTweet(tweet, env);
}

// ─── Reddit API ───────────────────────────────────────────────────────────────

async function getRedditAccessToken(env: Env): Promise<string> {
  const credentials = btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`);

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "ArcRouter-Bot/1.0 (by u/arcrouter)",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: env.REDDIT_REFRESH_TOKEN,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reddit token refresh failed ${res.status}: ${err}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

/**
 * Posts a comment to a Reddit thread.
 * `thingId` is the fullname of the parent (e.g. "t3_xxxx" for a submission).
 */
async function postRedditComment(
  thingId: string,
  text: string,
  env: Env,
  dryRun: boolean
): Promise<string> {
  if (dryRun) {
    console.log(`[Scheduler] DRY RUN — Would post Reddit comment to ${thingId}: ${text.slice(0, 80)}...`);
    return "dry-run-comment";
  }

  const accessToken = await getRedditAccessToken(env);

  const res = await fetch("https://oauth.reddit.com/api/comment", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "ArcRouter-Bot/1.0 (by u/arcrouter)",
    },
    body: new URLSearchParams({
      api_type: "json",
      thing_id: thingId,
      text,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Reddit comment failed ${res.status}: ${err}`);
  }

  const data = await res.json() as { json: { data: { things: Array<{ data: { id: string } }> } } };
  return data.json.data.things[0]?.data.id ?? "unknown";
}

// ─── Main Scheduler ───────────────────────────────────────────────────────────

export interface ScheduleResult {
  published: number;
  skipped: number;
  errors: string[];
  dry_run: boolean;
}

export async function scheduleApprovedPosts(
  env: Env,
  dryRun = false
): Promise<ScheduleResult> {
  const { getApprovedPosts } = await import("./generator.js");
  const posts = await getApprovedPosts(env.CONSENSUS_CACHE);

  let published = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const post of posts) {
    if (post.status !== "approved") {
      skipped++;
      continue;
    }

    console.log(`[Scheduler] Processing post ${post.id}: "${post.topic.title}"`);

    let twitterThreadIds: string[] = [];
    let standaloneId = "";
    let publishError = false;

    // Post Twitter thread
    if (post.twitter_thread.length > 0) {
      try {
        twitterThreadIds = await postTwitterThread(post.twitter_thread, env, dryRun);
        console.log(`[Scheduler] Twitter thread posted: ${twitterThreadIds[0]}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Scheduler] Twitter thread failed for ${post.id}:`, msg);
        errors.push(`Twitter thread ${post.id}: ${msg}`);
        publishError = true;
      }
    }

    // Post standalone tweet (only if thread succeeded or no thread)
    if (!publishError && post.twitter_standalone) {
      try {
        standaloneId = await postTwitterStandalone(post.twitter_standalone, env, dryRun);
        console.log(`[Scheduler] Standalone tweet posted: ${standaloneId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[Scheduler] Standalone tweet failed for ${post.id}:`, msg);
        // Non-fatal — thread is more important
      }
    }

    // NOTE: Reddit posting requires a specific thread to reply to.
    // The reddit_comment is stored as a DRAFT for now.
    // To post it: manually find a relevant Reddit thread, copy the thing_id,
    // and call POST /trigger/reddit?post_id=X&thing_id=t3_XXXX&token=SECRET
    if (post.reddit_comment) {
      console.log(`[Scheduler] Reddit comment draft ready for ${post.id} (manual step required)`);
    }

    const anySucceeded = twitterThreadIds.length > 0 || standaloneId !== "";

    if (dryRun) {
      // Dry run: log only, leave post in approved queue for real posting later
      console.log(`[Scheduler] DRY RUN complete for ${post.id} — post remains in approved queue`);
      published++; // Count as "processed" for dry-run reporting
      continue;
    }

    if (!anySucceeded) {
      // All posting attempts failed — leave in approved queue so user can retry or reapprove
      console.warn(`[Scheduler] All posting failed for ${post.id} — leaving in approved queue for retry`);
      skipped++;
      continue;
    }

    // Move to published only when at least one platform succeeded
    const updatedPost: GeneratedPost = {
      ...post,
      status: "published",
      published_at: new Date().toISOString(),
      twitter_tweet_id: twitterThreadIds[0] ?? standaloneId,
    };

    const approvedKey = `posts:approved:${post.id}`;
    await env.CONSENSUS_CACHE.delete(approvedKey);
    await env.CONSENSUS_CACHE.put(
      `posts:published:${post.id}`,
      JSON.stringify(updatedPost),
      { expirationTtl: 60 * 60 * 24 * 30 } // Keep published posts 30 days for records
    );

    published++;
  }

  console.log(`[Scheduler] Done — published: ${published}, skipped: ${skipped}, errors: ${errors.length}`);
  return { published, skipped, errors, dry_run: dryRun };
}

/**
 * Manual Reddit comment posting for a specific thread.
 * Requires thing_id (e.g. "t3_abc123") of the Reddit submission to comment on.
 */
export async function postRedditDraft(
  env: Env,
  postId: string,
  thingId: string,
  dryRun = false
): Promise<{ success: boolean; comment_id?: string; error?: string }> {
  const json = await env.CONSENSUS_CACHE.get(`posts:pending:${postId}`) ??
               await env.CONSENSUS_CACHE.get(`posts:approved:${postId}`);

  if (!json) return { success: false, error: "Post not found" };

  const post = JSON.parse(json) as GeneratedPost;
  if (!post.reddit_comment) return { success: false, error: "No reddit comment on this post" };

  try {
    const commentId = await postRedditComment(thingId, post.reddit_comment, env, dryRun);
    return { success: true, comment_id: commentId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}
