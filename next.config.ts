import type { NextConfig } from "next";
import {
  PRIVATE_NO_STORE_HEADER,
  PRIVATE_ROUTE_PREFIXES,
} from "./src/lib/cache-policy";

const PRIVATE_CACHE_HEADERS = [
  { key: "Cache-Control", value: PRIVATE_NO_STORE_HEADER },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

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
  async headers() {
    // Defesa em profundidade: garante private, no-store na camada de resposta
    // do Next.js/Netlify para rotas autenticadas, callbacks de auth e APIs.
    return PRIVATE_ROUTE_PREFIXES.flatMap((prefix) => [
      { source: prefix, headers: PRIVATE_CACHE_HEADERS },
      { source: `${prefix}/:path*`, headers: PRIVATE_CACHE_HEADERS },
    ]);
  },
};

export default nextConfig;
