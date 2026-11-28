import { describe, expect, it } from "vitest";
import { CalendarDownloadButton } from "./calendar-download";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

describe("CalendarDownloadButton", () => {
  it("inclui nome agregado, duração e preço no .ics", () => {
    const html = renderToStaticMarkup(
      React.createElement(CalendarDownloadButton, {
        bookingId: "b1",
        startsAt: "2026-12-01T12:00:00.000Z",
        endsAt: "2026-12-01T13:30:00.000Z",
        createdAt: "2026-11-27T10:00:00.000Z",
        serviceName: "Corte + Barba",
        providerName: "Studio Ana",
        durationMinutes: 90,
        priceCents: 15000,
      }),
    );
    const hrefMatch = html.match(/href="([^"]+)"/);
    expect(hrefMatch).toBeTruthy();
    const decoded = decodeURIComponent(hrefMatch![1].replace("data:text/calendar;charset=utf-8,", ""));
    expect(decoded).toContain("SUMMARY:Corte + Barba");
    expect(decoded).toContain("Duração total: 90 min");
    expect(decoded).toContain("Valor:");
    expect(decoded).toContain("BEGIN:VCALENDAR");
  });

  it("funciona para reserva de um serviço sem preço opcional", () => {
    const html = renderToStaticMarkup(
      React.createElement(CalendarDownloadButton, {
        bookingId: "b2",
        startsAt: "2026-12-01T12:00:00.000Z",
        endsAt: "2026-12-01T12:45:00.000Z",
        createdAt: "2026-11-27T10:00:00.000Z",
        serviceName: "Corte",
        providerName: "Studio Ana",
      }),
    );
    const hrefMatch = html.match(/href="([^"]+)"/);
    const decoded = decodeURIComponent(hrefMatch![1].replace("data:text/calendar;charset=utf-8,", ""));
    expect(decoded).toContain("SUMMARY:Corte");
    expect(decoded).toContain("Agendamento com Studio Ana");
  });
});
