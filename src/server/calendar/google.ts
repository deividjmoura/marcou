import { CalendarSyncError, RECONNECT_REQUIRED } from "./errors";
import type { buildCalendarEvent } from "./event-payload";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export type CalendarEventBody = ReturnType<typeof buildCalendarEvent>;
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OAuthTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export type EventWriteResult = "ok" | "conflict" | "gone";

export interface GoogleCalendarApi {
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  /** Lança CalendarSyncError(RECONNECT_REQUIRED, false) em invalid_grant. */
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>;
  revokeToken(token: string): Promise<boolean>;
  insertEvent(token: string, calendarId: string, event: CalendarEventBody): Promise<EventWriteResult>;
  patchEvent(token: string, calendarId: string, eventId: string, event: CalendarEventBody): Promise<EventWriteResult>;
  /** "gone" quando o evento já não existe (404/410): tratado como removido. */
  deleteEvent(token: string, calendarId: string, eventId: string): Promise<"ok" | "gone">;
}

/**
 * 429/5xx/401/403 e falhas de rede são transitórios (retry com backoff);
 * demais 4xx são permanentes e levam o job a `dead`.
 */
function httpError(prefix: string, status: number): CalendarSyncError {
  const retryable = status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
  return new CalendarSyncError(`${prefix}_http_${status}`, retryable);
}

function eventPath(calendarId: string, eventId?: string) {
  const base = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

/** Parâmetros do token endpoint com as credenciais OAuth lidas do ambiente. */
function tokenRequestBody(fields: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams(fields);
  body.set("client_id", process.env.GOOGLE_CALENDAR_CLIENT_ID ?? "");
  body.set("client_secret", process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? "");
  return body;
}

export function createGoogleCalendarApi(fetchImpl: FetchLike = fetch): GoogleCalendarApi {
  async function send(prefix: string, input: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(input, { ...init, cache: "no-store" });
    } catch {
      throw new CalendarSyncError(`${prefix}_network`, true);
    }
  }

  function jsonRequest(token: string, method: string, body?: unknown): RequestInit {
    return {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
  }

  return {
    async exchangeCode(code, redirectUri) {
      const response = await send("calendar_oauth_exchange", TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: tokenRequestBody({ code, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.access_token !== "string") {
        throw new CalendarSyncError("calendar_oauth_exchange_failed", false);
      }
      return payload as OAuthTokens;
    },

    async refreshAccessToken(refreshToken) {
      const response = await send("google_refresh", TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: tokenRequestBody({ refresh_token: refreshToken, grant_type: "refresh_token" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && typeof payload.access_token === "string") {
        return { accessToken: payload.access_token, expiresIn: Number(payload.expires_in ?? 3600) };
      }
      if (payload?.error === "invalid_grant") throw new CalendarSyncError(RECONNECT_REQUIRED, false);
      throw httpError("google_refresh", response.status);
    },

    async revokeToken(token) {
      try {
        const response = await fetchImpl(REVOKE_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
          cache: "no-store",
        });
        return response.ok;
      } catch {
        return false;
      }
    },

    async insertEvent(token, calendarId, event) {
      const response = await send("google_event_insert", eventPath(calendarId), jsonRequest(token, "POST", event));
      if (response.ok) return "ok";
      if (response.status === 409) return "conflict";
      throw httpError("google_event_insert", response.status);
    },

    async patchEvent(token, calendarId, eventId, event) {
      const response = await send(
        "google_event_patch",
        eventPath(calendarId, eventId),
        jsonRequest(token, "PATCH", event),
      );
      if (response.ok) return "ok";
      if (response.status === 404 || response.status === 410) return "gone";
      throw httpError("google_event_patch", response.status);
    },

    async deleteEvent(token, calendarId, eventId) {
      const response = await send("google_event_delete", eventPath(calendarId, eventId), jsonRequest(token, "DELETE"));
      if (response.ok) return "ok";
      if (response.status === 404 || response.status === 410) return "gone";
      throw httpError("google_event_delete", response.status);
    },
  };
}
