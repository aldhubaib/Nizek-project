import path from "node:path";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: "standalone",
  // Without this, a stray lockfile above the repo can make Turbopack pick a parent
  // directory as the workspace root and watch everything under it. Note that
  // changing this invalidates the symlinks Next writes under .next/*/node_modules:
  // they are stored relative to the root, so a .next built under the old root
  // points outside the new one and every PostCSS glob fails against it. Delete
  // .next after changing this.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  experimental: {
    // turbopackMemoryLimit (a hard byte cap) was removed in Next 16.3. Its
    // replacement is turbopackMemoryEviction, which defaults to 'auto' and
    // persists cache to disk then evicts it from memory -- the fix for the
    // unbounded dev-server growth that panicked this machine on 2026-08-01.
    // Defaults to os.cpus().length (16 here), which is what spawned 12
    // simultaneous workers.
    cpus: 6,
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
