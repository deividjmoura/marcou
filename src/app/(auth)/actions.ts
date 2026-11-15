"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidPhone, normalizePhone, safeNextPath } from "@/lib/identity";

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
});

async function getAppOrigin() {
  const headerStore = await headers();
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.hostname === "localhost") return url.origin;
    } catch {
      // Usa a origem encaminhada pela requisição quando a configuração é inválida.
    }
  }

  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host || /[\s/@\\]/.test(host)) return "http://localhost:3000";
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const proto = forwardedProto === "http" && host.startsWith("localhost")
    ? "http"
    : "https";
  return `${proto}://${host}`;
}

async function saveAuthProfile(
  user: { id: string; user_metadata?: Record<string, unknown> },
) {
  const supabase = await createClient();
  const displayName =
    user.user_metadata?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    null;

  const profileRow: { id: string; display_name?: string } = { id: user.id };
  if (typeof displayName === "string" && displayName.trim()) {
    profileRow.display_name = displayName.trim().slice(0, 80);
  }
  const { error } = await supabase.from("profiles").upsert(profileRow, {
    onConflict: "id",
    ignoreDuplicates: false,
  });
  if (error) throw new Error("Não foi possível preparar seu perfil.");
}

async function profileNeedsPhone(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível verificar seu perfil.");
  return !data?.phone;
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return { error: "E-mail ou senha incorretos." };
  }

  try {
    await saveAuthProfile(data.user);
  } catch {
    return { error: "Não foi possível carregar seu perfil. Tente novamente." };
  }

  const next = safeNextPath(String(formData.get("next") ?? ""));
  let needsPhone: boolean;
  try {
    needsPhone = await profileNeedsPhone(data.user.id);
  } catch {
    return { error: "Não foi possível verificar seu perfil. Tente novamente." };
  }
  if (needsPhone) redirect(`/perfil?next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const origin = await getAppOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.name },
      emailRedirectTo: `${origin}/auth/callback?next=/perfil`,
    },
  });

  if (error) {
    return { error: "Não foi possível criar a conta com esses dados." };
  }

  if (!data.user) {
    return { error: "Não foi possível criar a conta." };
  }

  if (data.session) {
    try {
      await saveAuthProfile(data.user);
    } catch {
      return { error: "A conta foi criada, mas não foi possível preparar o perfil. Entre novamente." };
    }
    const next = safeNextPath(String(formData.get("next") ?? ""));
    redirect(`/perfil?next=${encodeURIComponent(next)}`);
  }

  return {
    success: "Conta criada. Confirme o e-mail enviado; depois complete seu perfil para continuar.",
  };
}

export async function googleLoginAction(formData: FormData): Promise<void> {
  const origin = await getAppOrigin();
  const supabase = await createClient();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent("Não foi possível iniciar o login com Google.")}`);
  }

  redirect(data.url);
}

export async function saveProfileAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
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
  const email = z.string().trim().email("Informe um e-mail válido.").safeParse(formData.get("email"));
  if (!email.success) return { error: email.error.issues[0]?.message ?? "E-mail inválido." };

  const origin = await getAppOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/auth/callback?next=/redefinir-senha`,
  });

  if (error) return { error: "Não foi possível solicitar a recuperação. Tente novamente." };
  return { success: "Se o e-mail estiver cadastrado, enviaremos um link para redefinir sua senha." };
}

export async function updatePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = passwordSchema.safeParse({ password: formData.get("password") });
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
  redirect("/painel");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
