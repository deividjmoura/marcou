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

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
