import { NextResponse } from "next/server";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { calendarAdminClient } from "@/server/calendar/admin";
import { encryptCalendarToken, hashCalendarState, isCalendarFeatureEnabled } from "@/server/calendar/crypto";
import { exchangeOAuthCode } from "@/server/calendar/google";
import { calendarRedirectUri } from "@/server/calendar/oauth";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url), origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  if (!isCalendarFeatureEnabled()) return NextResponse.redirect(new URL("/painel?calendar=disabled", origin));
  if (url.searchParams.has("error")) return NextResponse.redirect(new URL("/painel?calendar=denied", origin));
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  if (!state || !code) return NextResponse.redirect(new URL("/painel?calendar=invalid-callback", origin));
  try {
    const user = await requireUser("/painel"), admin = calendarAdminClient();
    const { data: connection, error } = await admin.from("provider_calendar_connections")
      .select("provider_id,oauth_state_expires_at").eq("oauth_state_hash", hashCalendarState(state)).maybeSingle();
    if (error || !connection?.oauth_state_expires_at || Date.parse(connection.oauth_state_expires_at) < Date.now()) {
      return NextResponse.redirect(new URL("/painel?calendar=expired-state", origin));
    }
    const provider = await getOwnedProvider(user.id);
    if (!provider || provider.id !== connection.provider_id) return NextResponse.redirect(new URL("/painel?calendar=forbidden", origin));
    const tokens = await exchangeOAuthCode(code, calendarRedirectUri());
    if (!tokens.refresh_token) return NextResponse.redirect(new URL("/painel?calendar=missing-refresh-token", origin));
    const { error: saveError } = await admin.from("provider_calendar_connections").update({
      refresh_token_ciphertext: encryptCalendarToken(tokens.refresh_token),
      access_token_ciphertext: encryptCalendarToken(tokens.access_token),
      access_token_expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toISOString(),
      granted_scope: tokens.scope ?? "https://www.googleapis.com/auth/calendar.events",
      oauth_state_hash: null, oauth_state_expires_at: null,
      connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("provider_id", provider.id);
    if (saveError) throw saveError;
    return NextResponse.redirect(new URL("/painel?calendar=connected", origin));
  } catch {
    return NextResponse.redirect(new URL("/painel?calendar=connection-error", origin));
  }
}
