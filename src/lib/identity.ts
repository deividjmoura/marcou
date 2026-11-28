const DEFAULT_NEXT_PATH = "/inicio";
const LOCAL_ORIGIN = "https://marcou.invalid";
const LOCAL_APP_ORIGIN = "http://localhost:3000";
const PRODUCTION_ORIGIN = "https://marcoou.netlify.app";
const NETLIFY_PREVIEW_HOST = /^deploy-preview-\d+--marcoou\.netlify\.app$/;

// Caracteres de formato Unicode que podem aparecer invisivelmente em URLs
// (ex.: U+2060 WORD JOINER, U+200B ZERO WIDTH SPACE, U+FEFF BOM). Eles não
// fazem parte de um hostname válido e podem fazer o Supabase rejeitar o
// `redirectTo`, caindo em fallback silencioso para a raiz do Site URL.
const FORMAT_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/g;

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

/** Accept only Netlify's numbered deploy-preview URL for this site. */
function netlifyPreviewOrigin(value: string | null | undefined): string | null {
  const origin = parseConfiguredOrigin(value);
  if (!origin) return null;

  try {
    const url = new URL(origin);
    return url.protocol === "https:" && NETLIFY_PREVIEW_HOST.test(url.hostname)
      ? origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Auth links/redirects use deployment metadata captured by next.config.ts at
 * build time. Preview hostnames are strictly validated. Request Host/origin is
 * ignored in production/previews; localhost is the only dev request fallback.
 */
export function trustedAppOrigin(requestOrigin?: string): string {
  if (process.env.MARCOU_AUTH_DEPLOY_CONTEXT === "deploy-preview") {
    const preview = netlifyPreviewOrigin(process.env.MARCOU_AUTH_DEPLOY_PRIME_URL);
    if (preview) return preview;
    return PRODUCTION_ORIGIN;
  }

  const configured = parseConfiguredOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured === PRODUCTION_ORIGIN) return configured;

  if (process.env.NODE_ENV !== "production") {
    const localConfigured = parseConfiguredOrigin(process.env.NEXT_PUBLIC_SITE_URL);
    if (localConfigured && new URL(localConfigured).hostname === "localhost") {
      return localConfigured;
    }

    const localRequestOrigin = parseConfiguredOrigin(requestOrigin);
    if (
      localRequestOrigin &&
      new URL(localRequestOrigin).hostname === "localhost"
    ) {
      return localRequestOrigin;
    }
    return LOCAL_APP_ORIGIN;
  }

  return PRODUCTION_ORIGIN;
}
