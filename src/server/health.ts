import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import packageJson from "../../package.json";
import { getSupabasePublicEnv, isSupabaseConfigured } from "@/lib/env";

export const APP_VERSION = packageJson.version;

const SAFE_COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * Retorna um identificador curto de commit de build (somente hexadecimal),
 * sem consultar segredos nem variáveis sensíveis de infraestrutura.
 */
export function getBuildCommit(
  env: Record<string, string | undefined> = process.env,
): string {
  const candidates = [
    env.COMMIT_REF,
    env.GITHUB_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && SAFE_COMMIT_PATTERN.test(trimmed)) {
      return trimmed.slice(0, 7).toLowerCase();
    }
  }
  return "unknown";
}

/**
 * Qualquer pedido explícito de verificação profunda (?deep=1, ?deep=true,
 * ?deep sem valor, ?mode=deep) exige credencial Bearer. Somente ausência ou
 * deep=0/false permanecem no modo mínimo público.
 */
export function isDeepHealthRequested(url: URL): boolean {
  const mode = url.searchParams.get("mode");
  if (mode !== null && mode.trim().toLowerCase() === "deep") {
    return true;
  }
  if (!url.searchParams.has("deep")) {
    return false;
  }
  const value = (url.searchParams.get("deep") ?? "").trim().toLowerCase();
  return value !== "0" && value !== "false";
}

/** Fail-closed: compara Bearer token com HEALTH_CHECK_SECRET em tempo constante. */
export function isHealthDeepAuthorized(
  request: Request,
  secret: string | undefined = process.env.HEALTH_CHECK_SECRET,
): boolean {
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization) return false;

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return false;

  const expected = Buffer.from(secret, "utf8");
  const received = Buffer.from(match[1], "utf8");

  return (
    expected.length > 0 &&
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}

export type DatabaseHealthStatus = "ok" | "unconfigured" | "error";

/**
 * Verificação profunda da conectividade com o banco usando cliente @supabase/ssr
 * sem cookies e apenas credenciais públicas (sem service-role), consultando uma
 * tabela pública somente-leitura com timeout limitado.
 */
export async function checkDatabaseHealth(
  timeoutMs = 3000,
): Promise<DatabaseHealthStatus> {
  if (!isSupabaseConfigured()) {
    return "unconfigured";
  }

  const { url, publishableKey } = getSupabasePublicEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const supabase = createServerClient(url, publishableKey, {
      cookies: { getAll: () => [], setAll: () => undefined },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: controller.signal }),
      },
    });

    const { error } = await supabase
      .from("legal_documents")
      .select("id", { head: true })
      .limit(1);

    return error ? "error" : "ok";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}
