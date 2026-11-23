import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { markPrivateNoStore } from "@/lib/http";
import {
  loginRedirectUrl,
  safeNextPathFromUrl,
  trustedAppOrigin,
} from "@/lib/identity";

const AUTH_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";
const RECOVERY_PATH = "/redefinir-senha";

function redirectNoStore(url: string) {
  return markPrivateNoStore(NextResponse.redirect(url));
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
 * Confirma e-mails de cadastro e recuperação pelo token_hash do Supabase.
 *
 * Os templates devem enviar o usuário para `/auth/confirm` com `token_hash` e
 * `type`; nenhum token é copiado para outra URL ou exibido na interface.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = trustedAppOrigin(request.nextUrl.origin);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNextPathFromUrl(searchParams.get("next"), origin);

  if (!isSupabaseConfigured()) {
    return redirectNoStore(
      loginRedirectUrl(origin, next, AUTH_UNAVAILABLE_MESSAGE),
    );
  }

  if (!tokenHash || (type !== "email" && type !== "recovery")) {
    return redirectNoStore(
      loginRedirectUrl(
        origin,
        next,
        "O link de confirmação é inválido ou está incompleto. Solicite um novo e-mail.",
      ),
    );
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return redirectNoStore(
      loginRedirectUrl(origin, next, "Não foi possível concluir a autenticação. Tente novamente."),
    );
  }

  try {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (verifyError) {
      return redirectNoStore(
        loginRedirectUrl(
          origin,
          next,
          "O link de confirmação expirou ou já foi utilizado. Solicite um novo e-mail.",
        ),
      );
    }
  } catch {
    return redirectNoStore(
      loginRedirectUrl(
        origin,
        next,
        "O link de confirmação expirou ou já foi utilizado. Solicite um novo e-mail.",
      ),
    );
  }

  // Recovery links always land on the one password-reset route, regardless of
  // the `next` query parameter or which browser opened the e-mail.
  if (type === "recovery") {
    return redirectNoStore(new URL(RECOVERY_PATH, origin).toString());
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return redirectNoStore(loginRedirectUrl(origin, next));
    }

    const { data: profile, error: profileError } = await provisionProfile(
      user,
      supabase,
    );

    if (profileError || !profile) {
      return redirectNoStore(
        loginRedirectUrl(
          origin,
          next,
          "E-mail confirmado, mas não foi possível carregar seu perfil.",
        ),
      );
    }

    const destination = profile.phone
      ? next
      : `/perfil?next=${encodeURIComponent(next)}`;
    return redirectNoStore(new URL(destination, origin).toString());
  } catch {
    return redirectNoStore(
      loginRedirectUrl(
        origin,
        next,
        "E-mail confirmado, mas não foi possível carregar seu perfil.",
      ),
    );
  }
}
