import { NextResponse, type NextRequest } from 'next/server';
import { apiOriginFrom, buildContentSecurityPolicy } from '@/lib/contentSecurityPolicy';

// A fresh nonce per page request; Next.js reads it from the request's CSP header and stamps it on its
// scripts, and the root layout reads `x-nonce` for its own inline script.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = buildContentSecurityPolicy({
    nonce,
    apiOrigin: apiOriginFrom(process.env.NEXT_PUBLIC_API_URL),
    isDev: process.env.NODE_ENV === 'development',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
