import { NextResponse } from "next/server";

export const CALENDAR_PAGE_PATH = "/painel/integracoes/calendario";

/** Origem canônica do site; `null` quando não configurada (falha fechada). */
export function calendarSiteOrigin(siteUrl = process.env.NEXT_PUBLIC_SITE_URL): string | null {
  if (!siteUrl) return null;
  try {
    return new URL(siteUrl).origin;
  } catch {
    return null;
  }
}

/**
 * Mutações (connect/disconnect) só aceitam POST vindo da própria origem do
 * site. Sem `Origin` ou com origem diferente, recusa.
 */
export function isTrustedCalendarOrigin(
  request: Request,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
): boolean {
  const expected = calendarSiteOrigin(siteUrl);
  const supplied = request.headers.get("origin");
  return Boolean(expected && supplied && supplied === expected);
}

/**
 * Redirect para a página da integração com aviso. 303 garante que o navegador
 * siga com GET depois de um POST (307 reenviaria o formulário).
 */
export function calendarNoticeRedirect(notice: string, origin: string, status: 302 | 303 = 303) {
  const url = new URL(CALENDAR_PAGE_PATH, origin);
  url.searchParams.set("calendar", notice);
  return NextResponse.redirect(url, status);
}
