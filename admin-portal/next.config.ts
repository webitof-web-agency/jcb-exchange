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
const shouldAllowLocalIpImages =
  process.env.NODE_ENV !== 'production' &&
  (!!uploadsPattern?.hostname && isLocalHostname(uploadsPattern.hostname));

const nextConfig: NextConfig = {
  turbopack: {},
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
        hostname: '127.0.0.1',
        port: '5002',
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
      ...(uploadsPattern ? [uploadsPattern] : []),
      ...(legacyApiUploadsPattern ? [legacyApiUploadsPattern] : []),
    ],
  },
};

export default withPWA(nextConfig);
