const DEFAULT_NEXT_PATH = "/inicio";
const LOCAL_ORIGIN = "https://marcou.invalid";
const LOCAL_APP_ORIGIN = "http://localhost:3000";

// Caracteres de formato Unicode que podem aparecer invisivelmente em URLs
// (ex.: U+2060 WORD JOINER, U+200B ZERO WIDTH SPACE, U+FEFF BOM). Eles não
// fazem parte de um hostname válido e podem fazer o Supabase rejeitar o
// `redirectTo`, caindo em fallback silencioso para a raiz do Site URL.
const FORMAT_CHARACTERS = /[\\u200B-\\u200D\\u2060\\uFEFF]/g;
const NETLIFY_SITE_HOST = "marcoou.netlify.app";
const NETLIFY_DEPLOY_PREVIEW_HOST = /^deploy-preview-\\d+--marcoou\\.netlify\\.app$/i;

/** Remove caracteres de formato invisíveis que podem contaminar uma origem. */
export function stripFormatCharacters(value: string): string {
  return value.replace(FORMAT_CHARACTERS, "");
}

function parseConfiguredOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(stripFormatCharacters(value));
    if (
      url.username !== "" ||
      url.password !== "" ||
      (url.protocol !== "https:" && url.hostname !== "localhost")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Requests may use the production host, a Netlify PR preview, or localhost. */
function isTrustedRequestOrigin(value: string | null | undefined): string | null {
  const origin = parseConfiguredOrigin(value);
  if (!origin) return null;

  const url = new URL(origin);
  const isLocalhost = url.hostname === "localhost";
  const isNetlifySite = url.protocol === "https:" && (
    url.hostname === NETLIFY_SITE_HOST ||
    NETLIFY_DEPLOY_PREVIEW_HOST.test(url.hostname)
  );
  return isLocalhost || isNetlifySite ? origin : null;
}

/**
 * Email and callback redirects must use a configured public origin. Request
 * origins are accepted only for localhost and the exact Marcou Netlify site /
 * numbered PR-preview hostname. Arbitrary Host and forwarded-host values are
 * never reflected into auth links or redirects.
 */
export function trustedAppOrigin(requestOrigin?: string): string {
  const trustedRequestOrigin = isTrustedRequestOrigin(requestOrigin);
  if (trustedRequestOrigin) return trustedRequestOrigin;

  const configured = parseConfiguredOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  return LOCAL_APP_ORIGIN;
}
