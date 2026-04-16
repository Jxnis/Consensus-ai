/**
 * Review UI
 *
 * A minimal but functional HTML review page served from the Worker.
 * You get an email → click link → browser opens this page.
 * Approve/edit/reject posts before they go live.
 *
 * Protected by a token query param (?token=SECRET).
 */

import { Env, GeneratedPost } from "./types.js";

const PAGE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f5f5f5; color: #1a1a1a; padding: 24px; }
  h1 { font-size: 1.4rem; font-weight: 700; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 32px; }
  .post-card { background: white; border-radius: 12px; padding: 24px;
               margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .post-header { display: flex; justify-content: space-between; align-items: flex-start;
                  margin-bottom: 16px; gap: 12px; }
  .post-title { font-size: 1rem; font-weight: 600; flex: 1; }
  .post-source { font-size: 0.8rem; color: #888; }
  .section-label { font-size: 0.75rem; font-weight: 600; color: #888;
                    text-transform: uppercase; letter-spacing: .05em;
                    margin: 16px 0 6px; }
  .tweet { background: #f9f9f9; border-left: 3px solid #1da1f2;
            padding: 10px 14px; border-radius: 6px; margin-bottom: 6px;
            font-size: 0.9rem; line-height: 1.5; }
  .tweet.standalone { border-color: #1da1f2; }
  .reddit-block { background: #fff3f0; border-left: 3px solid #ff4500;
                   padding: 10px 14px; border-radius: 6px; font-size: 0.9rem;
                   line-height: 1.5; white-space: pre-wrap; }
  textarea { width: 100%; border: 1px solid #ddd; border-radius: 6px;
              padding: 10px; font-size: 0.9rem; line-height: 1.5;
              font-family: inherit; resize: vertical; min-height: 80px; }
  .actions { display: flex; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
  .btn { padding: 10px 18px; border: none; border-radius: 8px; font-size: 0.9rem;
          font-weight: 600; cursor: pointer; transition: opacity .15s; }
  .btn:hover { opacity: .85; }
  .btn-approve { background: #22c55e; color: white; }
  .btn-reject  { background: #ef4444; color: white; }
  .btn-edit    { background: #3b82f6; color: white; }
  .empty { text-align: center; padding: 64px; color: #888; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 99px;
            font-size: 0.75rem; font-weight: 600; }
  .badge-pending  { background: #fef9c3; color: #713f12; }
  .badge-approved { background: #dcfce7; color: #14532d; }
  .badge-rejected { background: #fee2e2; color: #7f1d1d; }
  .char-count { font-size: 0.75rem; color: #888; text-align: right; margin-top: 2px; }
  .alert { background: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px;
            padding: 12px 16px; margin-bottom: 20px; font-size: 0.9rem; color: #1e40af; }
`;

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPostCard(post: GeneratedPost, token: string): string {
  const threadHtml = post.twitter_thread
    .map(
      (t, i) =>
        `<div class="tweet">${i + 1}/ ${escHtml(t)}<div class="char-count">${t.length}/280</div></div>`
    )
    .join("");

  return `
<div class="post-card" id="post-${escHtml(post.id)}">
  <div class="post-header">
    <div>
      <div class="post-title">${escHtml(post.topic.title)}</div>
      <div class="post-source">
        Source: <a href="${escHtml(post.topic.url)}" target="_blank" rel="noopener">${post.topic.source.toUpperCase()}</a>
        · Created: ${new Date(post.created_at).toLocaleString()}
      </div>
    </div>
    <span class="badge badge-${post.status}">${post.status}</span>
  </div>

  <div class="section-label">Twitter Thread (${post.twitter_thread.length} tweets)</div>
  <div>${threadHtml}</div>

  <div class="section-label">Standalone Tweet</div>
  <div class="tweet standalone">
    ${escHtml(post.twitter_standalone)}
    <div class="char-count">${post.twitter_standalone.length}/280</div>
  </div>

  ${post.reddit_comment ? `
  <div class="section-label">Reddit Comment</div>
  <div class="reddit-block">${escHtml(post.reddit_comment)}</div>
  ` : ""}

  <form method="POST" action="/review/action" style="margin-top:20px;">
    <input type="hidden" name="post_id" value="${escHtml(post.id)}">
    <input type="hidden" name="token" value="${escHtml(token)}">

    <div class="section-label">Edit Thread (optional — one tweet per line, starting with "N/")</div>
    <textarea name="twitter_thread" rows="10">${escHtml(post.twitter_thread.map((t, i) => `${i + 1}/ ${t}`).join("\n"))}</textarea>

    <div class="section-label">Edit Standalone Tweet (optional)</div>
    <textarea name="twitter_standalone" rows="2">${escHtml(post.twitter_standalone)}</textarea>

    ${post.reddit_comment ? `
    <div class="section-label">Edit Reddit Comment (optional)</div>
    <textarea name="reddit_comment" rows="5">${escHtml(post.reddit_comment)}</textarea>
    ` : ""}

    <div class="actions">
      <button type="submit" name="action" value="approve" class="btn btn-approve">✓ Approve</button>
      <button type="submit" name="action" value="reject" class="btn btn-reject">✗ Reject</button>
    </div>
  </form>
// ─── Article Card Renderer ────────────────────────────────────────────────────

import { GeneratedArticle } from "./types.js";

function renderArticleCard(article: GeneratedArticle, token: string): string {
  const wordCount = article.markdown.split(/\s+/).length;
  const previewBody = escHtml(article.markdown.slice(0, 800));

  return `
<div class="post-card" id="article-${escHtml(article.id)}">
  <div class="post-header">
    <div>
      <div class="post-title">📄 ${escHtml(article.title)}</div>
      <div class="post-source">
        Topic: <a href="${escHtml(article.topic.url)}" target="_blank" rel="noopener">${article.topic.source.toUpperCase()}</a>
        · Tags: ${article.tags.map((t) => `<span class="badge badge-pending">${escHtml(t)}</span>`).join(" ")}
        · ~${wordCount} words
        · Created: ${new Date(article.created_at).toLocaleString()}
      </div>
    </div>
    <span class="badge badge-${article.status}">${article.status}</span>
  </div>

  <div class="section-label">SEO Description</div>
  <div class="tweet">${escHtml(article.seo_description)}</div>

  <div class="section-label">Article Body (preview)</div>
  <div class="reddit-block" style="border-color:#8b5cf6;background:#faf5ff;max-height:400px;overflow-y:auto;white-space:pre-wrap;">${previewBody}${article.markdown.length > 800 ? "\n\n[... truncated in preview ...]" : ""}</div>

  <form method="POST" action="/review/article-action" style="margin-top:20px;">
    <input type="hidden" name="article_id" value="${escHtml(article.id)}">
    <input type="hidden" name="token" value="${escHtml(token)}">

    <div class="section-label">Edit Title (optional)</div>
    <textarea name="title" rows="1">${escHtml(article.title)}</textarea>

    <div class="section-label">Edit SEO Description (optional)</div>
    <textarea name="seo_description" rows="2">${escHtml(article.seo_description)}</textarea>

    <div class="section-label">Edit Tags (comma-separated, optional)</div>
    <textarea name="tags" rows="1">${escHtml(article.tags.join(", "))}</textarea>

    <div class="section-label">Edit Article Body (optional — full markdown)</div>
    <textarea name="markdown" rows="15">${escHtml(article.markdown)}</textarea>

    <div class="actions">
      <button type="submit" name="action" value="approve" class="btn btn-approve">✓ Approve & Queue for Dev.to</button>
      <button type="submit" name="action" value="reject" class="btn btn-reject">✗ Reject</button>
    </div>
  </form>
</div>`;
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

function authCheck(url: URL, env: Env): boolean {
  const token = url.searchParams.get("token");
  return token === env.REVIEW_TOKEN;
}

export async function handleReviewGet(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  if (!authCheck(url, env)) {
    return new Response("Unauthorized — missing or invalid token", { status: 401 });
  }

  // List all pending posts and articles
  const { getPendingPosts } = await import("./generator.js");
  const { getPendingArticles } = await import("./article-generator.js");
  const [posts, articles] = await Promise.all([
    getPendingPosts(env.CONSENSUS_CACHE),
    getPendingArticles(env.CONSENSUS_CACHE),
  ]);

  const msg = url.searchParams.get("msg");
  const msgBanner = msg
    ? `<div class="alert" style="background:${msg === "approved" ? "#dcfce7" : msg === "rejected" ? "#fee2e2" : "#dbeafe"};border-color:${msg === "approved" ? "#22c55e" : msg === "rejected" ? "#ef4444" : "#3b82f6"};color:${msg === "approved" ? "#14532d" : msg === "rejected" ? "#7f1d1d" : "#1e40af"}">
        ${msg === "approved" ? "✓ Content approved!" : msg === "rejected" ? "✗ Content rejected." : msg}
      </div>`
    : "";

  const postCardsHtml =
    posts.length === 0
      ? ""
      : `<div class="section-label" style="font-size:1rem;margin:24px 0 12px">🐦 Social Posts (${posts.length})</div>` +
        posts.map((p) => renderPostCard(p, token)).join("");

  const articleCardsHtml =
    articles.length === 0
      ? ""
      : `<div class="section-label" style="font-size:1rem;margin:24px 0 12px">📄 Articles (${articles.length})</div>` +
        articles.map((a) => renderArticleCard(a, token)).join("");

  const emptyHtml =
    posts.length === 0 && articles.length === 0
      ? `<div class="empty">
          <div style="font-size:2rem;margin-bottom:12px">🎉</div>
          <div style="font-weight:600;margin-bottom:8px">No content pending review</div>
          <div>Run the curator and generator to create new content.</div>
        </div>`
      : "";

  const totalPending = posts.length + articles.length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Review — ArcRouter</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <h1>📝 Content Review</h1>
  <p class="subtitle">${totalPending} item(s) pending · ArcRouter Content Pipeline</p>
  ${msgBanner}
  ${totalPending > 0 ? `<div class="alert">Review and approve content below. Social posts are posted via <code>GET /trigger/schedule</code>. Articles are published to Dev.to via <code>GET /trigger/publish/:id</code>.</div>` : ""}
  ${emptyHtml}
  ${postCardsHtml}
  ${articleCardsHtml}
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function handleReviewAction(req: Request, env: Env): Promise<Response> {
  const formData = await req.formData();
  const token = formData.get("token") as string | null;
  const postId = formData.get("post_id") as string | null;
  const action = formData.get("action") as string | null;

  if (token !== env.REVIEW_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!postId || !action) {
    return new Response("Missing post_id or action", { status: 400 });
  }

  const key = `posts:pending:${postId}`;
  const existing = await env.CONSENSUS_CACHE.get(key);

  if (!existing) {
    return new Response("Post not found (already processed?)", { status: 404 });
  }

  const post = JSON.parse(existing) as GeneratedPost;

  if (action === "reject") {
    await env.CONSENSUS_CACHE.delete(key);
    await env.CONSENSUS_CACHE.put(
      `posts:rejected:${postId}`,
      JSON.stringify({ ...post, status: "rejected" }),
      { expirationTtl: 60 * 60 * 24 * 3 } // Keep rejected for 3 days for audit
    );
    return Response.redirect(`/review?token=${token}&msg=rejected`, 303);
  }

  if (action === "approve") {
    // Merge any edits from the form
    const editedThread = formData.get("twitter_thread") as string | null;
    const editedStandalone = formData.get("twitter_standalone") as string | null;
    const editedReddit = formData.get("reddit_comment") as string | null;

    const approved: GeneratedPost = {
      ...post,
      status: "approved",
      twitter_thread: editedThread
        ? editedThread
            .split("\n")
            .map((l) => l.replace(/^\d+\/\s*/, "").trim())
            .filter((l) => l.length > 0)
        : post.twitter_thread,
      twitter_standalone: editedStandalone?.trim() || post.twitter_standalone,
      reddit_comment: editedReddit?.trim() || post.reddit_comment,
    };

    await env.CONSENSUS_CACHE.delete(key);
    await env.CONSENSUS_CACHE.put(
      `posts:approved:${postId}`,
      JSON.stringify(approved),
      { expirationTtl: 60 * 60 * 24 * 7 } // 7 days to post
    );

    return Response.redirect(`/review?token=${token}&msg=approved`, 303);
  }

  return new Response("Unknown action", { status: 400 });
}

// ─── Article Review Action ───────────────────────────────────────────────────

export async function handleArticleReviewAction(req: Request, env: Env): Promise<Response> {
  const formData = await req.formData();
  const token = formData.get("token") as string | null;
  const articleId = formData.get("article_id") as string | null;
  const action = formData.get("action") as string | null;

  if (token !== env.REVIEW_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!articleId || !action) {
    return new Response("Missing article_id or action", { status: 400 });
  }

  const key = `articles:pending:${articleId}`;
  const existing = await env.CONSENSUS_CACHE.get(key);

  if (!existing) {
    return new Response("Article not found (already processed?)", { status: 404 });
  }

  const article = JSON.parse(existing) as GeneratedArticle;

  if (action === "reject") {
    await env.CONSENSUS_CACHE.delete(key);
    await env.CONSENSUS_CACHE.put(
      `articles:rejected:${articleId}`,
      JSON.stringify({ ...article, status: "rejected" }),
      { expirationTtl: 60 * 60 * 24 * 3 }
    );
    return Response.redirect(`/review?token=${token}&msg=rejected`, 303);
  }

  if (action === "approve") {
    const editedTitle = formData.get("title") as string | null;
    const editedDesc = formData.get("seo_description") as string | null;
    const editedTags = formData.get("tags") as string | null;
    const editedMarkdown = formData.get("markdown") as string | null;

    const approved: GeneratedArticle = {
      ...article,
      status: "approved",
      title: editedTitle?.trim() || article.title,
      seo_description: editedDesc?.trim() || article.seo_description,
      tags: editedTags
        ? editedTags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5)
        : article.tags,
      markdown: editedMarkdown?.trim() || article.markdown,
    };

    await env.CONSENSUS_CACHE.delete(key);
    await env.CONSENSUS_CACHE.put(
      `articles:approved:${articleId}`,
      JSON.stringify(approved),
      { expirationTtl: 60 * 60 * 24 * 30 } // 30 days to publish
    );

    return Response.redirect(`/review?token=${token}&msg=approved`, 303);
  }

  return new Response("Unknown action", { status: 400 });
}

