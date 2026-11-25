import { getOwnedProvider, requireUser } from "@/server/bookings";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
import { calendarNoticeRedirect, calendarSiteOrigin } from "@/server/calendar/http";
import { calendarRedirectUri } from "@/server/calendar/oauth";
import { completeCalendarOAuth } from "@/server/calendar/oauth-flow";
import { calendarRuntime, isCalendarServerConfigured } from "@/server/calendar/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = calendarSiteOrigin() ?? url.origin;
  if (!isCalendarFeatureEnabled()) return calendarNoticeRedirect("disabled", origin, 302);
  if (!isCalendarServerConfigured()) return calendarNoticeRedirect("configuration-error", origin, 302);
  if (url.searchParams.has("error")) return calendarNoticeRedirect("denied", origin, 302);

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return calendarNoticeRedirect("invalid-callback", origin, 302);

  const user = await requireUser("/painel/integracoes/calendario");
  try {
    const provider = await getOwnedProvider(user.id);
    const notice = await completeCalendarOAuth(calendarRuntime(), {
      state,
      code,
      userId: user.id,
      ownedProviderId: provider?.id ?? null,
      redirectUri: calendarRedirectUri(),
    });
    return calendarNoticeRedirect(notice, origin, 302);
  } catch {
    return calendarNoticeRedirect("connection-error", origin, 302);
  }
}
