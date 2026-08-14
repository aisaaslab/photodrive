import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Serve next/image sources as-is (no Vercel Image Optimization billing).
    // Our gallery photos use plain <img> from Google's CDN anyway; the few
    // next/image usages are tiny static/brand images.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
