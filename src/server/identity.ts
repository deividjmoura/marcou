import { AsyncLocalStorage } from "node:async_hooks";
import { createClient } from "@/lib/supabase/server";

export type AccountMode = "customer" | "provider";

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AuthStepName = "validate_input" | "auth_sign_in" | "ensure_profile";

/**
 * Métrica de etapa de autenticação estritamente livre de PII/segredos.
 * Registra apenas o identificador fixo da etapa, a duração em milissegundos e,
 * quando aplicável, se houve escrita de provisionamento em `profiles`.
 */
export interface AuthStepTiming {
  step: AuthStepName;
  durationMs: number;
  profileWritten?: boolean;
}

export type AuthTimingCollector = (entry: AuthStepTiming) => void;

const authTimingStorage = new AsyncLocalStorage<AuthTimingCollector>();

export function withAuthTimingCollector<T>(
  collector: AuthTimingCollector,
  fn: () => Promise<T>,
): Promise<T> {
  return authTimingStorage.run(collector, fn);
}

export async function measureAuthStep<T>(
  step: AuthStepName,
  fn: () => Promise<T> | T,
  extractMeta?: (result: T) => { profileWritten?: boolean },
): Promise<T> {
  const collector = authTimingStorage.getStore();
  if (!collector) {
    return await fn();
  }

  const startedAt = performance.now();
  try {
    const result = await fn();
    const durationMs = Number((performance.now() - startedAt).toFixed(3));
    const meta = extractMeta ? extractMeta(result) : undefined;
    collector({
      step,
      durationMs,
      ...(meta?.profileWritten !== undefined
        ? { profileWritten: meta.profileWritten }
        : {}),
    });
    return result;
  } catch (error) {
    const durationMs = Number((performance.now() - startedAt).toFixed(3));
    collector({ step, durationMs });
    throw error;
  }
}

export interface EnsureAuthProfileResult {
  phone: string | null;
  needsPhone: boolean;
  wroteProfile: boolean;
}

interface ProfileRow {
  display_name: string | null;
  phone: string | null;
}

function extractMetadataDisplayName(user: {
  user_metadata?: Record<string, unknown>;
}): string | undefined {
  const raw =
    user.user_metadata?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    null;

  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, 80) : undefined;
}

function toEnsureResult(
  row: ProfileRow,
  wroteProfile: boolean,
): EnsureAuthProfileResult {
  const phone =
    typeof row.phone === "string" && row.phone.trim() ? row.phone : null;
  return {
    phone,
    needsPhone: !phone,
    wroteProfile,
  };
}

/**
 * Garante o perfil privado do usuário autenticado e informa se o telefone ainda
 * precisa ser preenchido, evitando consultas e escritas redundantes:
 *
 * - Caminho rápido (logins recorrentes): 1 único `SELECT display_name, phone`
 *   e 0 escritas quando a linha já existe e o nome não precisa de backfill.
 * - Primeiro acesso (`existing === null`): `INSERT ... ON CONFLICT DO NOTHING`
 *   retornando `display_name, phone`, com releitura apenas se outra requisição
 *   concorrente tiver criado a linha no mesmo instante.
 * - Backfill de nome ausente: `UPDATE` protegido por guarda CAS sobre o valor
 *   anterior de `display_name`, impedindo sobrescrever um nome salvo em `/perfil`
 *   em paralelo.
 */
export async function ensureAuthProfile(
  supabase: ServerSupabaseClient,
  user: { id: string; user_metadata?: Record<string, unknown> },
): Promise<EnsureAuthProfileResult> {
  const metadataName = extractMetadataDisplayName(user);

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("display_name, phone")
    .eq("id", user.id)
    .maybeSingle();

  if (selectError) {
    throw new Error("Não foi possível carregar seu perfil.");
  }

  const hasExistingName =
    typeof existing?.display_name === "string" &&
    existing.display_name.trim().length > 0;

  if (existing && (hasExistingName || !metadataName)) {
    return toEnsureResult(existing as ProfileRow, false);
  }

  if (!existing) {
    const profileRow: { id: string; display_name?: string } = { id: user.id };
    if (metadataName) {
      profileRow.display_name = metadataName;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("profiles")
      .upsert(profileRow, { onConflict: "id", ignoreDuplicates: true })
      .select("display_name, phone")
      .maybeSingle();

    if (insertError) {
      throw new Error("Não foi possível preparar seu perfil.");
    }

    if (inserted) {
      return toEnsureResult(inserted as ProfileRow, true);
    }
  } else if (metadataName) {
    const baseUpdate = supabase
      .from("profiles")
      .update({ display_name: metadataName })
      .eq("id", user.id);

    const guardedUpdate =
      existing.display_name === null
        ? baseUpdate.is("display_name", null)
        : baseUpdate.eq("display_name", existing.display_name);

    const { data: updated, error: updateError } = await guardedUpdate
      .select("display_name, phone")
      .maybeSingle();

    if (updateError) {
      throw new Error("Não foi possível preparar seu perfil.");
    }

    if (updated) {
      return toEnsureResult(updated as ProfileRow, true);
    }
  }

  // Outra requisição concorrente inseriu ou atualizou o perfil entre a leitura
  // e a escrita protegida: relê o estado vencedor sem sobrescrevê-lo.
  const { data: current, error: rereadError } = await supabase
    .from("profiles")
    .select("display_name, phone")
    .eq("id", user.id)
    .single();

  if (rereadError || !current) {
    throw new Error("Não foi possível carregar seu perfil.");
  }

  return toEnsureResult(current as ProfileRow, false);
}

/** Reads only the caller's effective navigation preference through an RPC that
 * derives auth.uid() and provider ownership inside PostgreSQL. */
export async function getPreferredMode(): Promise<AccountMode> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_preferred_mode");
    if (error || data !== "provider") return "customer";
    return "provider";
  } catch {
    return "customer";
  }
}
