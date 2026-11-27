import { describe, expect, it } from "vitest";
import { CalendarSyncError, RECONNECT_REQUIRED } from "./errors";
import { createGoogleCalendarApi, type FetchLike } from "./google";

const event = {
  id: "evt",
  summary: "Corte",
  start: { dateTime: "2026-12-01T13:00:00Z", timeZone: "America/Sao_Paulo" },
  end: { dateTime: "2026-12-01T13:30:00Z", timeZone: "America/Sao_Paulo" },
};

function api(status: number, body: unknown = {}) {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url, init });
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  };
  return { client: createGoogleCalendarApi(fetchImpl), requests };
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as CalendarSyncError;
  }
  throw new Error("expected rejection");
}

describe("Google Calendar API client", () => {
  it("classifica 409 no insert como conflito e 404/410 no delete como ausente", async () => {
    expect(await api(409).client.insertEvent("t", "primary", event)).toBe("conflict");
    expect(await api(404).client.deleteEvent("t", "primary", "evt")).toBe("gone");
    expect(await api(410).client.deleteEvent("t", "primary", "evt")).toBe("gone");
    expect(await api(204).client.deleteEvent("t", "primary", "evt")).toBe("ok");
  });

  it("429/5xx são retentáveis; 400 é permanente", async () => {
    expect((await errorOf(api(503).client.insertEvent("t", "primary", event))).retryable).toBe(true);
    expect((await errorOf(api(429).client.deleteEvent("t", "primary", "evt"))).retryable).toBe(true);
    const permanent = await errorOf(api(400).client.patchEvent("t", "primary", "evt", event));
    expect(permanent.retryable).toBe(false);
    expect(permanent.code).toBe("google_event_patch_http_400");
  });

  it("invalid_grant no refresh exige reconexão sem retry", async () => {
    const error = await errorOf(api(400, { error: "invalid_grant" }).client.refreshAccessToken("r"));
    expect(error.code).toBe(RECONNECT_REQUIRED);
    expect(error.retryable).toBe(false);
  });

  it("falha de rede é retentável", async () => {
    const client = createGoogleCalendarApi(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await errorOf(client.insertEvent("t", "primary", event));
    expect(error.code).toBe("google_event_insert_network");
    expect(error.retryable).toBe(true);
  });

  it("codifica calendarId e eventId na URL e envia bearer", async () => {
    const { client, requests } = api(200);
    await client.patchEvent("tok", "a/b@group.calendar.google.com", "evt", event);
    expect(requests[0].url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/a%2Fb%40group.calendar.google.com/events/evt",
    );
    expect((requests[0].init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
});
