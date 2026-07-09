import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    proxyClientMaxBodySize: "100mb",
    // Server Actions default to a 1MB request body, which silently rejects most
    // mobile photos before the action runs (avatar, branding/logo, login photos,
    // notification sound all POST file bytes through a Server Action). Raise it to
    // cover the largest of those (branding/login allow 10MB). Big user-content
    // uploads (chat, comments, assets) still go direct-to-R2 via presigned URLs.
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "**.cloudflarestorage.com" },
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "www.gravatar.com" },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
