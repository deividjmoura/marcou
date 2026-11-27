/**
 * Redirecionamentos de autenticação.
 *
 * O Supabase valida o `redirectTo` contra a lista de Redirect URLs do painel
 * comparando a URL completa (inclusive a query string). Quando a URL não
 * corresponde a uma entrada exata ou a um wildcard, ele substitui
 * silenciosamente o destino pelo Site URL — é por isso que um link de
 * recuperação pode chegar à landing page com um `code` ou `token_hash` que
 * ninguém consome.
 *
 * Para não depender apenas da allowlist, o proxy encaminha qualquer `code`
 * recebido fora de `/auth/callback` para `/auth/callback` e qualquer
 * `token_hash` (com `type` válido) recebido fora de `/auth/confirm` para
 * `/auth/confirm`. O callback reconhece a recuperação pelo `redirectType`
 * devolvido pela troca do code, e o confirm reconhece por `type=recovery`,
 * e não por parâmetros de URL controláveis.
 */

export const AUTH_CALLBACK_PATH = "/auth/callback";
export const AUTH_CONFIRM_PATH = "/auth/confirm";

// Codes PKCE são UUIDs e token hashes são opacos. Limitamos a caracteres
// seguros para que a query não seja usada em um redirecionamento aberto.
const SAFE_AUTH_CODE = /^[A-Za-z0-9._~-]{1,512}$/;

export function isSafeAuthCode(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && SAFE_AUTH_CODE.test(value);
}

/** Token hashes usam o mesmo alfabeto opaco dos codes PKCE. */
export function isSafeTokenHash(
  value: string | null | undefined,
): value is string {
  return isSafeAuthCode(value);
}

const VALID_TOKEN_TYPES = new Set(["email", "recovery"]);

/**
 * Retorna o caminho de fallback quando a requisição trouxe um code ou
 * token_hash para uma rota que não é o handler correto. Retorna null caso
 * contrário, inclusive quando já está no handler correto para evitar loop.
 *
 * Apenas o code (ou token_hash + type) é reaproveitado; nenhum `next` da
 * URL é encaminhado. O handler destino valida o destino final por conta
 * própria, e a recuperação é reconhecida por `redirectType`/`type`, não
 * por `next`/`flow` da URL.
 */
export function authFallbackRedirect(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");

  // token_hash pertence ao /auth/confirm. Tem prioridade sobre o code porque
  // funciona mesmo quando o link é aberto em outro navegador.
  if (isSafeTokenHash(tokenHash) && type && VALID_TOKEN_TYPES.has(type)) {
    if (pathname === AUTH_CONFIRM_PATH) return null;
    const target = new URL(AUTH_CONFIRM_PATH, "http://localhost");
    target.searchParams.set("token_hash", tokenHash);
    target.searchParams.set("type", type);
    return `${target.pathname}${target.search}`;
  }

  // code pertence ao /auth/callback. Um code que chega em /auth/confirm
  // (template padrão via /auth/v1/verify) também é encaminhado para cá.
  if (isSafeAuthCode(code)) {
    if (pathname === AUTH_CALLBACK_PATH) return null;
    const target = new URL(AUTH_CALLBACK_PATH, "http://localhost");
    target.searchParams.set("code", code);
    return `${target.pathname}${target.search}`;
  }

  return null;
}
