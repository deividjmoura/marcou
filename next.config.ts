import type { NextConfig } from "next";

// Netlify's CONTEXT and DEPLOY_PRIME_URL are build metadata, not runtime
// read-only variables for Functions. Capture them during next build so the
// server-side origin resolver can identify this exact deployment.
// These values are public deployment metadata (never secrets).
const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    MARCOU_AUTH_DEPLOY_CONTEXT: process.env.CONTEXT ?? "",
    MARCOU_AUTH_DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL ?? "",
  },
};

export default nextConfig;
