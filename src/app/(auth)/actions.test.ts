import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  profileMaybeSingle: vi.fn(),
  profileUpsert: vi.fn(),
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
  loginAction,
  logoutAction,
  requestPasswordResetAction,
  resendSignupConfirmationAction,
  signupAction,
  updatePasswordAction,
} from "./actions";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("email identity actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    });
    mocks.profileMaybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.profileUpsert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.profileMaybeSingle }),
      }),
      upsert: mocks.profileUpsert,
    }));
    mocks.createClient.mockResolvedValue({
      auth: {
        signUp: mocks.signUp,
        resend: mocks.resend,
        resetPasswordForEmail: mocks.resetPasswordForEmail,
        signInWithPassword: mocks.signInWithPassword,
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

  it("authenticates with e-mail/password, provisions the profile, and returns locally", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          user_metadata: { display_name: "Ana" },
        },
      },
      error: null,
    });
    mocks.profileMaybeSingle
      .mockResolvedValueOnce({ data: { display_name: "Ana" }, error: null })
      .mockResolvedValueOnce({ data: { phone: "47999991234" }, error: null });

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
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "senha-segura-123",
    });
  });

  it("does not redirect a successful login to an external destination", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.profileMaybeSingle
      .mockResolvedValueOnce({ data: { display_name: "Ana" }, error: null })
      .mockResolvedValueOnce({ data: { phone: "47999991234" }, error: null });

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
    mocks.profileMaybeSingle.mockResolvedValue({ data: null, error: null });
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
});
