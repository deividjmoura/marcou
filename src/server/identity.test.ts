import { describe, expect, it, vi } from "vitest";
import {
  ensureAuthProfile,
  measureAuthFlow,
  measureAuthStep,
  serializeSafeAuthFlowTiming,
  withAuthFlowCollector,
  withAuthTimingCollector,
  type AuthFlowTiming,
  type AuthStepTiming,
  type ServerSupabaseClient,
} from "./identity";

function buildMockSupabase({
  initialRead,
  upsertResult,
  updateResult,
  rereadResult,
}: {
  initialRead: { data: unknown; error: unknown };
  upsertResult?: { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
  rereadResult?: { data: unknown; error: unknown };
}) {
  const selectSpy = vi.fn();
  const upsertSpy = vi.fn();
  const updateSpy = vi.fn();
  const updateIsSpy = vi.fn();
  const updateEqDisplaySpy = vi.fn();

  let selectCalls = 0;

  const client = {
    from: vi.fn((table: string) => {
      expect(table).toBe("profiles");
      return {
        select: (columns: string) => {
          selectSpy(columns);
          selectCalls += 1;
          const callIndex = selectCalls;
          return {
            eq: () => ({
              maybeSingle: vi.fn(async () => {
                expect(callIndex).toBe(1);
                return initialRead;
              }),
              single: vi.fn(async () => {
                if (!rereadResult) {
                  throw new Error("Unexpected reread call");
                }
                return rereadResult;
              }),
            }),
          };
        },
        upsert: (payload: unknown, options: unknown) => {
          upsertSpy(payload, options);
          return {
            select: () => ({
              maybeSingle: vi.fn(async () => {
                if (!upsertResult) {
                  throw new Error("Unexpected upsert call");
                }
                return upsertResult;
              }),
            }),
          };
        },
        update: (payload: unknown) => {
          updateSpy(payload);
          return {
            eq: () => ({
              is: (col: string, val: unknown) => {
                updateIsSpy(col, val);
                return {
                  select: () => ({
                    maybeSingle: vi.fn(async () => {
                      if (!updateResult) {
                        throw new Error("Unexpected update call");
                      }
                      return updateResult;
                    }),
                  }),
                };
              },
              eq: (col: string, val: unknown) => {
                updateEqDisplaySpy(col, val);
                return {
                  select: () => ({
                    maybeSingle: vi.fn(async () => {
                      if (!updateResult) {
                        throw new Error("Unexpected update call");
                      }
                      return updateResult;
                    }),
                  }),
                };
              },
            }),
          };
        },
      };
    }),
  };

  return {
    supabase: client as unknown as ServerSupabaseClient,
    selectSpy,
    upsertSpy,
    updateSpy,
    updateIsSpy,
    updateEqDisplaySpy,
  };
}

describe("ensureAuthProfile", () => {
  it("usa caminho rápido (1 SELECT, 0 escritas) quando perfil já existe com nome e telefone", async () => {
    const { supabase, selectSpy, upsertSpy, updateSpy } = buildMockSupabase({
      initialRead: {
        data: { display_name: "Ana Paula", phone: "47999991234" },
        error: null,
      },
    });

    const result = await ensureAuthProfile(supabase, {
      id: "user-1",
      user_metadata: { display_name: "Ana Google" },
    });

    expect(result).toEqual({
      phone: "47999991234",
      needsPhone: false,
      wroteProfile: false,
    });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(selectSpy).toHaveBeenCalledWith("display_name, phone");
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("usa caminho rápido (1 SELECT, 0 escritas) quando perfil já tem nome mas ainda não tem telefone", async () => {
    const { supabase, selectSpy, upsertSpy, updateSpy } = buildMockSupabase({
      initialRead: {
        data: { display_name: "Ana Paula", phone: null },
        error: null,
      },
    });

    const result = await ensureAuthProfile(supabase, {
      id: "user-1",
      user_metadata: { display_name: "Ana Paula" },
    });

    expect(result).toEqual({
      phone: null,
      needsPhone: true,
      wroteProfile: false,
    });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("não executa escrita quando o perfil existe sem nome e o provedor não informou nome", async () => {
    const { supabase, selectSpy, upsertSpy, updateSpy } = buildMockSupabase({
      initialRead: {
        data: { display_name: null, phone: "47999991234" },
        error: null,
      },
    });

    const result = await ensureAuthProfile(supabase, {
      id: "user-1",
      user_metadata: {},
    });

    expect(result).toEqual({
      phone: "47999991234",
      needsPhone: false,
      wroteProfile: false,
    });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("cria o perfil no primeiro login com ignoreDuplicates para evitar sobrescrita concorrente", async () => {
    const { supabase, upsertSpy } = buildMockSupabase({
      initialRead: { data: null, error: null },
      upsertResult: {
        data: { display_name: "Ana", phone: null },
        error: null,
      },
    });

    const result = await ensureAuthProfile(supabase, {
      id: "user-new",
      user_metadata: { full_name: "  Ana  " },
    });

    expect(result).toEqual({
      phone: null,
      needsPhone: true,
      wroteProfile: true,
    });
    expect(upsertSpy).toHaveBeenCalledWith(
      { id: "user-new", display_name: "Ana" },
      { onConflict: "id", ignoreDuplicates: true },
    );
  });

  it("preserva o perfil vencedor quando outra requisição concorrente inseriu a linha antes do upsert", async () => {
    const { supabase, selectSpy, upsertSpy } = buildMockSupabase({
      initialRead: { data: null, error: null },
      // ON CONFLICT DO NOTHING retorna null quando outra transação inseriu antes
      upsertResult: { data: null, error: null },
      rereadResult: {
        data: { display_name: "Nome Escolhido", phone: "47988887777" },
        error: null,
      },
    });

    const result = await ensureAuthProfile(supabase, {
      id: "user-race",
      user_metadata: { name: "Nome Provedor" },
    });

    expect(result).toEqual({
      phone: "47988887777",
      needsPhone: false,
      wroteProfile: false,
    });
    expect(upsertSpy).toHaveBeenCalledOnce();
    expect(selectSpy).toHaveBeenCalledTimes(2);
  });

  it("preenche display_name ausente usando guarda CAS e preserva atualização concorrente em /perfil", async () => {
    const { supabase, updateSpy, updateIsSpy } = buildMockSupabase({
      initialRead: {
        data: { display_name: null, phone: null },
        error: null,
      },
      // Outra requisição em /perfil preencheu display_name e phone no meio-tempo
      updateResult: { data: null, error: null },
      rereadResult: {
        data: { display_name: "Nome do Perfil", phone: "47977776666" },
        error: null,
      },
    });

    const result = await ensureAuthProfile(supabase, {
      id: "user-cas",
      user_metadata: { name: "Nome OAuth" },
    });

    expect(updateSpy).toHaveBeenCalledWith({ display_name: "Nome OAuth" });
    expect(updateIsSpy).toHaveBeenCalledWith("display_name", null);
    expect(result).toEqual({
      phone: "47977776666",
      needsPhone: false,
      wroteProfile: false,
    });
  });

  it("falha de forma explícita quando a leitura inicial de profiles retorna erro", async () => {
    const { supabase, upsertSpy } = buildMockSupabase({
      initialRead: { data: null, error: { message: "connection timeout" } },
    });

    await expect(
      ensureAuthProfile(supabase, {
        id: "user-err",
        user_metadata: { display_name: "Ana" },
      }),
    ).rejects.toThrow("Não foi possível carregar seu perfil.");
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("isola medições de tempo por escopo assíncrono sem vazar dados sensíveis", async () => {
    const timingsA: AuthStepTiming[] = [];
    const timingsB: AuthStepTiming[] = [];

    await Promise.all([
      withAuthTimingCollector(
        (entry) => timingsA.push(entry),
        async () => {
          await measureAuthStep("validate_input", () => "segredo-a@example.com");
          await measureAuthStep(
            "ensure_profile",
            async () => ({ wroteProfile: false, secretToken: "tok-a" }),
            (res) => ({ profileWritten: res.wroteProfile }),
          );
        },
      ),
      withAuthTimingCollector(
        (entry) => timingsB.push(entry),
        async () => {
          await measureAuthStep("auth_sign_in", () => "senha-super-secreta");
        },
      ),
    ]);

    expect(timingsA).toHaveLength(2);
    expect(timingsA[0]?.step).toBe("validate_input");
    expect(timingsA[1]?.step).toBe("ensure_profile");
    expect(timingsA[1]?.profileWritten).toBe(false);
    expect(timingsB).toHaveLength(1);
    expect(timingsB[0]?.step).toBe("auth_sign_in");

    const serialized = JSON.stringify({ timingsA, timingsB });
    expect(serialized).not.toContain("segredo");
    expect(serialized).not.toContain("senha");
    expect(serialized).not.toContain("tok-a");
  });

  it("serializa fluxo completo somente com enums permitidos e durações numéricas", async () => {
    const reports: AuthFlowTiming[] = [];

    await withAuthFlowCollector(
      (report) => reports.push(report),
      async () => {
        await measureAuthFlow("password_login", async (setOutcome) => {
          await measureAuthStep("validate_input", () => ({
            email: "nao-registrar@example.com",
          }));
          await measureAuthStep("auth_sign_in", () => ({
            token: "jwt-secreto",
          }));
          await measureAuthStep(
            "ensure_profile",
            () => ({ wroteProfile: false, phone: "47999991111" }),
            (res) => ({ profileWritten: res.wroteProfile }),
          );
          setOutcome("redirect_next");
        });
      },
    );

    expect(reports).toHaveLength(1);
    const unsafeCandidate = {
      ...reports[0]!,
      email: "vazamento@example.com",
      steps: [
        ...reports[0]!.steps,
        {
          step: "etapa_desconhecida_com_email@example.com" as AuthStepTiming["step"],
          durationMs: 5,
        },
      ],
    } as AuthFlowTiming;

    const json = serializeSafeAuthFlowTiming(unsafeCandidate);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual({
      event: "marcou.auth_timing",
      flow: "password_login",
      outcome: "redirect_next",
      totalMs: expect.any(Number),
      steps: [
        { step: "validate_input", durationMs: expect.any(Number) },
        { step: "auth_sign_in", durationMs: expect.any(Number) },
        {
          step: "ensure_profile",
          durationMs: expect.any(Number),
          profileWritten: false,
        },
      ],
    });
    expect(json).not.toContain("vazamento");
    expect(json).not.toContain("nao-registrar");
    expect(json).not.toContain("jwt-secreto");
    expect(json).not.toContain("47999991111");
  });
});
