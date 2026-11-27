import { describe, expect, it } from "vitest";
import { buildCalendarEvent } from "./event-payload";
describe("calendar payload privacy", () => {
  it("includes only service and time fields, without customer data", () => {
    const payload = buildCalendarEvent({ id: "event-id", serviceName: "Corte", startsAt: "2026-12-01T10:00:00-03:00", endsAt: "2026-12-01T10:30:00-03:00", timezone: "America/Sao_Paulo" });
    expect(payload).toEqual({ id: "event-id", summary: "Corte", start: { dateTime: "2026-12-01T10:00:00-03:00", timeZone: "America/Sao_Paulo" }, end: { dateTime: "2026-12-01T10:30:00-03:00", timeZone: "America/Sao_Paulo" } });
    expect(Object.keys(payload)).toEqual(["id", "summary", "start", "end"]);
  });
});
