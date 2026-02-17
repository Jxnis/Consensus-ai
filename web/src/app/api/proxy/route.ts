import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter for the playground
// Keyed by a session identifier derived from request headers
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW_MS = 60_000;

function getRateLimitKey(req: NextRequest): string {
  // Use IP or a session-like fingerprint (CF provides CF-Connecting-IP)
  return req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const rateLimitKey = getRateLimitKey(req);
  const { allowed, remaining } = checkRateLimit(rateLimitKey);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment before trying again.' },
      { 
        status: 429,
        headers: { 'X-RateLimit-Remaining': '0', 'Retry-After': '60' }
      }
    );
  }

  const apiKey = process.env.CONSENSUS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Playground temporarily unavailable.' },
      { status: 503 }
    );
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 }
    );
  }

  try {
    // 20s timeout — generous for multi-model consensus
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const backendResponse = await fetch(`${apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-Source': 'councilrouter-playground',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!backendResponse.ok) {
      // Don't leak backend error details to the client
      const status = backendResponse.status;
      if (status === 429) {
        return NextResponse.json(
          { error: 'Rate limit reached. Please try again later.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: 'Request failed. Please try again.' },
        { status: status >= 500 ? 502 : status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data, {
      headers: { 'X-RateLimit-Remaining': String(remaining) }
    });

  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timed out. The council took too long to respond.' },
        { status: 504 }
      );
    }
    console.error('[Proxy Error]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
