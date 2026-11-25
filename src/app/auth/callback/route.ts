import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { markPrivateNoStore } from "@/lib/http";
import {
  loginRedirectUrl,
  oauthErrorMessage,
  safeNextPath,
  trustedAppOrigin,
} from "@/lib/identity";
import {
  ensureAuthProfile,
  measureAuthFlow,
  measureAuthStep,
} from "@/server/identity";

const AUTH_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

function redirectNoStore(url: string) {
  return markPrivateNoStore(NextResponse.redirect(url));
}

export async function GET(request: NextRequest) {
  return measureAuthFlow("oauth_callback", async (setOutcome) => {
    const { searchParams } = request.nextUrl;
    const origin = trustedAppOrigin(request.nextUrl.origin);
    const code = searchParams.get("code");
    const next = safeNextPath(searchParams.get("next"));
    const flow = searchParams.get("flow");
    const providerError = searchParams.get("error");

    if (!isSupabaseConfigured()) {
      setOutcome("unconfigured");
      return redirectNoStore(
        loginRedirectUrl(origin, next, AUTH_UNAVAILABLE_MESSAGE),
      );
    }

    if (!code) {
      setOutcome("auth_failed");
      const message = providerError
        ? oauthErrorMessage(providerError)
        : "Não foi possível concluir a autenticação. Tente novamente.";
      return redirectNoStore(loginRedirectUrl(origin, next, message));
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

    let user: Awaited<
      ReturnType<typeof supabase.auth.getUser>
    >["data"]["user"] = null;
    try {
      const { data: exchangeData, error } = await measureAuthStep(
        "auth_exchange_code",
        () => supabase.auth.exchangeCodeForSession(code),
      );
      if (error) {
        setOutcome("auth_failed");
        return redirectNoStore(
          loginRedirectUrl(origin, next, oauthErrorMessage()),
        );
      }
      user = exchangeData?.user ?? null;
    } catch {
      setOutcome("auth_failed");
      return redirectNoStore(
        loginRedirectUrl(origin, next, oauthErrorMessage()),
      );
    }

    if (!user) {
      try {
        const result = await measureAuthStep("auth_get_user", () =>
          supabase.auth.getUser(),
        );
        if (result.error || !result.data.user) {
          setOutcome("auth_failed");
          return redirectNoStore(loginRedirectUrl(origin, next));
        }
        user = result.data.user;
      } catch {
        setOutcome("auth_failed");
        return redirectNoStore(loginRedirectUrl(origin, next));
      }
    }

    // Legacy PKCE recovery links may return a code here. Recovery never falls
    // through to profile onboarding or to a caller-controlled destination.
    if (flow === "recovery") {
      setOutcome("redirect_recovery");
      return redirectNoStore(new URL("/redefinir-senha", origin).toString());
    }

    try {
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
        loginRedirectUrl(origin, next, "Não foi possível carregar seu perfil."),
      );
    }
  });
}
