import { NextResponse } from "next/server";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
import { calendarNoticeRedirect, calendarSiteOrigin, isTrustedCalendarOrigin } from "@/server/calendar/http";
import { googleAuthorizationUrl } from "@/server/calendar/oauth";
import { startCalendarOAuth } from "@/server/calendar/oauth-flow";
import { calendarRuntime, isCalendarServerConfigured } from "@/server/calendar/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Só POST com origem verificada: um link/imagem de terceiros não inicia o fluxo.
export async function POST(request: Request) {
  const origin = calendarSiteOrigin();
  if (!origin || !isTrustedCalendarOrigin(request)) {
    return NextResponse.json({ error: "origin_forbidden" }, { status: 403 });
  }
  if (!isCalendarFeatureEnabled()) return calendarNoticeRedirect("disabled", origin);
  if (!isCalendarServerConfigured()) return calendarNoticeRedirect("configuration-error", origin);

  const user = await requireUser("/painel/integracoes/calendario");
  const provider = await getOwnedProvider(user.id);
  if (!provider) return calendarNoticeRedirect("provider-required", origin);

  try {
    const result = await startCalendarOAuth(calendarRuntime(), { providerId: provider.id, userId: user.id });
    if (result.kind === "notice") return calendarNoticeRedirect(result.notice, origin);
    return NextResponse.redirect(googleAuthorizationUrl(result.state), 303);
  } catch {
    return calendarNoticeRedirect("configuration-error", origin);
  }
}
