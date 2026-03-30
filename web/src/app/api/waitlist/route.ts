import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.arcrouter.com';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await fetch(`${API_URL}/api/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward real IP for rate limiting
        'cf-connecting-ip': req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown',
        // Forward referer
        'referer': req.headers.get('referer') || '',
        // Forward user agent
        'user-agent': req.headers.get('user-agent') || '',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Waitlist proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to submit email' },
      { status: 500 }
    );
  }
}
