import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.arcrouter.com';

export async function GET() {
  try {
    const response = await fetch(`${API_URL}/api/waitlist/count`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // Cache for 5 minutes
      next: { revalidate: 300 },
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Waitlist count error:', error);
    return NextResponse.json({ count: 0 });
  }
}
