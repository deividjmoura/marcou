"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import {
  isValidPhone,
  loginRedirectUrl,
  normalizePhone,
  passwordLoginErrorMessage,
  safeNextPath,
  trustedAppOrigin,
  signupErrorMessage,
} from "@/lib/identity";
import {
  ensureAuthProfile,
  measureAuthFlow,
  measureAuthStep,
} from "@/server/identity";

export interface AuthState {
  error?: string;
  success?: string;
}

const loginSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
});

const signupSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome.").max(80),
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha precisa de ao menos 8 caracteres.").max(100),
});

const profileSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome.").max(80),
  phone: z.string().trim().refine(isValidPhone, "Informe um telefone válido com DDD."),
});

const passwordSchema = z.object({
  password: z.string().min(8, "A senha precisa de ao menos 8 caracteres.").max(100),
  confirmPassword: z.string().min(1, "Confirme a nova senha."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});

function getAppOrigin() {
  return trustedAppOrigin();
}

function emailConfirmationRedirect(origin: string, next: string): string {
  const redirectTo = new URL("/auth/confirm", origin);
  redirectTo.searchParams.set("next", safeNextPath(next));
  return redirectTo.toString();
}

function oauthCallbackRedirect(origin: string, next: string): string {
  const redirectTo = new URL("/auth/callback", origin);
  redirectTo.searchParams.set("next", safeNextPath(next));
  return redirectTo.toString();
}

const GENERIC_CONFIRMATION_MESSAGE =
  "Se for necessário confirmar esse endereço, enviaremos instruções por e-mail. Você também pode tentar entrar normalmente.";
const GENERIC_RECOVERY_MESSAGE =
  "Se o e-mail estiver cadastrado, enviaremos um link para redefinir sua senha. Verifique também a caixa de spam ou lixo eletrônico, pois a mensagem pode ser direcionada para lá.";

const SUPABASE_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

function unavailableState(): AuthState {
  return { error: SUPABASE_UNAVAILABLE_MESSAGE };
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  return measureAuthFlow("password_login", async (setOutcome) => {
    if (!isSupabaseConfigured()) {
      setOutcome("unconfigured");
      return unavailableState();
    }

    const parsed = await measureAuthStep("validate_input", () =>
      loginSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    );

    if (!parsed.success) {
      setOutcome("validation_failed");
      return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    }

    const supabase = await measureAuthStep("supabase_client", () =>
      createClient(),
    );
    const { data, error } = await measureAuthStep("auth_sign_in", () =>
      supabase.auth.signInWithPassword(parsed.data),
    );

    if (error || !data.user) {
      setOutcome("auth_failed");
      return { error: passwordLoginErrorMessage(error?.code) };
    }

    let needsPhone: boolean;
    try {
      const profile = await measureAuthStep(
        "ensure_profile",
        () => ensureAuthProfile(supabase, data.user),
        (result) => ({ profileWritten: result.wroteProfile }),
      );
      needsPhone = profile.needsPhone;
    } catch {
      setOutcome("profile_failed");
      return { error: "Não foi possível carregar seu perfil. Tente novamente." };
    }

    const next = safeNextPath(String(formData.get("next") ?? ""));
    if (needsPhone) {
      setOutcome("redirect_profile_onboarding");
      redirect(`/perfil?next=${encodeURIComponent(next)}`);
    }
    setOutcome("redirect_next");
    redirect(next);
  });
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const origin = getAppOrigin();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.name },
      emailRedirectTo: emailConfirmationRedirect(origin, next),
    },
  });

  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      return { success: GENERIC_CONFIRMATION_MESSAGE };
    }
    return { error: signupErrorMessage(error.code) };
  }

  if (!data.user) {
    return { success: GENERIC_CONFIRMATION_MESSAGE };
  }

  if (data.session) {
    try {
      await ensureAuthProfile(supabase, data.user);
    } catch {
      // Do not turn profile setup into an account-enumeration side channel.
    }
    try {
      // A signup without email confirmation may return a session. Clear it so
      // the public signup response stays indistinguishable; login continues the
      // normal profile/onboarding flow.
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Keep the generic signup response even if local sign-out needs retry.
    }
  }

  return { success: GENERIC_CONFIRMATION_MESSAGE };
}

export async function resendSignupConfirmationAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const email = z.string().trim().email("Informe um e-mail válido.").safeParse(formData.get("email"));
  if (!email.success) {
    return { error: email.error.issues[0]?.message ?? "Informe um e-mail válido." };
  }

  try {
    const origin = getAppOrigin();
    const next = safeNextPath(String(formData.get("next") ?? ""));
    const supabase = await createClient();
    // Supabase errors are intentionally not reflected in the response: the
    // message is identical whether the address is unknown, confirmed, or
    // temporarily rate-limited.
    await supabase.auth.resend({
      type: "signup",
      email: email.data,
      options: { emailRedirectTo: emailConfirmationRedirect(origin, next) },
    });
  } catch {
    // Keep the response non-enumerating even when the provider is unavailable.
  }

  return { success: GENERIC_CONFIRMATION_MESSAGE };
}

export async function googleLoginAction(formData: FormData): Promise<void> {
  const origin = getAppOrigin();
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!isSupabaseConfigured()) {
    redirect(loginRedirectUrl(origin, next, SUPABASE_UNAVAILABLE_MESSAGE));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: oauthCallbackRedirect(origin, next),
    },
  });

  if (error || !data.url) {
    redirect(
      loginRedirectUrl(
        origin,
        next,
        "Não foi possível iniciar o login com Google.",
      ),
    );
  }

  redirect(data.url);
}

export async function saveProfileAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Confira os dados informados." };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Sua sessão expirou. Entre novamente." };

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      display_name: parsed.data.name,
      phone: normalizePhone(parsed.data.phone),
    },
    { onConflict: "id" },
  );

  if (error) return { error: "Não foi possível salvar seu perfil. Tente novamente." };

  const next = safeNextPath(String(formData.get("next") ?? ""));
  redirect(next);
}

export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const email = z.string().trim().email("Informe um e-mail válido.").safeParse(formData.get("email"));
  if (!email.success) return { error: email.error.issues[0]?.message ?? "E-mail inválido." };

  try {
    const origin = getAppOrigin();
    const supabase = await createClient();
    const redirectTo = new URL("/auth/confirm", origin);
    redirectTo.searchParams.set("next", "/redefinir-senha");
    await supabase.auth.resetPasswordForEmail(email.data, {
      redirectTo: redirectTo.toString(),
    });
  } catch {
    // A recovery request must not reveal whether the account exists.
  }

  return { success: GENERIC_RECOVERY_MESSAGE };
}

export async function updatePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Informe uma senha válida." };
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "O link expirou ou não é válido. Solicite uma nova recuperação." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Não foi possível atualizar a senha. Solicite um novo link." };

  // End the recovery session so the user explicitly signs in with the new password.
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    return { error: "A senha foi atualizada, mas não foi possível encerrar a sessão. Saia da conta e entre novamente." };
  }
  redirect("/login?passwordUpdated=1");
}

export async function logoutAction(): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
