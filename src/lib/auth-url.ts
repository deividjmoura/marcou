/**
 * Redirecionamentos de autenticação.
 *
 * O Supabase valida o `redirectTo` contra a lista de Redirect URLs do painel
 * comparando a URL completa (inclusive a query string). Quando a URL não
 * corresponde a uma entrada exata ou a um wildcard, ele substitui silenciosamente
 * o destino pelo Site URL — é por isso que um link de recuperação pode chegar
 * à landing page com um `code` que ninguém consome.
 *
 * Para não depender de uma entrada exata, o proxy encaminha qualquer `code`
 * recebido em um caminho que não seja o callback para `/auth/callback`. O
 * callback então reconhece a recuperação pelo `redirectType` devolvido pela
 * troca do code, e não por parâmetros da URL.
 */

export const AUTH_CALLBACK_PATH = "/auth/callback";

const AUTH_CALLBACK_PATHS = new Set([AUTH_CALLBACK_PATH, "/auth/confirm"]);

// Codes PKCE são UUIDs e token hashes são opacos. Limitamos a caracteres
// seguros para que a query não seja usada em um redirecionamento aberto.
const SAFE_AUTH_CODE = /^[A-Za-z0-9._~-]{1,512}$/;

export function isSafeAuthCode(value: string | null | undefined): value is string {
  return typeof value === "string" && SAFE_AUTH_CODE.test(value);
}

/**
 * Retorna o caminho de fallback (`/auth/callback?code=...`) quando a requisição
 * trouxe um code para uma rota que não é o callback. Retorna null caso
 * contrário, inclusive no próprio callback para evitar redirecionamento em
 * loop.
 */
export function authFallbackRedirect(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  if (AUTH_CALLBACK_PATHS.has(pathname)) return null;

  const code = searchParams.get("code");
  if (!isSafeAuthCode(code)) return null;

  const target = new URL(AUTH_CALLBACK_PATH, "http://localhost");
  target.searchParams.set("code", code);
  return `${target.pathname}${target.search}`;
}
