import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { loginRedirectUrl, safeNextPath } from "@/lib/identity";

const AUTH_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

function resolveNextPath(value: string | null, origin: string): string {
  if (!value) return "/painel";

  try {
    const target = new URL(value, origin);
    if (target.origin !== origin) return "/painel";
    return safeNextPath(`${target.pathname}${target.search}${target.hash}`);
  } catch {
    return "/painel";
  }
}

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

/**
 * Confirma e-mails de cadastro no fluxo PKCE do Supabase.
 *
 * O template "Confirm signup" deve apontar para:
 * /auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = resolveNextPath(searchParams.get("next"), origin);

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(
      loginRedirectUrl(origin, next, AUTH_UNAVAILABLE_MESSAGE),
    );
  }

  if (!tokenHash || type !== "email") {
    return NextResponse.redirect(
      loginRedirectUrl(
        origin,
        next,
        "O link de confirmação é inválido ou está incompleto. Solicite um novo e-mail.",
      ),
    );
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (verifyError) {
    return NextResponse.redirect(
      loginRedirectUrl(
        origin,
        next,
        "O link de confirmação expirou ou já foi utilizado. Solicite um novo e-mail.",
      ),
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(loginRedirectUrl(origin, next));
  }

  const { data: profile, error: profileError } = await provisionProfile(
    user,
    supabase,
  );

  if (profileError || !profile) {
    return NextResponse.redirect(
      loginRedirectUrl(origin, next, "E-mail confirmado, mas não foi possível carregar seu perfil."),
    );
  }

  const destination = profile.phone
    ? next
    : `/perfil?next=${encodeURIComponent(next)}`;

  return NextResponse.redirect(new URL(destination, origin));
}
