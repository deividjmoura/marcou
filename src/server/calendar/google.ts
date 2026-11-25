import { encryptCalendarToken, decryptCalendarToken } from "./crypto";
import { calendarAdminClient } from "./admin";
import { buildCalendarEvent } from "./event-payload";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export type CalendarConnection = { provider_id: string; refresh_token_ciphertext: string | null; calendar_id: string };
export async function refreshGoogleAccessToken(connection: CalendarConnection): Promise<string> {
  if (!connection.refresh_token_ciphertext) throw new Error("calendar_reconnect_required");
  const response = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "", refresh_token: decryptCalendarToken(connection.refresh_token_ciphertext), grant_type: "refresh_token" }), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== "string") {
    if (payload.error === "invalid_grant") {
      await calendarAdminClient().from("provider_calendar_connections").update({ connection_status: "suspended", updated_at: new Date().toISOString() }).eq("provider_id", connection.provider_id);
      throw new Error("calendar_reconnect_required");
    }
    throw new Error("google_refresh_failed");
  }
  const { error } = await calendarAdminClient().from("provider_calendar_connections").update({ access_token_ciphertext: encryptCalendarToken(payload.access_token), access_token_expires_at: new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString(), connection_status: "connected", updated_at: new Date().toISOString() }).eq("provider_id", connection.provider_id);
  if (error) throw new Error("calendar_token_save_failed");
  return payload.access_token as string;
}
export function googleCalendarRequest(token: string, path: string, method: string, body?: unknown) {
  return fetch(CALENDAR_API + path, { method, headers: { authorization: "Bearer " + token, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
}
export async function exchangeOAuthCode(code: string, redirectUri: string) {
  const response = await fetch(TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "", redirect_uri: redirectUri, grant_type: "authorization_code" }), cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error("calendar_oauth_exchange_failed");
  return payload as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}
export async function revokeGoogleToken(token: string) {
  return fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), cache: "no-store" });
}
export async function runCalendarWorker(limit = 10) {
  const admin = calendarAdminClient();
  const { data: jobs, error } = await admin.rpc("claim_calendar_sync_jobs", { p_limit: limit });
  if (error) throw new Error("calendar_outbox_claim_failed");
  let succeeded = 0, failed = 0;
  for (const job of jobs ?? []) {
    try {
      const { data: booking, error: bookingError } = await admin.from("bookings").select("id,provider_id,service_name_snapshot,starts_at,ends_at,timezone,status").eq("id", job.booking_id).maybeSingle();
      if (bookingError) throw new Error("booking_lookup_failed");
      const { data: mapping, error: mappingError } = await admin.from("booking_calendar_events").select("provider_id,calendar_id,google_event_id").eq("booking_id", job.booking_id).maybeSingle();
      if (mappingError) throw new Error("event_mapping_lookup_failed");
      if (job.operation === "delete" || !booking || booking.status !== "confirmed") {
        if (mapping) {
          const { data: connection } = await admin.from("provider_calendar_connections").select("provider_id,refresh_token_ciphertext,calendar_id").eq("provider_id", booking?.provider_id ?? mapping.provider_id).maybeSingle();
          if (connection) {
            const token = await refreshGoogleAccessToken(connection);
            const res = await googleCalendarRequest(token, `/calendars/${encodeURIComponent(mapping.calendar_id)}/events/${encodeURIComponent(mapping.google_event_id)}`, "DELETE");
            if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error("google_event_delete_failed");
          }
          await admin.from("booking_calendar_events").delete().eq("booking_id", job.booking_id);
        }
      } else {
        const { data: connection, error: connectionError } = await admin.from("provider_calendar_connections").select("provider_id,refresh_token_ciphertext,calendar_id,connection_status").eq("provider_id", booking.provider_id).maybeSingle();
        if (connectionError || !connection || connection.connection_status !== "connected") throw new Error("calendar_connection_missing");
        const calendarId = connection.calendar_id || "primary";
        const eventId = mapping?.google_event_id ?? "marcou" + (await import("node:crypto")).createHash("sha256").update(booking.id).digest("hex").slice(0, 40);
        const token = await refreshGoogleAccessToken(connection);
        // Deliberately exclude customer name, phone, email and booking ID from event payload.
        const event = buildCalendarEvent({ id: eventId, serviceName: booking.service_name_snapshot, startsAt: booking.starts_at, endsAt: booking.ends_at, timezone: booking.timezone });
        const collection = `/calendars/${encodeURIComponent(calendarId)}/events`;
        let response: Response;
        if (mapping) response = await googleCalendarRequest(token, collection + "/" + encodeURIComponent(eventId), "PATCH", event);
        else { response = await googleCalendarRequest(token, collection, "POST", event); if (response.status === 409) response = await googleCalendarRequest(token, collection + "/" + encodeURIComponent(eventId), "PATCH", event); }
        if (!response.ok) throw new Error("google_event_upsert_failed");
        const { error: mapError } = await admin.from("booking_calendar_events").upsert({ booking_id: booking.id, provider_id: booking.provider_id, calendar_id: calendarId, google_event_id: eventId, updated_at: new Date().toISOString() });
        if (mapError) throw new Error("calendar_event_mapping_save_failed");
      }
      const now = new Date().toISOString();
      await admin.from("calendar_sync_outbox").update({ status: "succeeded", completed_at: now, processing_started_at: null, last_error_code: null, available_at: now }).eq("id", job.id);
      succeeded++;
    } catch (error) {
      const attempts = Number(job.attempts ?? 1), delay = Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
      await admin.from("calendar_sync_outbox").update({ status: "failed", completed_at: null, processing_started_at: null, last_error_code: (error instanceof Error ? error.message : "worker_unknown").slice(0, 80), available_at: new Date(Date.now() + delay * 1000).toISOString() }).eq("id", job.id);
      failed++;
    }
  }
  return { claimed: (jobs ?? []).length, succeeded, failed };
}
