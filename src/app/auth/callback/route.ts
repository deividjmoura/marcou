import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isSafeAuthCode } from "@/lib/auth-url";
import {
  loginRedirectUrl,
  oauthErrorMessage,
  safeNextPath,
} from "@/lib/identity";

const AUTH_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

/**
 * Monta o perfil de um usuário recém-autenticado sem sobrescrever um nome
 * escolhido pelo próprio usuário em `/perfil`.
 */
async function provisionProfile(
  user: { id: string; user_metadata?: Record<string, unknown> },
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const displayName =
    user.user_metadata?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    null;

  const { data: existing } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const profileRow: { id: string; display_name?: string } = { id: user.id };
  if (
    !existing?.display_name &&
    typeof displayName === "string" &&
    displayName.trim()
  ) {
    profileRow.display_name = displayName.trim().slice(0, 80);
  }

  return supabase
    .from("profiles")
    .upsert(profileRow, { onConflict: "id" })
    .select("phone")
    .single();
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const flow = searchParams.get("flow");
  const flowId = searchParams.get("sb_flow_id");
  const providerError = searchParams.get("error");

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(
      loginRedirectUrl(origin, next, AUTH_UNAVAILABLE_MESSAGE),
    );
  }

  if (!code) {
    const message = providerError
      ? oauthErrorMessage(providerError)
      : "Não foi possível concluir a autenticação. Tente novamente.";
    return NextResponse.redirect(loginRedirectUrl(origin, next, message));
  }

  const supabase = await createClient();
  const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(
    code,
    isSafeAuthCode(flowId) ? { flowId } : undefined,
  );
  if (error) {
    const message =
      error.name === "AuthPKCECodeVerifierMissingError"
        ? "Abra o link no mesmo navegador em que iniciou o processo."
        : oauthErrorMessage();
    return NextResponse.redirect(loginRedirectUrl(origin, next, message));
  }
  // O auth-js entrega `redirectType` em tempo de execução, mas o tipo público
  // ainda não o inclui. Ele distingue recuperação (`recovery`) de login.
  const redirectType =
    (exchangeData as { redirectType?: string | null } | null)?.redirectType ??
    null;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.redirect(loginRedirectUrl(origin, next));
  }

  // Password recovery already has an authenticated PKCE session. Do not send
  // the user through profile onboarding: the password page is the destination.
  // O redirectType vem do verificador PKCE armazenado quando a recuperação foi
  // solicitada, então funciona mesmo se o Supabase caiu na landing page e o
  // proxy apenas encaminhou o code.
  if (
    redirectType === "recovery" ||
    (flow === "recovery" && next === "/redefinir-senha")
  ) {
    return NextResponse.redirect(new URL("/redefinir-senha", origin));
  }

  const { data: profile, error: profileError } = await provisionProfile(
    user,
    supabase,
  );

  if (profileError) {
    return NextResponse.redirect(
      loginRedirectUrl(origin, next, "Não foi possível carregar seu perfil."),
    );
  }

  const destination = profile.phone
    ? next
    : `/perfil?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(destination, origin));
}
