import { describe, expect, it } from "vitest";
import { aggregateBookingServices } from "./aggregate";

describe("aggregateBookingServices", () => {
  it("soma duração, preço e sinal e usa o intervalo apenas do último serviço", () => {
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
      bufferMinutes: 0,
      occupiedMinutes: 90,
      priceCents: 12000,
      depositCents: 2000,
    });
  });

  it("aplica a decisão do responsável aos pares de intervalo pedidos", () => {
    // Tempo ocupado = soma das durações + intervalo APENAS do último serviço.
    const first = aggregateBookingServices([
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
    expect(first.durationMinutes).toBe(75);
    expect(first.bufferMinutes).toBe(5);
    expect(first.occupiedMinutes).toBe(80);

    const second = aggregateBookingServices([
      {
        name: "Corte",
        durationMinutes: 30,
        bufferMinutes: 15,
        priceCents: 3000,
        depositCents: 0,
      },
      {
        name: "Barba",
        durationMinutes: 45,
        bufferMinutes: 20,
        priceCents: 2000,
        depositCents: 0,
      },
    ]);
    expect(second.durationMinutes).toBe(75);
    expect(second.bufferMinutes).toBe(20);
    expect(second.occupiedMinutes).toBe(95);
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
