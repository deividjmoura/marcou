import { NextResponse } from "next/server";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { calendarAdminClient } from "@/server/calendar/admin";
import { decryptCalendarToken, isCalendarFeatureEnabled } from "@/server/calendar/crypto";
import { googleCalendarRequest, refreshGoogleAccessToken, revokeGoogleToken } from "@/server/calendar/google";
export const runtime = "nodejs";
export async function POST() {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const requestOrigin = (await import("next/headers")).headers().then((h) => h.get("origin"));
  const suppliedOrigin = await requestOrigin;
  if (suppliedOrigin && suppliedOrigin !== new URL(origin).origin) return NextResponse.json({ error: "origin_forbidden" }, { status: 403 });
  if (!isCalendarFeatureEnabled()) return NextResponse.redirect(new URL("/painel?calendar=disabled", origin));
  const user = await requireUser("/painel"), provider = await getOwnedProvider(user.id);
  if (!provider) return NextResponse.redirect(new URL("/painel?calendar=provider-required", origin));
  const admin = calendarAdminClient();
  const { data: connection } = await admin.from("provider_calendar_connections").select("provider_id,refresh_token_ciphertext,calendar_id").eq("provider_id", provider.id).maybeSingle();
  let cleanupIncomplete = false;
  if (connection) {
    try {
      const token = await refreshGoogleAccessToken(connection);
      const { data: events } = await admin.from("booking_calendar_events").select("calendar_id,google_event_id").eq("provider_id", provider.id);
      for (const event of events ?? []) {
        const response = await googleCalendarRequest(token, `/calendars/${encodeURIComponent(event.calendar_id)}/events/${encodeURIComponent(event.google_event_id)}`, "DELETE");
        if (!response.ok && response.status !== 404 && response.status !== 410) cleanupIncomplete = true;
      }
    } catch { cleanupIncomplete = true; }
    if (connection.refresh_token_ciphertext) {
      try { const response = await revokeGoogleToken(decryptCalendarToken(connection.refresh_token_ciphertext)); if (!response.ok) cleanupIncomplete = true; }
      catch { cleanupIncomplete = true; }
    }
  }
  const { data: bookings } = await admin.from("bookings").select("id").eq("provider_id", provider.id);
  const bookingIds = (bookings ?? []).map((booking) => booking.id);
  if (bookingIds.length) {
    // Stop queued sync attempts after explicit disconnect; already-created events
    // are cleaned up above on a best-effort basis.
    await admin.from("calendar_sync_outbox").update({ status: "succeeded", completed_at: new Date().toISOString(), processing_started_at: null, last_error_code: "provider_disconnected" }).in("booking_id", bookingIds).in("status", ["pending", "failed", "processing"]);
  }
  await admin.from("booking_calendar_events").delete().eq("provider_id", provider.id);
  await admin.from("provider_calendar_connections").delete().eq("provider_id", provider.id);
  return NextResponse.redirect(new URL(cleanupIncomplete ? "/painel?calendar=disconnected-cleanup-warning" : "/painel?calendar=disconnected", origin));
}
