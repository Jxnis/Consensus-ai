/**
 * ArcRouter Content Pipeline — Main Entry Point
 *
 * Routes:
 *   GET  /                          → Health check
 *   GET  /review?token=SECRET        → Review UI (list pending posts)
 *   POST /review/action              → Approve/reject a post
 *   GET  /trigger/curate?token=SECRET  → Run curator manually
 *   GET  /trigger/generate?token=SECRET → Run generator manually
 *   GET  /trigger/schedule?token=SECRET[&dry_run=true] → Post approved content
 *   POST /trigger/reddit?token=SECRET   → Manually post Reddit comment draft
 *
 * Scheduled:
 *   cron 0 6 * * *                  → curator → generator → send review email
 */

import { Hono } from "hono";
import { Env } from "./types.js";
import { curateTopics, getTodaysTopics } from "./curator.js";
import { generatePosts, sendReviewEmail } from "./generator.js";
import { handleReviewGet, handleReviewAction } from "./review.js";
import { scheduleApprovedPosts, postRedditDraft } from "./scheduler.js";
import { generateWeeklyArticle, sendArticleReviewEmail, getPendingArticles } from "./article-generator.js";
import { publishArticle } from "./devto-publisher.js";


const app = new Hono<{ Bindings: Env }>();

// ─── Auth Helper ─────────────────────────────────────────────────────────────

function isAuthorized(token: string | null, env: Env): boolean {
  if (!env.REVIEW_TOKEN) return false; // Must be set
  return token === env.REVIEW_TOKEN;
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/", (c) => {
  return c.json({
    name: "arcrouter-content-pipeline",
    status: "ok",
    environment: c.env.ENVIRONMENT ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

// ─── Review UI ────────────────────────────────────────────────────────────────

app.get("/review", (c) => handleReviewGet(c.req.raw, c.env));
app.post("/review/action", (c) => handleReviewAction(c.req.raw, c.env));

// ─── Manual Triggers ──────────────────────────────────────────────────────────

app.get("/trigger/curate", async (c) => {
  const token = c.req.query("token");
  if (!isAuthorized(token ?? null, c.env)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await curateTopics(c.env);
    return c.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Index] Curator failed:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

app.get("/trigger/generate", async (c) => {
  const token = c.req.query("token");
  if (!isAuthorized(token ?? null, c.env)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const topics = await getTodaysTopics(c.env.CONSENSUS_CACHE);
    if (!topics || topics.length === 0) {
      return c.json({
        success: false,
        error: "No topics found for today. Run /trigger/curate first.",
      }, 404);
    }

    const result = await generatePosts(c.env, topics);

    // Send review email (non-blocking)
    if (result.posts.length > 0) {
      c.executionCtx.waitUntil(sendReviewEmail(c.env, result.posts));
    }

    return c.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Index] Generator failed:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

app.get("/trigger/schedule", async (c) => {
  const token = c.req.query("token");
  if (!isAuthorized(token ?? null, c.env)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dryRun = c.req.query("dry_run") === "true";

  try {
    const result = await scheduleApprovedPosts(c.env, dryRun);
    return c.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Index] Scheduler failed:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

// Reddit manual comment posting
app.post("/trigger/reddit", async (c) => {
  const token = c.req.query("token");
  if (!isAuthorized(token ?? null, c.env)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { post_id, thing_id, dry_run } = await c.req.json() as {
    post_id: string;
    thing_id: string;
    dry_run?: boolean;
  };

  if (!post_id || !thing_id) {
    return c.json({ error: "Missing post_id or thing_id" }, 400);
  }

  const result = await postRedditDraft(c.env, post_id, thing_id, dry_run ?? false);
  return c.json(result, result.success ? 200 : 500);
});

// ─── Article Routes (Phase 2) ─────────────────────────────────────────────────

app.get("/trigger/article", async (c) => {
  const token = c.req.query("token");
  if (!isAuthorized(token ?? null, c.env)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const result = await generateWeeklyArticle(c.env);
    if (!result.article) {
      return c.json({ success: false, error: result.error }, 404);
    }
    c.executionCtx.waitUntil(sendArticleReviewEmail(c.env, result.article));
    return c.json({ success: true, article_id: result.article.id, title: result.article.title });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Index] Article generator failed:", msg);
    return c.json({ success: false, error: msg }, 500);
  }
});

app.get("/trigger/publish/:article_id", async (c) => {
  const token = c.req.query("token");
  if (!isAuthorized(token ?? null, c.env)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const articleId = c.req.param("article_id");
  const dryRun = c.req.query("dry_run") === "true";

  const result = await publishArticle(c.env, articleId, dryRun);
  return c.json(result, result.success ? 200 : 500);
});

// List pending articles (for debugging/status)
app.get("/debug/articles", async (c) => {
  const token = c.req.query("token");
  if (!isAuthorized(token ?? null, c.env)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const articles = await getPendingArticles(c.env.CONSENSUS_CACHE);
  return c.json({ count: articles.length, articles: articles.map((a) => ({ id: a.id, title: a.title, status: a.status, created_at: a.created_at })) });
});

// ─── Scheduled Cron Handler ───────────────────────────────────────────────────

export default {
  fetch: app.fetch,

  /**
   * Two cron schedules:
   *   "0 6 * * *"  → Daily 6am UTC: curate topics + generate social posts + email review
   *   "0 8 * * 1"  → Weekly Monday 8am UTC: generate Dev.to article draft + email review
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const isWeeklyArticle = event.cron === "0 8 * * 1";

    if (isWeeklyArticle) {
      // Weekly Monday 8am: article generation
      ctx.waitUntil(
        (async () => {
          console.log("[Cron] Starting weekly article generation...");
          try {
            const result = await generateWeeklyArticle(env);
            if (result.article) {
              await sendArticleReviewEmail(env, result.article);
              console.log(`[Cron] Weekly article draft ready: "${result.article.title}"`);
            } else {
              console.warn("[Cron] Article generation skipped:", result.error);
            }
          } catch (err) {
            console.error("[Cron] Weekly article pipeline failed:", err instanceof Error ? err.message : err);
          }
        })()
      );
    } else {
      // Daily 6am: social post pipeline
      ctx.waitUntil(
        (async () => {
          console.log("[Cron] Starting daily social content pipeline...");
          try {
            const curateResult = await curateTopics(env);
            console.log(`[Cron] Curated ${curateResult.topics.length} topics`);

            if (curateResult.topics.length === 0) {
              console.warn("[Cron] No relevant topics found — skipping generation");
              return;
            }

            const generateResult = await generatePosts(env, curateResult.topics);
            console.log(`[Cron] Generated ${generateResult.posts.length} posts`);

            if (generateResult.posts.length > 0) {
              await sendReviewEmail(env, generateResult.posts);
              console.log("[Cron] Review email sent");
            }

            if (generateResult.errors.length > 0) {
              console.warn("[Cron] Errors:", generateResult.errors.join(", "));
            }

            console.log("[Cron] Daily pipeline complete");
          } catch (err) {
            console.error("[Cron] Daily pipeline failed:", err instanceof Error ? err.message : err);
          }
        })()
      );
    }
  },
};
