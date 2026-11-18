import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { authFallbackRedirect } from "@/lib/auth-url";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // Se o Supabase substituiu o redirectTo pelo Site URL, o code chega em um
  // caminho comum (por exemplo a landing page). Encaminhamos ao callback em
  // vez de perder o link. Só o code é reaproveitado; nenhum `next` da URL.
  if (isSupabaseConfigured()) {
    const fallback = authFallbackRedirect(
      request.nextUrl.pathname,
      request.nextUrl.searchParams,
    );
    if (fallback) {
      const response = NextResponse.redirect(new URL(fallback, request.url));
      response.headers.set("cache-control", "no-store");
      return response;
    }
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
