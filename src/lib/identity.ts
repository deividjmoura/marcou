const DEFAULT_NEXT_PATH = "/inicio";
const LOCAL_ORIGIN = "https://marcou.invalid";
const PRODUCTION_ORIGIN = "https://marcoou.netlify.app";
const NETLIFY_PREVIEW_HOST = /^deploy-preview-\d+--marcoou\.netlify\.app$/;

function parseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      (url.protocol !== "https:" && url.hostname !== "localhost") ||
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
 * Auth links/redirects must be built from trusted deployment configuration.
 * Netlify's CONTEXT + DEPLOY_PRIME_URL are used only for deploy previews and
 * the preview hostname is strictly validated. Request Host/origin is ignored
 * in production; localhost is the only request-origin fallback in development.
 */
export function trustedAppOrigin(requestOrigin?: string): string {
  if (process.env.CONTEXT === "deploy-preview") {
    const preview = netlifyPreviewOrigin(process.env.DEPLOY_PRIME_URL);
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
const CONTROL_CHARACTERS = /[\\u0000-\\u001f\\u007f]/;

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
    value.includes("\\\\") ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return true;
  }

  try {
    const normalized = new URL(value, LOCAL_ORIGIN);
    if (normalized.origin !== LOCAL_ORIGIN || normalized.pathname.startsWith("//")) {
      return true;
    }

    const decodedPath = decodeRepeatedly(normalized.pathname);
    if (
      !decodedPath ||
      !decodedPath.startsWith("/") ||
      decodedPath.startsWith("//") ||
      decodedPath.includes("\\\\") ||
      CONTROL_CHARACTERS.test(decodedPath)
    ) {
      return true;
    }

    // Resolve encoded dot segments and separators once more after decoding.
    const normalizedDecodedPath = new URL(decodedPath, LOCAL_ORIGIN);
    return (
      normalizedDecodedPath.origin !== LOCAL_ORIGIN ||
      normalizedDecodedPath.pathname.startsWith("//")
    );
  } catch {
    return true;
  }
}

/**
 * Accepts only a normalized, same-origin application path. Decoding and URL
 * normalization are validated before returning the local path so nested
 * percent-encoding, dot segments and backslashes cannot become open redirects.
 */
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
  if (!decoded || hasUnsafePathShape(decoded)) return DEFAULT_NEXT_PATH;

  try {
    const normalized = new URL(value, LOCAL_ORIGIN);
    if (normalized.origin !== LOCAL_ORIGIN) return DEFAULT_NEXT_PATH;
    return `${normalized.pathname}${normalized.search}${normalized.hash}`;
  } catch {
    return DEFAULT_NEXT_PATH;
  }
}

/** Accepts either a local path or an absolute URL on the current app origin. */
export function safeNextPathFromUrl(
  value: string | null | undefined,
  origin: string,
): string {
  if (!value) return DEFAULT_NEXT_PATH;

  try {
    const expectedOrigin = new URL(origin).origin;
    const target = new URL(value, expectedOrigin);
    if (target.origin !== expectedOrigin) return DEFAULT_NEXT_PATH;

    // Older confirmation templates used the app callback as RedirectTo. Keep
    // that return destination local and unwrap its own validated `next` value.
    if (target.pathname === "/auth/callback") {
      const callbackNext = target.searchParams.get("next");
      if (callbackNext) return safeNextPath(callbackNext);
    }

    return safeNextPath(`${target.pathname}${target.search}${target.hash}`);
  } catch {
    return DEFAULT_NEXT_PATH;
  }
}

export function normalizePhone(value: string): string {
  return value.replace(/\\D/g, "");
}

export function isValidPhone(value: string): boolean {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Mensagem amigável para falhas do provedor de OAuth. O `error_description`
 * vem do provedor e não é exposto na interface.
 */
export function oauthErrorMessage(error?: string | null): string {
  if (error === "access_denied") {
    return "O login com Google foi cancelado. Tente novamente quando quiser.";
  }
  return "Não foi possível concluir a autenticação. Tente novamente.";
}

const SAFE_LOGIN_ERRORS = new Set([
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  "O login com Google foi cancelado. Tente novamente quando quiser.",
  "Não foi possível concluir a autenticação. Tente novamente.",
  "Não foi possível iniciar o login com Google.",
  "Não foi possível carregar seu perfil.",
  "O link de confirmação é inválido ou está incompleto. Solicite um novo e-mail.",
  "O link de confirmação expirou ou já foi utilizado. Solicite um novo e-mail.",
  "E-mail confirmado, mas não foi possível carregar seu perfil.",
]);

/** Only callback messages generated by this application may be shown from a URL. */
export function safeLoginErrorMessage(
  value: string | null | undefined,
): string | undefined {
  return value && SAFE_LOGIN_ERRORS.has(value) ? value : undefined;
}

/**
 * Monta o destino de retorno para o login preservando o caminho original.
 * Usado quando o callback OAuth falha para que o usuário não perca o fluxo
 * que estava tentando concluir.
 */
export function loginRedirectUrl(
  origin: string,
  next: string,
  error?: string,
): string {
  const url = new URL("/login", origin);
  if (error) url.searchParams.set("error", error);
  url.searchParams.set("next", safeNextPath(next));
  return url.toString();
}

/** Mensagem segura para falhas conhecidas de login por senha. */
export function passwordLoginErrorMessage(code?: string | null): string {
  if (code === "email_not_confirmed") {
    return "Seu e-mail ainda não foi confirmado. Abra o link enviado para concluir o cadastro.";
  }
  if (code === "over_request_rate_limit") {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  }
  return "E-mail ou senha incorretos.";
}

/** Mensagem segura para falhas conhecidas ao criar conta. */
export function signupErrorMessage(code?: string | null): string {
  if (code === "email_address_not_authorized") {
    return "O envio de confirmação ainda não está habilitado para esse endereço. A equipe precisa configurar o serviço de e-mail do Marcou.";
  }
  if (code === "over_email_send_rate_limit") {
    return "O limite de e-mails de confirmação foi atingido. Aguarde antes de tentar novamente.";
  }
  return "Não foi possível criar a conta com esses dados.";
}
