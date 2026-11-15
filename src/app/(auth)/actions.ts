"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

function safeNext(value: string | null): string {
  if (!value) return "/painel";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/painel";
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
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  redirect(safeNext(String(formData.get("next") ?? "")));
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

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.name },
      emailRedirectTo: `${origin}/auth/callback?next=/painel`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.user) {
    return { error: "Não foi possível criar a conta." };
  }

  // Sem confirmação de e-mail ativa, a sessão já existe.
  if (data.session) {
    redirect(safeNext(String(formData.get("next") ?? "")));
  }

  return {
    success:
      "Conta criada. Confirme o e-mail enviado para concluir o cadastro.",
  };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function googleLoginAction(formData: FormData): Promise<void> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
        safeNext(String(formData.get("next") ?? "")),
      )}`,
    },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent("Não foi possível iniciar o login com Google.")}`);
  }

  redirect(data.url);
}
