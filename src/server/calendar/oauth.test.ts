import { afterEach, describe, expect, it } from "vitest";
import { calendarOAuthState, googleAuthorizationUrl } from "./oauth";
const oldClient = process.env.GOOGLE_CALENDAR_CLIENT_ID, oldSite = process.env.NEXT_PUBLIC_SITE_URL;
afterEach(() => { if (oldClient === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID; else process.env.GOOGLE_CALENDAR_CLIENT_ID = oldClient; if (oldSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = oldSite; });
describe("Calendar OAuth", () => {
 it("creates unpredictable state values and hashes them separately", () => { const a = calendarOAuthState(), b = calendarOAuthState(); expect(a.state).not.toBe(b.state); expect(a.hash).not.toBe(a.state); expect(a.hash).toHaveLength(64); });
 it("uses only calendar.events and requests offline access", () => { process.env.GOOGLE_CALENDAR_CLIENT_ID = "client-id"; process.env.NEXT_PUBLIC_SITE_URL = "https://marcou.example"; const url = new URL(googleAuthorizationUrl("state-token")); expect(url.origin).toBe("https://accounts.google.com"); expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar.events"); expect(url.searchParams.get("access_type")).toBe("offline"); expect(url.searchParams.get("state")).toBe("state-token"); expect(url.searchParams.get("redirect_uri")).toBe("https://marcou.example/api/calendar/callback"); });
});

describe("Calendar OAuth scope", () => {
  it("exige calendar.events explicitamente em tokens.scope", async () => {
    const { hasCalendarEventsScope, CALENDAR_EVENTS_SCOPE } = await import("./oauth");
    expect(hasCalendarEventsScope(undefined)).toBe(false);
    expect(hasCalendarEventsScope("")).toBe(false);
    expect(hasCalendarEventsScope("https://www.googleapis.com/auth/calendar.events.readonly")).toBe(false);
    expect(hasCalendarEventsScope(`openid  ${CALENDAR_EVENTS_SCOPE}`)).toBe(true);
  });
});
