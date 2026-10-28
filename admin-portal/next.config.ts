import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // Admin portal should not keep a persistent service worker cache in production.
  // It causes stale dashboard/media builds after Vercel deploys even when the latest code is live.
  disable: true,
  register: true,
});

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!configuredApiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL is not set');
}

const getRemotePattern = (value: string, pathname: string) => {
  try {
    const parsed = new URL(value);
    return {
      protocol: parsed.protocol.replace(':', '') as 'http' | 'https',
      hostname: parsed.hostname,
      ...(parsed.port ? { port: parsed.port } : {}),
      pathname,
    };
  } catch {
    return null;
  }
};

const isLocalHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const apiOrigin = configuredApiUrl.replace(/\/api\/?$/, '');
const uploadsPattern = getRemotePattern(apiOrigin, '/uploads/public/**');
const legacyApiUploadsPattern = getRemotePattern(apiOrigin, '/api/uploads/public/**');
const driveMediaProxyPattern = getRemotePattern(apiOrigin, '/api/documents/upload/public/**');
const shouldAllowLocalIpImages =
  process.env.NODE_ENV !== 'production' &&
  (!!uploadsPattern?.hostname && isLocalHostname(uploadsPattern.hostname));

// Headers for every response, including static files. The Content-Security-Policy is set per request
// in src/proxy.ts because it carries a nonce.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  turbopack: {},
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    dangerouslyAllowLocalIP: shouldAllowLocalIpImages,
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5002',
        pathname: '/uploads/public/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5002',
        pathname: '/api/documents/upload/public/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '5002',
        pathname: '/uploads/public/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '5002',
        pathname: '/api/documents/upload/public/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'videos.pexels.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'samplelib.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'mirrorlessons.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'carmalan.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'tsmk.co.id',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.rawpixel.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ohs.com.au',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'prezentokracja.pl',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      ...(uploadsPattern ? [uploadsPattern] : []),
      ...(legacyApiUploadsPattern ? [legacyApiUploadsPattern] : []),
      ...(driveMediaProxyPattern ? [driveMediaProxyPattern] : []),
    ],
  },
  // The super admin panel moved from /superadmin to /admin. Old bookmarks and
  // notification links keep working.
  async redirects() {
    return [
      { source: '/superadmin', destination: '/admin', permanent: true },
      { source: '/superadmin/:path*', destination: '/admin/:path*', permanent: true },
    ];
  },
};

export default withPWA(nextConfig);
