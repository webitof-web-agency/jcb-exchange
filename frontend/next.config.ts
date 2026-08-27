import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // disable: process.env.NODE_ENV === "development",
  register: true,
});

const getRemotePattern = (value: string) => {
  try {
    const parsed = new URL(value);
    return {
      protocol: parsed.protocol.replace(':', '') as 'http' | 'https',
      hostname: parsed.hostname,
      ...(parsed.port ? { port: parsed.port } : {}),
      pathname: '/uploads/public/**',
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
const shouldAllowLocalIpImages =
  process.env.NODE_ENV !== 'production' &&
  (!!dynamicPattern?.hostname && isLocalHostname(dynamicPattern.hostname));

const nextConfig: NextConfig = {
  turbopack: {},
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
        hostname: '127.0.0.1',
        port: '5002',
        pathname: '/uploads/public/**',
      },
      {
        protocol: 'https',
        hostname: 'jcbexchange.com',
        pathname: '/uploads/public/**',
      },
      ...(dynamicPattern ? [dynamicPattern] : []),
    ],
  },
};

export default withPWA(nextConfig);
