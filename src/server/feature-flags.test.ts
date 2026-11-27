import { describe, expect, it, vi } from "vitest";
import {
  isPublicSocialFeatureEnabled,
  isSocialFeatureEnabled,
  SOCIAL_FEATURE_FLAGS,
} from "./feature-flags";

type InjectedClient = NonNullable<
  NonNullable<Parameters<typeof isSocialFeatureEnabled>[1]>["supabase"]
>;

function clientReturning(data: unknown, error: unknown = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  } as unknown as InjectedClient;
}

describe("feature flags sociais server-side", () => {
  it("mantém um registro fechado e estável dos módulos", () => {
    expect(SOCIAL_FEATURE_FLAGS).toEqual([
      "social_profile",
      "social_discovery",
      "social_content",
      "social_requests",
      "social_messaging",
      "social_reviews",
      "social_moderation",
    ]);
  });

  it("avalia a conta no banco sem aceitar user ID do chamador", async () => {
    const supabase = clientReturning(true);

    await expect(
      isSocialFeatureEnabled("social_profile", { supabase }),
    ).resolves.toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("is_feature_enabled", {
      p_flag_key: "social_profile",
      p_provider_id: null,
    });
  });

  it("envia provider ID somente como alvo a ser revalidado pelo banco", async () => {
    const supabase = clientReturning(true);
    const providerId = "123e4567-e89b-12d3-a456-426614174000";

    await expect(
      isSocialFeatureEnabled("social_content", { providerId, supabase }),
    ).resolves.toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("is_feature_enabled", {
      p_flag_key: "social_content",
      p_provider_id: providerId,
    });
  });

  it("falha fechado sem consultar o banco quando provider ID é inválido", async () => {
    const supabase = clientReturning(true);

    await expect(
      isSocialFeatureEnabled("social_content", {
        providerId: "provider-de-outro-usuario",
        supabase,
      }),
    ).resolves.toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("falha fechado em erro retornado, resposta inesperada ou exceção", async () => {
    await expect(
      isSocialFeatureEnabled("social_profile", {
        supabase: clientReturning(true, { message: "rpc failed" }),
      }),
    ).resolves.toBe(false);
    await expect(
      isSocialFeatureEnabled("social_profile", {
        supabase: clientReturning("true"),
      }),
    ).resolves.toBe(false);

    const throwing = {
      rpc: vi.fn(async () => {
        throw new Error("network failed");
      }),
    } as unknown as InjectedClient;
    await expect(
      isSocialFeatureEnabled("social_profile", { supabase: throwing }),
    ).resolves.toBe(false);
  });

  it("usa a avaliação pública separada e também falha fechado", async () => {
    const enabled = clientReturning(true);
    await expect(
      isPublicSocialFeatureEnabled("social_discovery", { supabase: enabled }),
    ).resolves.toBe(true);
    expect(enabled.rpc).toHaveBeenCalledWith("is_public_feature_enabled", {
      p_flag_key: "social_discovery",
    });

    await expect(
      isPublicSocialFeatureEnabled("social_discovery", {
        supabase: clientReturning(null),
      }),
    ).resolves.toBe(false);
  });
});
