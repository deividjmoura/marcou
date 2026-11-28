import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { markPrivateNoStore } from "@/lib/http";
import { authFallbackRedirect } from "@/lib/auth-url";
import { trustedAppOrigin } from "@/lib/identity";
import {
  applyCacheHeaders,
  hasSupabaseAuthCookie,
} from "@/lib/cache-policy";

/**
 * Redirecionamento de segurança para códigos de autenticação órfãos e política
 * de cache por tipo de rota.
 *
 * Quando o Supabase substitui silenciosamente o `redirectTo` do link de
 * recuperação pelo Site URL, o `code` (ou `token_hash`) chega na landing
 * page em vez do callback. Como o proxy responde em toda a aplicação,
 * ele reencaminha um `code` para `/auth/callback` e um `token_hash` com
 * `type` válido para `/auth/confirm` — sem expor o token e sem criar loops
 * quando a requisição já está no handler correto. Nenhum `next` da URL
 * original é reaproveitado; o handler destino valida o destino final.
 *
 * O destino é resolvido a partir de uma origem confiável; nunca refletimos
 * Host / forwarded-host controlado pelo cliente para redirecionar credenciais.
 */
export async function proxy(request: NextRequest) {
  const fallback = authFallbackRedirect(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
  );
  if (fallback) {
    const origin = trustedAppOrigin(request.nextUrl.origin);
    return markPrivateNoStore(
      NextResponse.redirect(new URL(fallback, origin)),
    );
  }
  const response = await updateSession(request);
  return applyCacheHeaders(response, request.nextUrl.pathname, {
    hasSetCookie: response.headers.has("set-cookie"),
    hasAuthCookie: hasSupabaseAuthCookie(request.cookies.getAll()),
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
