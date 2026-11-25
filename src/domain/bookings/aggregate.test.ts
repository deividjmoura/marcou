import { describe, expect, it } from "vitest";
import { aggregateBookingServices } from "./aggregate";

describe("aggregateBookingServices", () => {
  it("soma duração, intervalo, preço e sinal dos serviços selecionados", () => {
    const totals = aggregateBookingServices([
      {
        name: "Corte",
        durationMinutes: 60,
        bufferMinutes: 15,
        priceCents: 8000,
        depositCents: 2000,
      },
      {
        name: "Barba",
        durationMinutes: 30,
        bufferMinutes: 0,
        priceCents: 4000,
        depositCents: 0,
      },
    ]);

    expect(totals).toEqual({
      nameSnapshot: "Corte + Barba",
      durationMinutes: 90,
      bufferMinutes: 15,
      occupiedMinutes: 105,
      priceCents: 12000,
      depositCents: 2000,
    });
  });

  it("soma o intervalo de cada serviço, inclusive os intermediários", () => {
    // Regra atual da Issue #21 (sem alteração): o cliente ocupa a soma de
    // duração + intervalo de todos os serviços do conjunto.
    const totals = aggregateBookingServices([
      {
        name: "Corte",
        durationMinutes: 30,
        bufferMinutes: 10,
        priceCents: 3000,
        depositCents: 0,
      },
      {
        name: "Barba",
        durationMinutes: 45,
        bufferMinutes: 5,
        priceCents: 2000,
        depositCents: 0,
      },
    ]);

    expect(totals.durationMinutes).toBe(75);
    expect(totals.bufferMinutes).toBe(15);
    expect(totals.occupiedMinutes).toBe(90);
  });

  it("mantém o significado de serviço único", () => {
    expect(
      aggregateBookingServices([
        {
          name: "Corte",
          durationMinutes: 60,
          bufferMinutes: 15,
          priceCents: 8000,
          depositCents: 2000,
        },
      ]),
    ).toEqual({
      nameSnapshot: "Corte",
      durationMinutes: 60,
      bufferMinutes: 15,
      occupiedMinutes: 75,
      priceCents: 8000,
      depositCents: 2000,
    });
  });

  it("rejeita lista vazia, excesso de serviços e valores inválidos", () => {
    const service = {
      name: "Corte",
      durationMinutes: 30,
      bufferMinutes: 0,
      priceCents: 1000,
      depositCents: 0,
    };

    expect(() => aggregateBookingServices([])).toThrow("ao menos um");
    expect(() => aggregateBookingServices(Array(21).fill(service))).toThrow(
      "máximo 20",
    );
    expect(() =>
      aggregateBookingServices([{ ...service, durationMinutes: 0 }]),
    ).toThrow("inválidos");
  });
});
