import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { markPrivateNoStore } from "@/lib/http";
import {
  loginRedirectUrl,
  safeNextPathFromUrl,
  trustedAppOrigin,
} from "@/lib/identity";
import {
  ensureAuthProfile,
  measureAuthFlow,
  measureAuthStep,
} from "@/server/identity";

const AUTH_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";
const RECOVERY_PATH = "/redefinir-senha";

function redirectNoStore(url: string) {
  return markPrivateNoStore(NextResponse.redirect(url));
}

/**
 * Confirma e-mails de cadastro e recuperação pelo token_hash do Supabase.
 *
 * Os templates devem enviar o usuário para `/auth/confirm` com `token_hash` e
 * `type`; nenhum token é copiado para outra URL ou exibido na interface.
 */
export async function GET(request: NextRequest) {
  return measureAuthFlow("email_confirm", async (setOutcome) => {
    const { searchParams } = request.nextUrl;
    const origin = trustedAppOrigin(request.nextUrl.origin);
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const next = safeNextPathFromUrl(searchParams.get("next"), origin);

    if (!isSupabaseConfigured()) {
      setOutcome("unconfigured");
      return redirectNoStore(
        loginRedirectUrl(origin, next, AUTH_UNAVAILABLE_MESSAGE),
      );
    }

    if (!tokenHash || (type !== "email" && type !== "recovery")) {
      setOutcome("validation_failed");
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
      supabase = await measureAuthStep("supabase_client", () => createClient());
    } catch {
      setOutcome("auth_failed");
      return redirectNoStore(
        loginRedirectUrl(
          origin,
          next,
          "Não foi possível concluir a autenticação. Tente novamente.",
        ),
      );
    }

    let verifiedUser: Awaited<
      ReturnType<typeof supabase.auth.getUser>
    >["data"]["user"] = null;
    try {
      const { data: verifyData, error: verifyError } = await measureAuthStep(
        "auth_verify_otp",
        () =>
          supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          }),
      );

      if (verifyError) {
        setOutcome("auth_failed");
        return redirectNoStore(
          loginRedirectUrl(
            origin,
            next,
            "O link de confirmação expirou ou já foi utilizado. Solicite um novo e-mail.",
          ),
        );
      }
      verifiedUser = verifyData?.user ?? null;
    } catch {
      setOutcome("auth_failed");
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
      setOutcome("redirect_recovery");
      return redirectNoStore(new URL(RECOVERY_PATH, origin).toString());
    }

    try {
      let user = verifiedUser;
      if (!user) {
        const {
          data: { user: fetchedUser },
          error: userError,
        } = await measureAuthStep("auth_get_user", () =>
          supabase.auth.getUser(),
        );

        if (userError || !fetchedUser) {
          setOutcome("auth_failed");
          return redirectNoStore(loginRedirectUrl(origin, next));
        }
        user = fetchedUser;
      }

      const profile = await measureAuthStep(
        "ensure_profile",
        () => ensureAuthProfile(supabase, user),
        (result) => ({ profileWritten: result.wroteProfile }),
      );
      setOutcome(
        profile.needsPhone ? "redirect_profile_onboarding" : "redirect_next",
      );
      const destination = profile.needsPhone
        ? `/perfil?next=${encodeURIComponent(next)}`
        : next;
      return redirectNoStore(new URL(destination, origin).toString());
    } catch {
      setOutcome("profile_failed");
      return redirectNoStore(
        loginRedirectUrl(
          origin,
          next,
          "E-mail confirmado, mas não foi possível carregar seu perfil.",
        ),
      );
    }
  });
}
