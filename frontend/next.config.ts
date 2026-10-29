import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // disable: process.env.NODE_ENV === "development",
  register: true,
});

const getRemotePattern = (value: string, pathname = '/uploads/public/**') => {
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

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';
const apiOrigin = apiUrl.replace(/\/api\/?$/, '');
const dynamicPattern = getRemotePattern(apiOrigin);
const dynamicDriveMediaPattern = getRemotePattern(apiOrigin, '/api/documents/upload/public/**');
const shouldAllowLocalIpImages =
  process.env.NODE_ENV !== 'production' &&
  (!!dynamicPattern?.hostname && isLocalHostname(dynamicPattern.hostname));

// Headers for every response, including static files. The Content-Security-Policy is set per request
// in src/proxy.ts because it carries a nonce.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(self), usb=(), interest-cohort=()' },
  // Google sign-in and Razorpay talk to this page from their popups.
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
    // Local development serves listing images from the backend on a private host.
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
        hostname: 'jcbexchange.com',
        pathname: '/uploads/public/**',
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
        hostname: 'www.mirrorlessons.com',
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
        hostname: 'jcb-exchange.onrender.com',
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
      ...(dynamicPattern ? [dynamicPattern] : []),
      ...(dynamicDriveMediaPattern ? [dynamicDriveMediaPattern] : []),
    ],
  },
};

export default withPWA(nextConfig);
