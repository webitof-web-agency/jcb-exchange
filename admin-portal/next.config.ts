import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // disable: process.env.NODE_ENV === "development",
  register: true,
});

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;

if (!configuredApiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL is not set');
}

const uploadOrigin = new URL(configuredApiUrl);
const uploadProtocol = uploadOrigin.protocol === 'https:' ? 'https' : 'http';

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: uploadProtocol,
        hostname: uploadOrigin.hostname,
        port: uploadOrigin.port,
        pathname: '/uploads/**',
      },
    ],
  },
};

export default withPWA(nextConfig);
