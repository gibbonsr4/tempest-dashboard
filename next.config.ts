import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` produces a self-contained server bundle in
  // `.next/standalone/` that the Dockerfile copies and runs via
  // `node server.js`. No-op for the Cloudflare (OpenNext) and Vercel
  // adapters — they bundle the app their own way and ignore this
  // output mode — but required for the Docker self-host tier to
  // produce a small (~150 MB) runtime image instead of shipping the
  // entire `node_modules`.
  output: "standalone",
};

export default nextConfig;
