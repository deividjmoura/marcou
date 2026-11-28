const DEFAULT_NEXT_PATH = "/inicio";
const LOCAL_ORIGIN = "https://marcou.invalid";
const LOCAL_APP_ORIGIN = "http://localhost:3000";
const PRODUCTION_ORIGIN = "https://marcoou.netlify.app";
const NETLIFY_PREVIEW_HOST = /^deploy-preview-\d+--marcoou\.netlify\.app$/;

const FORMAT_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/g;

/** Remove caracteres de formato invisíveis que podem contaminar uma origem. */
export function stripFormatCharacters(value: string): string {
  return value.replace(FORMAT_CHARACTERS, "");
}

function parseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(stripFormatCharacters(value));
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) ||
      (url.protocol === "https:" && url.port !== "")
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
  const origin = parseOrigin(value);
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

  const configured = parseOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured === PRODUCTION_ORIGIN) return configured;

  if (process.env.NODE_ENV !== "production") {
    const localConfigured = parseOrigin(process.env.NEXT_PUBLIC_SITE_URL);
    if (localConfigured && new URL(localConfigured).hostname === "localhost") {
      return localConfigured;
    }

    const localRequestOrigin = parseOrigin(requestOrigin);
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

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** Decode nested percent-encoding so encoded slashes and backslashes cannot
 * turn into a network-path redirect after a later URL parse. */
function decodeRepeatedly(value: string): string | null {
  let decoded = value;

  for (let attempt = 0; attempt <= value.length; attempt += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }

    if (next === decoded) return decoded.normalize("NFC");
    decoded = next;
  }

  return null;
}

function hasUnsafePathShape(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return true;
  }

  try {
    const normalized = new URL(value, LOCAL_ORIGIN);
    if (normalized.origin !== LOCAL_ORIGIN || normalized.pathname.startsWith("//")) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
}

export function safeNextPath(value: string | null | undefined): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 4096 ||
    hasUnsafePathShape(value)
  ) {
    return DEFAULT_NEXT_PATH;
  }

  const decoded = decodeRepeatedly(value);
  if (!decoded || hasUnsafePathShape(decoded)) {
    return DEFAULT_NEXT_PATH;
  }

  return decoded;
}

export function safeNextPathFromUrl(
  searchParams: URLSearchParams,
  key = "next",
): string {
  return safeNextPath(searchParams.get(key));
}

export function normalizePhone(value: string): string {
  return value.replace(/\D+/g, "");
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 15;
}

export const PKCE_VERIFIER_MISSING_MESSAGE =
  "Abra o link no mesmo navegador em que solicitou a recuperação.";

export function oauthErrorMessage(error?: string | null): string {
  if (!error) return "Não foi possível concluir o login.";
  if (error === "access_denied") return "Login cancelado.";
  return "Não foi possível concluir o login.";
}

export function safeLoginErrorMessage(
  message?: string | null,
): string {
  if (!message) return "Não foi possível entrar.";
  return message;
}

export function loginRedirectUrl(
  origin: string,
  nextPath: string,
): string {
  const path = safeNextPath(nextPath);
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export function passwordLoginErrorMessage(code?: string | null): string {
  if (code === "invalid_credentials") return "E-mail ou senha inválidos.";
  return "Não foi possível entrar.";
}

export function signupErrorMessage(code?: string | null): string {
  if (code === "user_already_exists") return "Já existe uma conta com este e-mail.";
  return "Não foi possível criar a conta.";
}
