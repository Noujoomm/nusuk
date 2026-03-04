import { NextResponse } from 'next/server';

export async function GET() {
  const apiUrl = 'http://localhost:4000';

  // Check if API is reachable
  let apiStatus = 'unreachable';
  let apiError = '';
  try {
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    apiStatus = `${res.status} ${res.statusText}`;
    if (res.ok) {
      const body = await res.json();
      apiStatus = `OK — ${JSON.stringify(body)}`;
    }
  } catch (e: any) {
    apiError = e.message || String(e);
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    nextjs: 'running',
    api: {
      target: apiUrl,
      status: apiStatus,
      error: apiError || undefined,
    },
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      API_PORT: process.env.API_PORT,
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'MISSING',
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ? 'SET' : 'MISSING',
      CORS_ORIGINS: process.env.CORS_ORIGINS,
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || '(empty)',
    },
  });
}
