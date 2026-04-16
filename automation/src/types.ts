/**
 * Content Pipeline — Shared Types
 */

export interface Env {
  CONSENSUS_CACHE: KVNamespace;
  ENVIRONMENT: string;
  REVIEW_EMAIL: string;
  WORKER_URL: string;
  REVIEW_TOKEN: string;
  ARCROUTER_API_KEY: string;
  RESEND_API_KEY: string;
  TWITTER_CLIENT_ID: string;
  TWITTER_CLIENT_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
  TWITTER_ACCESS_SECRET: string;
  REDDIT_CLIENT_ID: string;
  REDDIT_CLIENT_SECRET: string;
  REDDIT_REFRESH_TOKEN: string;
  REDDIT_USERNAME: string;
  DEVTO_API_KEY: string;
}

export interface Topic {
  id: string;
  title: string;
  url: string;
  source: "hn" | "reddit" | "arxiv" | "polymarket" | "techcrunch" | "theverge" | "axios" | "coindesk" | "openai_blog" | "hf_papers";
  score: number;          // source score (upvotes, etc)
  relevance: number;      // 0.0–1.0 relevance to AI/LLM/routing
  fetched_at: string;     // ISO timestamp
}

export interface GeneratedPost {
  id: string;
  topic: Topic;
  twitter_thread: string[];   // Array of tweet strings (each ≤280 chars)
  twitter_standalone: string; // Single punchy tweet
  reddit_comment: string;     // Value-add comment for relevant Reddit threads
  created_at: string;
  status: "pending_review" | "approved" | "rejected" | "published";
  scheduled_for?: string;     // ISO datetime caller wants to post
  published_at?: string;
  twitter_tweet_id?: string;
  reddit_comment_id?: string;
}

export interface GeneratedArticle {
  id: string;
  topic: Topic;
  title: string;
  markdown: string;
  tags: string[];
  seo_description: string;
  created_at: string;
  status: "pending_review" | "approved" | "rejected" | "published";
  devto_url?: string;
  published_at?: string;
}
