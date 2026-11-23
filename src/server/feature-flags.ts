import { createClient } from "@/lib/supabase/server";

export const SOCIAL_FEATURE_FLAGS = [
  "social_profile",
  "social_discovery",
  "social_content",
  "social_requests",
  "social_messaging",
  "social_reviews",
  "social_moderation",
] as const;

export type SocialFeatureFlag = (typeof SOCIAL_FEATURE_FLAGS)[number];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type FeatureFlagOptions = {
  /**
   * Avalia a coorte do provider somente depois de o banco provar que ele
   * pertence a auth.uid(). Nunca aceite este ID como prova de ownership.
   */
  providerId?: string;
  supabase?: SupabaseServerClient;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Avalia rollout para a conta autenticada. Falhas, flags desconhecidas e IDs
 * inválidos retornam false. A flag controla lançamento, não autorização.
 */
export async function isSocialFeatureEnabled(
  flag: SocialFeatureFlag,
  options: FeatureFlagOptions = {},
): Promise<boolean> {
  if (options.providerId && !UUID_PATTERN.test(options.providerId)) return false;

  try {
    const supabase = options.supabase ?? await createClient();
    const { data, error } = await supabase.rpc("is_feature_enabled", {
      p_flag_key: flag,
      p_provider_id: options.providerId ?? null,
    });

    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Avalia uma superfície pública. O banco só retorna true quando o módulo está
 * liberado em 100% no ambiente corrente; não há coorte anônima controlada pelo
 * navegador.
 */
export async function isPublicSocialFeatureEnabled(
  flag: SocialFeatureFlag,
  options: Pick<FeatureFlagOptions, "supabase"> = {},
): Promise<boolean> {
  try {
    const supabase = options.supabase ?? await createClient();
    const { data, error } = await supabase.rpc("is_public_feature_enabled", {
      p_flag_key: flag,
    });

    return !error && data === true;
  } catch {
    return false;
  }
}
