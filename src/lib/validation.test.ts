import { describe, expect, it } from "vitest";
import {
  availabilityExceptionInputSchema,
  availabilityRuleInputSchema,
  bookingInputSchema,
  isoDate,
  multiBookingInputSchema,
  providerInputSchema,
  providerSettingsSchema,
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
    const uppercaseSlug = providerInputSchema.safeParse({
      slug: "Studio-Ana",
      displayName: "Studio Ana",
      description: "Atendimento com carinho e qualidade.",
      timezone: "America/Sao_Paulo",
      isPublished: "on",
      bookingHoldMinutes: 30,
    });
    expect(uppercaseSlug.success).toBe(true);
    if (uppercaseSlug.success) expect(uppercaseSlug.data.slug).toBe("studio-ana");

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

describe("providerSettingsSchema", () => {
  it("permite atualizar o slug com o mesmo formato do cadastro", () => {
    expect(providerSettingsSchema.safeParse({
      slug: "studio-novo",
      displayName: "Studio Ana",
      timezone: "America/Sao_Paulo",
      isPublished: true,
      bookingHoldMinutes: 30,
    }).success).toBe(true);
  });

  it("rejeita slug inválido ao editar o negócio", () => {
    expect(providerSettingsSchema.safeParse({
      slug: "Studio Novo",
      displayName: "Studio Ana",
      timezone: "America/Sao_Paulo",
      isPublished: true,
      bookingHoldMinutes: 30,
    }).success).toBe(false);
  });
});

describe("isoDate", () => {
  it("aceita uma data válida", () => {
    expect(isoDate.safeParse("2026-12-01").success).toBe(true);
  });

  it("rejeita data impossível normalizada pelo JavaScript", () => {
    // new Date("2026-02-30T00:00:00Z") vira 02/03; o round-trip revela a fraude.
    expect(isoDate.safeParse("2026-02-30").success).toBe(false);
  });

  it("rejeita mês e dia fora do intervalo", () => {
    expect(isoDate.safeParse("2026-13-01").success).toBe(false);
    expect(isoDate.safeParse("2026-00-10").success).toBe(false);
  });

  it("rejeita formato fora do padrão", () => {
    expect(isoDate.safeParse("01/12/2026").success).toBe(false);
    expect(isoDate.safeParse("2026-1-1").success).toBe(false);
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

describe("multiBookingInputSchema", () => {
  const base = {
    slug: "studio",
    startsAt: "2026-12-01T12:00:00.000Z",
    customerName: "Ana",
  };
  const serviceA = "123e4567-e89b-12d3-a456-426614174000";
  const serviceB = "223e4567-e89b-12d3-a456-426614174001";

  it("aceita um ou mais serviços", () => {
    expect(
      multiBookingInputSchema.safeParse({
        ...base,
        serviceIds: [serviceA, serviceB],
      }).success,
    ).toBe(true);
    expect(
      multiBookingInputSchema.safeParse({ ...base, serviceIds: [serviceA] })
        .success,
    ).toBe(true);
  });

  it("rejeita lista vazia, duplicadas e excesso de serviços", () => {
    expect(
      multiBookingInputSchema.safeParse({ ...base, serviceIds: [] }).success,
    ).toBe(false);
    expect(
      multiBookingInputSchema.safeParse({
        ...base,
        serviceIds: [serviceA, serviceA],
      }).success,
    ).toBe(false);
    expect(
      multiBookingInputSchema.safeParse({
        ...base,
        serviceIds: Array(21).fill(serviceA),
      }).success,
    ).toBe(false);
  });
});
