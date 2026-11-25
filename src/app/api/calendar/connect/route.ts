import { NextResponse } from "next/server";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { calendarAdminClient } from "@/server/calendar/admin";
import { calendarOAuthState, googleAuthorizationUrl } from "@/server/calendar/oauth";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
export const runtime = "nodejs";
export async function GET() {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (!isCalendarFeatureEnabled()) return NextResponse.redirect(new URL("/painel?calendar=disabled", origin));
  const user = await requireUser("/painel");
  const provider = await getOwnedProvider(user.id);
  if (!provider) return NextResponse.redirect(new URL("/painel?calendar=provider-required", origin));
  try {
    const { state, hash } = calendarOAuthState();
    const admin = calendarAdminClient();
    const { error } = await admin.from("provider_calendar_connections").upsert({
      provider_id: provider.id, oauth_state_hash: hash,
      oauth_state_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return NextResponse.redirect(googleAuthorizationUrl(state));
  } catch {
    return NextResponse.redirect(new URL("/painel?calendar=configuration-error", origin));
  }
}
