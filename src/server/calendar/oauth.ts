import { randomBytes } from "node:crypto";
import { hashCalendarState } from "./crypto";

export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CALENDAR_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function calendarOAuthState() {
  const state = randomBytes(32).toString("base64url");
  return { state, hash: hashCalendarState(state) };
}

export function calendarRedirectUri() {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) throw new Error("calendar_site_url_missing");
  return new URL("/api/calendar/callback", origin).toString();
}

/**
 * O Google devolve `scope` como lista separada por espaço. Exigimos o escopo
 * exato de eventos; ausência de `scope` ou escopo parcial é recusada (nunca
 * presumimos o que foi concedido).
 */
export function hasCalendarEventsScope(scope: string | null | undefined): boolean {
  if (typeof scope !== "string") return false;
  return scope.split(/\s+/).filter(Boolean).includes(CALENDAR_EVENTS_SCOPE);
}

export function googleAuthorizationUrl(state: string) {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  if (!clientId) throw new Error("calendar_oauth_not_configured");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", calendarRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_EVENTS_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}
