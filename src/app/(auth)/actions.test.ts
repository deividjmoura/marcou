import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  withAuthFlowCollector,
  withAuthTimingCollector,
  type AuthFlowTiming,
  type AuthStepTiming,
} from "@/server/identity";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  profileSelectMaybeSingle: vi.fn(),
  profileSelectSingle: vi.fn(),
  profileUpsertMaybeSingle: vi.fn(),
  profileUpsertDirect: vi.fn(),
  profileUpdateMaybeSingle: vi.fn(),
  from: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import {
  googleLoginAction,
  loginAction,
  logoutAction,
  requestPasswordResetAction,
  resendSignupConfirmationAction,
  saveProfileAction,
  signupAction,
  updatePasswordAction,
} from "./actions";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("email and OAuth identity actions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    });
    mocks.profileSelectMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.profileSelectSingle.mockResolvedValue({
      data: { display_name: "Ana", phone: "47999991234" },
      error: null,
    });
    mocks.profileUpsertMaybeSingle.mockResolvedValue({
      data: { display_name: "Ana", phone: null },
      error: null,
    });
    mocks.profileUpsertDirect.mockResolvedValue({ error: null });
    mocks.profileUpdateMaybeSingle.mockResolvedValue({
      data: { display_name: "Ana", phone: "47999991234" },
      error: null,
    });

    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.profileSelectMaybeSingle,
          single: mocks.profileSelectSingle,
        }),
      }),
      upsert: (payload: unknown, options?: { ignoreDuplicates?: boolean }) => {
        if (options && "ignoreDuplicates" in options) {
          return {
            select: () => ({ maybeSingle: mocks.profileUpsertMaybeSingle }),
          };
        }
        return mocks.profileUpsertDirect(payload, options);
      },
      update: () => ({
        eq: () => ({
          is: () => ({
            select: () => ({ maybeSingle: mocks.profileUpdateMaybeSingle }),
          }),
          eq: () => ({
            select: () => ({ maybeSingle: mocks.profileUpdateMaybeSingle }),
          }),
        }),
      }),
    }));

    mocks.createClient.mockResolvedValue({
      auth: {
        signUp: mocks.signUp,
        resend: mocks.resend,
        resetPasswordForEmail: mocks.resetPasswordForEmail,
        signInWithPassword: mocks.signInWithPassword,
        signInWithOAuth: mocks.signInWithOAuth,
        getUser: mocks.getUser,
        updateUser: mocks.updateUser,
        signOut: mocks.signOut,
      },
      from: mocks.from,
    });
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "user-1" }, session: null },
      error: null,
    });
    mocks.resend.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("authenticates returning user with 1 single profile SELECT and 0 redundant writes", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          user_metadata: { display_name: "Ana" },
        },
      },
      error: null,
    });
    mocks.profileSelectMaybeSingle.mockResolvedValueOnce({
      data: { display_name: "Ana", phone: "47999991234" },
      error: null,
    });

    await expect(
      loginAction(
        {},
        form({
          email: "ana@example.com",
          password: "senha-segura-123",
          next: "/minha-conta",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/minha-conta");

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "senha-segura-123",
    });
    expect(mocks.profileSelectMaybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.profileUpsertMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.profileUpdateMaybeSingle).not.toHaveBeenCalled();
  });

  it("provisions missing profile on first login and redirects to /perfil when phone is missing", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "user-new",
          user_metadata: { display_name: "Ana" },
        },
      },
      error: null,
    });
    mocks.profileSelectMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    mocks.profileUpsertMaybeSingle.mockResolvedValueOnce({
      data: { display_name: "Ana", phone: null },
      error: null,
    });

    await expect(
      loginAction(
        {},
        form({
          email: "ana@example.com",
          password: "senha-segura-123",
          next: "/painel",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/perfil?next=%2Fpainel");

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.profileSelectMaybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.profileUpsertMaybeSingle).toHaveBeenCalledTimes(1);
  });

  it("does not redirect a successful login to an external destination", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.profileSelectMaybeSingle.mockResolvedValueOnce({
      data: { display_name: "Ana", phone: "47999991234" },
      error: null,
    });

    await expect(
      loginAction(
        {},
        form({
          email: "ana@example.com",
          password: "senha-segura-123",
          next: "https://evil.example/steal",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/inicio");
  });

  it("measures login stages under simulated latency without logging passwords, tokens, or PII", async () => {
    const SIMULATED_RTT_MS = 18;
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    mocks.signInWithPassword.mockImplementation(async () => {
      await sleep(SIMULATED_RTT_MS);
      return {
        data: {
          user: {
            id: "user-measured",
            user_metadata: { display_name: "Pessoa Teste" },
          },
          session: { access_token: "secret-jwt-token" },
        },
        error: null,
      };
    });

    // Cenário 1: usuário recorrente (1 Auth RTT + 1 DB SELECT RTT, 0 escritas)
    mocks.profileSelectMaybeSingle.mockImplementationOnce(async () => {
      await sleep(SIMULATED_RTT_MS);
      return {
        data: { display_name: "Pessoa Teste", phone: "47999990000" },
        error: null,
      };
    });

    const returningFlows: AuthFlowTiming[] = [];
    const returningTimings: AuthStepTiming[] = [];
    await expect(
      withAuthFlowCollector(
        (report) => returningFlows.push(report),
        () =>
          withAuthTimingCollector(
            (entry) => returningTimings.push(entry),
            () =>
              loginAction(
                {},
                form({
                  email: "privado@example.com",
                  password: "senha-ultra-secreta-999",
                  next: "/inicio",
                }),
              ),
          ),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/inicio");

    // Cenário 2: primeiro acesso (1 Auth RTT + 1 DB SELECT RTT + 1 DB INSERT RTT)
    mocks.profileSelectMaybeSingle.mockImplementationOnce(async () => {
      await sleep(SIMULATED_RTT_MS);
      return { data: null, error: null };
    });
    mocks.profileUpsertMaybeSingle.mockImplementationOnce(async () => {
      await sleep(SIMULATED_RTT_MS);
      return { data: { display_name: "Pessoa Teste", phone: null }, error: null };
    });

    vi.stubEnv("AUTH_TIMING_LOG", "1");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const firstLoginFlows: AuthFlowTiming[] = [];
    const firstLoginTimings: AuthStepTiming[] = [];
    await expect(
      withAuthFlowCollector(
        (report) => firstLoginFlows.push(report),
        () =>
          withAuthTimingCollector(
            (entry) => firstLoginTimings.push(entry),
            () =>
              loginAction(
                {},
                form({
                  email: "privado@example.com",
                  password: "senha-ultra-secreta-999",
                  next: "/inicio",
                }),
              ),
          ),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/perfil?next=%2Finicio");
    const loggedPayload = String(infoSpy.mock.calls[0]?.[0] ?? "");
    infoSpy.mockRestore();

    expect(returningTimings.map((t) => t.step)).toEqual([
      "validate_input",
      "supabase_client",
      "auth_sign_in",
      "ensure_profile",
    ]);
    expect(returningTimings[3]?.profileWritten).toBe(false);
    expect(firstLoginTimings[3]?.profileWritten).toBe(true);

    expect(returningFlows[0]?.flow).toBe("password_login");
    expect(returningFlows[0]?.outcome).toBe("redirect_next");
    expect(returningFlows[0]?.totalMs).toBeGreaterThanOrEqual(25);
    expect(firstLoginFlows[0]?.flow).toBe("password_login");
    expect(firstLoginFlows[0]?.outcome).toBe("redirect_profile_onboarding");
    expect(firstLoginFlows[0]?.totalMs).toBeGreaterThan(
      returningFlows[0]?.totalMs ?? 0,
    );

    const returningProfileMs = returningTimings[3]?.durationMs ?? 0;
    const firstLoginProfileMs = firstLoginTimings[3]?.durationMs ?? 0;
    expect(returningProfileMs).toBeGreaterThanOrEqual(12);
    expect(firstLoginProfileMs).toBeGreaterThan(returningProfileMs);

    expect(JSON.parse(loggedPayload)).toMatchObject({
      event: "marcou.auth_timing",
      flow: "password_login",
      outcome: "redirect_profile_onboarding",
    });

    const serialized = JSON.stringify({
      returningTimings,
      firstLoginTimings,
      returningFlows,
      firstLoginFlows,
      loggedPayload,
    });
    expect(serialized).not.toContain("privado@example.com");
    expect(serialized).not.toContain("senha-ultra-secreta-999");
    expect(serialized).not.toContain("secret-jwt-token");
    expect(serialized).not.toContain("user-measured");
    expect(serialized).not.toContain("47999990000");
    expect(serialized).not.toContain("/inicio");
    expect(serialized).not.toContain("/perfil");
  });

  it("builds Google OAuth redirectTo using configured production origin and safe next path", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcoou.netlify.app");
    mocks.signInWithOAuth.mockResolvedValue({
      data: {
        url: "https://peornypgltuueubmsucm.supabase.co/auth/v1/authorize?provider=google",
      },
      error: null,
    });

    await expect(
      googleLoginAction(form({ next: "/p/studio-ana?service=corte" })),
    ).rejects.toThrow(
      "NEXT_REDIRECT:https://peornypgltuueubmsucm.supabase.co/auth/v1/authorize?provider=google",
    );

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo:
          "https://marcoou.netlify.app/auth/callback?next=%2Fp%2Fstudio-ana%3Fservice%3Dcorte",
      },
    });
  });

  it("sanitizes untrusted next parameter in Google OAuth and handles provider startup errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcoou.netlify.app");
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("oauth_disabled"),
    });

    await expect(
      googleLoginAction(form({ next: "https://evil.example/phish" })),
    ).rejects.toThrow(
      "NEXT_REDIRECT:https://marcoou.netlify.app/login?error=N%C3%A3o+foi+poss%C3%ADvel+iniciar+o+login+com+Google.&next=%2Finicio",
    );

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://marcoou.netlify.app/auth/callback?next=%2Finicio",
      },
    });
  });

  it("saves profile with normalized phone and redirects to safe destination", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    await expect(
      saveProfileAction(
        {},
        form({
          name: "Ana Paula",
          phone: "(47) 99999-1234",
          next: "/minha-conta",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/minha-conta");

    expect(mocks.profileUpsertDirect).toHaveBeenCalledWith(
      {
        id: "user-1",
        display_name: "Ana Paula",
        phone: "47999991234",
      },
      { onConflict: "id" },
    );
  });

  it("updates a recovered password and ends the recovery session", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });

    await expect(
      updatePasswordAction(
        {},
        form({
          password: "nova-senha-segura-123",
          confirmPassword: "nova-senha-segura-123",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/login?passwordUpdated=1");
    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "nova-senha-segura-123",
    });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("signs out when logout is requested", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("sends signup confirmations to the token-hash route with a safe local next", async () => {
    const result = await signupAction(
      {},
      form({
        name: "Ana",
        email: "ana@example.com",
        password: "senha-segura-123",
        next: "/meus-agendamentos?tab=upcoming",
      }),
    );

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "senha-segura-123",
      options: {
        data: { display_name: "Ana" },
        emailRedirectTo:
          "http://localhost:3000/auth/confirm?next=%2Fmeus-agendamentos%3Ftab%3Dupcoming",
      },
    });
    expect(result.success).toContain("instruções por e-mail");
  });

  it("does not disclose an existing email when signup reports email_exists", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "email_exists" },
    });

    const result = await signupAction(
      {},
      form({
        name: "Ana",
        email: "ana@example.com",
        password: "senha-segura-123",
      }),
    );

    expect(result).toEqual({
      success:
        "Se for necessário confirmar esse endereço, enviaremos instruções por e-mail. Você também pode tentar entrar normalmente.",
    });
  });

  it("clears an immediate signup session while keeping the same generic response", async () => {
    mocks.signUp.mockResolvedValue({
      data: {
        user: { id: "user-new", user_metadata: { display_name: "Ana" } },
        session: { access_token: "test-session" },
      },
      error: null,
    });
    mocks.profileSelectMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.signOut.mockResolvedValue({ error: null });

    const result = await signupAction(
      {},
      form({
        name: "Ana",
        email: "ana@example.com",
        password: "senha-segura-123",
      }),
    );

    expect(result).toEqual({
      success:
        "Se for necessário confirmar esse endereço, enviaremos instruções por e-mail. Você também pode tentar entrar normalmente.",
    });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("uses the same resend response whether Supabase accepts or rejects the request", async () => {
    const request = form({ email: "ana@example.com", next: "/minha-conta" });
    mocks.resend.mockResolvedValueOnce({ error: null });
    const accepted = await resendSignupConfirmationAction({}, request);

    mocks.resend.mockResolvedValueOnce({
      error: { message: "User already confirmed or not found" },
    });
    const rejected = await resendSignupConfirmationAction({}, request);

    expect(accepted).toEqual(rejected);
    expect(accepted.success).toContain("instruções por e-mail");
    expect(JSON.stringify(accepted)).not.toContain("ana@example.com");
    expect(mocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "ana@example.com",
      options: {
        emailRedirectTo:
          "http://localhost:3000/auth/confirm?next=%2Fminha-conta",
      },
    });
  });

  it("always returns the same recovery message and fixes the destination", async () => {
    const request = form({ email: "ana@example.com" });
    mocks.resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const accepted = await requestPasswordResetAction({}, request);

    mocks.resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: "User not found" },
    });
    const rejected = await requestPasswordResetAction({}, request);

    expect(accepted).toEqual(rejected);
    expect(accepted.success).toContain("Se o e-mail estiver cadastrado");
    expect(JSON.stringify(accepted)).not.toContain("ana@example.com");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "ana@example.com",
      {
        redirectTo:
          "http://localhost:3000/auth/confirm?next=%2Fredefinir-senha",
      },
    );
  });

  it("builds password recovery redirects from the validated Netlify preview context", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_CONTEXT", "deploy-preview");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_PRIME_URL", "https://deploy-preview-42--marcoou.netlify.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcoou.netlify.app");

    await requestPasswordResetAction({}, form({ email: "ana@example.com" }));

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("ana@example.com", {
      redirectTo:
        "https://deploy-preview-42--marcoou.netlify.app/auth/confirm?next=%2Fredefinir-senha",
    });
  });
});