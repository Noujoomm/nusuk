import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = 'http://localhost:4000';

  // Check if API is reachable
  let apiStatus = 'unreachable';
  let apiError = '';
  let apiBody = null;
  try {
    const res = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(3000) });
    apiStatus = `${res.status} ${res.statusText}`;
    if (res.ok) {
      apiBody = await res.json();
      apiStatus = 'OK';
    }
  } catch (e: any) {
    apiError = `${e.code || e.name}: ${e.message}`;
  }

  // Also try the API prefix
  let apiPrefixStatus = '';
  try {
    const res2 = await fetch(`${apiUrl}/api/auth/public-tracks`, { signal: AbortSignal.timeout(3000) });
    apiPrefixStatus = `${res2.status}`;
    if (res2.ok) {
      const body2 = await res2.json();
      apiPrefixStatus = `OK (${Array.isArray(body2) ? body2.length : 0} tracks)`;
    }
  } catch (e: any) {
    apiPrefixStatus = `FAIL: ${e.code || e.name}: ${e.message}`;
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    nextjs: 'running',
    api: {
      target: apiUrl,
      healthStatus: apiStatus,
      healthBody: apiBody,
      healthError: apiError || undefined,
      publicTracksStatus: apiPrefixStatus,
    },
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      API_PORT: process.env.API_PORT,
      DATABASE_URL: process.env.DATABASE_URL ? `SET (${process.env.DATABASE_URL.substring(0, 20)}...)` : 'MISSING',
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ? 'SET' : 'MISSING',
      CORS_ORIGINS: process.env.CORS_ORIGINS || '(not set)',
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || '(empty)',
      NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || '(empty)',
    },
  });
}
