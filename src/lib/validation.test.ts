import { describe, expect, it } from "vitest";
import {
  availabilityExceptionInputSchema,
  availabilityRuleInputSchema,
  bookingInputSchema,
  providerInputSchema,
  serviceInputSchema,
} from "./validation";

describe("serviceInputSchema", () => {
  it("aceita dados válidos", () => {
    const result = serviceInputSchema.safeParse({
      name: "Corte",
      description: "",
      durationMinutes: "45",
      priceCents: 8000,
      depositCents: 2000,
      bufferMinutes: 15,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sinal maior que o preço", () => {
    const result = serviceInputSchema.safeParse({
      name: "Corte",
      durationMinutes: 45,
      priceCents: 1000,
      depositCents: 2000,
      bufferMinutes: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("availabilityRuleInputSchema", () => {
  it("rejeita início depois do fim", () => {
    expect(
      availabilityRuleInputSchema.safeParse({
        dayOfWeek: 1,
        startsAt: "18:00",
        endsAt: "09:00",
      }).success,
    ).toBe(false);
  });
});

describe("availabilityExceptionInputSchema", () => {
  it("exige horário no horário especial", () => {
    expect(
      availabilityExceptionInputSchema.safeParse({
        date: "2026-12-01",
        kind: "custom_hours",
      }).success,
    ).toBe(false);
  });

  it("aceita bloqueio sem horário", () => {
    expect(
      availabilityExceptionInputSchema.safeParse({
        date: "2026-12-01",
        kind: "blocked",
      }).success,
    ).toBe(true);
  });
});

describe("providerInputSchema", () => {
  it("valida slug e fuso", () => {
    expect(
      providerInputSchema.safeParse({
        slug: "Studio-Ana",
        displayName: "Studio Ana",
        timezone: "America/Sao_Paulo",
        isPublished: "on",
        bookingHoldMinutes: 30,
      }).success,
    ).toBe(false);

    expect(
      providerInputSchema.safeParse({
        slug: "studio-ana",
        displayName: "Studio Ana",
        timezone: "America/Sao_Paulo",
        isPublished: "on",
        bookingHoldMinutes: 30,
      }).success,
    ).toBe(true);
  });
});

describe("bookingInputSchema", () => {
  it("rejeita startsAt inválido", () => {
    expect(
      bookingInputSchema.safeParse({
        slug: "studio",
        serviceId: "123e4567-e89b-12d3-a456-426614174000",
        startsAt: "amanhã",
        customerName: "Ana",
      }).success,
    ).toBe(false);
  });
});
