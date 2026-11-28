export const PRIVATE_NO_STORE_HEADER =
  "private, no-store, max-age=0, must-revalidate";

export const PUBLIC_STATIC_CACHE_HEADER =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=60";

export const PUBLIC_DYNAMIC_CACHE_HEADER =
  "public, max-age=0, must-revalidate";

/**
 * Prefixos que nunca podem ser armazenados por CDN ou proxy compartilhado
 * (páginas autenticadas, callbacks de autenticação e endpoints de API).
 */
export const PRIVATE_ROUTE_PREFIXES = [
  "/inicio",
  "/minha-conta",
  "/painel",
  "/perfil",
  "/meus-agendamentos",
  "/notificacoes",
  "/reserva",
  "/consentimento",
  "/redefinir-senha",
  "/auth",
  "/api",
] as const;

/** Páginas públicas institucionais/legais com conteúdo estável para visitantes anônimos. */
export const PUBLIC_STATIC_ROUTES = new Set<string>([
  "/",
  "/documentos",
  "/termos",
  "/privacidade",
  "/diretrizes-da-comunidade",
  "/politica-de-conteudo-e-avaliacoes",
]);

export type CachePolicyKind = "private" | "public_static" | "public_dynamic";

export interface CachePolicy {
  kind: CachePolicyKind;
  cacheControl: string;
  noStore: boolean;
}

function normalizePath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function isPrivatePath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}

/** Detecta cookies de sessão emitidos pelo Supabase Auth (`sb-*-auth-token*`). */
export function hasSupabaseAuthCookie(
  cookies: ReadonlyArray<{ name: string }>,
): boolean {
  return cookies.some((cookie) => /^sb-[a-z0-9-]+-auth-token/i.test(cookie.name));
}

export function resolveCachePolicy(
  pathname: string,
  options: { hasSetCookie?: boolean; hasAuthCookie?: boolean } = {},
): CachePolicy {
  const normalized = normalizePath(pathname);

  if (
    isPrivatePath(normalized) ||
    options.hasSetCookie ||
    options.hasAuthCookie
  ) {
    return {
      kind: "private",
      cacheControl: PRIVATE_NO_STORE_HEADER,
      noStore: true,
    };
  }

  if (PUBLIC_STATIC_ROUTES.has(normalized)) {
    return {
      kind: "public_static",
      cacheControl: PUBLIC_STATIC_CACHE_HEADER,
      noStore: false,
    };
  }

  return {
    kind: "public_dynamic",
    cacheControl: PUBLIC_DYNAMIC_CACHE_HEADER,
    noStore: false,
  };
}

/**
 * Aplica cabeçalhos de cache à resposta respeitando qualquer `no-store` já
 * definido anteriormente (nunca relaxa uma resposta já privada).
 */
export function applyCacheHeaders<T extends Response>(
  response: T,
  pathname: string,
  options: { hasSetCookie?: boolean; hasAuthCookie?: boolean } = {},
): T {
  const existing = response.headers.get("cache-control");
  if (existing && /no-store/i.test(existing)) {
    return response;
  }

  const policy = resolveCachePolicy(pathname, options);
  response.headers.set("Cache-Control", policy.cacheControl);

  if (policy.noStore) {
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  } else {
    const vary = response.headers.get("vary");
    if (!vary) {
      response.headers.set("Vary", "Cookie");
    } else if (!/\bcookie\b/i.test(vary)) {
      response.headers.set("Vary", `${vary}, Cookie`);
    }
  }

  return response;
}
