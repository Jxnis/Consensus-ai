import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for retrieving API keys after Stripe checkout
 * Calls the API backend which handles secure key retrieval
 */
export async function GET(req: NextRequest) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    return NextResponse.json(
      { error: 'API URL not configured' },
      { status: 500 }
    );
  }

  const sessionId = req.nextUrl.searchParams.get('session_id');
  const email = req.nextUrl.searchParams.get('email');

  if (!sessionId && !email) {
    return NextResponse.json(
      { error: 'Either session_id or email is required' },
      { status: 400 }
    );
  }

  try {
    const params = new URLSearchParams();
    if (sessionId) params.set('session_id', sessionId);
    if (email) params.set('email', email);

    const forwardedHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      forwardedHeaders['Authorization'] = authHeader;
    }

    const response = await fetch(`${apiUrl}/v1/stripe/api-key?${params}`, {
      method: 'GET',
      headers: forwardedHeaders,
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.error || 'Failed to retrieve API key' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Stripe API Key Proxy]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
