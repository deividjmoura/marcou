import { describe, expect, it } from "vitest";
import {
  assertSafeE2EEnvironment,
  buildSmokeFixture,
  pickDeterministicE2EDate,
  PRODUCTION_SUPABASE_PROJECT_REF,
  sanitizeE2ERunId,
} from "./e2e-smoke";
import {
  availabilityRuleInputSchema,
  providerInputSchema,
  serviceInputSchema,
} from "./validation";
import { parseBrlToCents, parseOptionalBrlToCents } from "./money";
import { reservationActionsFor } from "@/app/reserva/[id]/reservation-role";

describe("assertSafeE2EEnvironment", () => {
  it("aceita Supabase local em loopback (Opção A do ADR)", () => {
    const result = assertSafeE2EEnvironment({
      supabaseUrl: "http://127.0.0.1:54321",
      siteUrl: "http://127.0.0.1:3000",
    });

    expect(result).toEqual({
      mode: "local",
      supabaseOrigin: "http://127.0.0.1:54321",
      siteOrigin: "http://127.0.0.1:3000",
      healthUrl: "http://127.0.0.1:3000/api/health",
    });
  });

  it("aceita projeto de staging remoto dedicado via HTTPS (Opção B do ADR)", () => {
    const result = assertSafeE2EEnvironment({
      supabaseUrl: "https://stagingexample123456.supabase.co",
      siteUrl: "http://localhost:3000",
    });

    expect(result).toEqual({
      mode: "staging",
      supabaseOrigin: "https://stagingexample123456.supabase.co",
      siteOrigin: "http://localhost:3000",
      healthUrl: "http://localhost:3000/api/health",
    });
  });

  it("recusa o project ref de produção no Supabase", () => {
    expect(() =>
      assertSafeE2EEnvironment({
        supabaseUrl: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
        siteUrl: "http://127.0.0.1:3000",
      }),
    ).toThrow(/produção/i);
  });

  it("recusa o domínio de produção na Netlify", () => {
    expect(() =>
      assertSafeE2EEnvironment({
        supabaseUrl: "http://127.0.0.1:54321",
        siteUrl: "https://marcoou.netlify.app",
      }),
    ).toThrow(/produção/i);
  });

  it("falha fechado quando NEXT_PUBLIC_SUPABASE_URL está ausente ou insegura em staging", () => {
    expect(() => assertSafeE2EEnvironment({})).toThrow(/ausente/i);
    expect(() =>
      assertSafeE2EEnvironment({
        supabaseUrl: "http://stagingexample123456.supabase.co",
      }),
    ).toThrow(/HTTPS/i);
  });
});

describe("pickDeterministicE2EDate", () => {
  it("respeita virada de dia UTC usando o fuso America/Sao_Paulo", () => {
    // 2026-12-01 01:30 UTC equivale a 2026-11-30 22:30 em America/Sao_Paulo (segunda).
    // +3 dias em BRT = 2026-12-03 (quinta-feira -> dayOfWeek 4).
    const picked = pickDeterministicE2EDate({
      now: new Date("2026-12-01T01:30:00.000Z"),
      timeZone: "America/Sao_Paulo",
      offsetDays: 3,
    });

    expect(picked).toEqual({
      dateIso: "2026-12-03",
      dayOfWeek: 4,
      timeZone: "America/Sao_Paulo",
    });
  });

  it("converte domingo do luxon (7) para a convenção do Marcou (0)", () => {
    // 2026-12-03 (quinta) + 3 dias = 2026-12-06 (domingo).
    const picked = pickDeterministicE2EDate({
      now: new Date("2026-12-03T15:00:00.000Z"),
      offsetDays: 3,
    });

    expect(picked.dateIso).toBe("2026-12-06");
    expect(picked.dayOfWeek).toBe(0);
  });

  it("rejeita fuso inválido ou offset fora da faixa", () => {
    expect(() =>
      pickDeterministicE2EDate({ timeZone: "Invalid/Zone" }),
    ).toThrow(/Fuso horário inválido/);
    expect(() => pickDeterministicE2EDate({ offsetDays: 0 })).toThrow(
      /offsetDays/,
    );
  });
});

describe("buildSmokeFixture e contratos das 3 jornadas", () => {
  it("normaliza runId para slug e e-mails RFC 2606 (.test)", () => {
    expect(sanitizeE2ERunId("  GH_Run#164!  ")).toBe("gh-run-164");
    expect(() => sanitizeE2ERunId("!")).toThrow(/runId/);
  });

  it("gera dados aderentes aos schemas Zod reais e ao agregador multi-serviço", () => {
    const fixture = buildSmokeFixture("ci-42", {
      now: new Date("2026-12-01T15:00:00.000Z"),
    });

    expect(fixture.providerAccount.email).toMatch(/@marcou\.test$/);
    expect(fixture.customerAccount.email).toMatch(/@marcou\.test$/);
    expect(fixture.outsiderAccount.email).toMatch(/@marcou\.test$/);

    expect(providerInputSchema.safeParse(fixture.business).success).toBe(true);
    expect(
      availabilityRuleInputSchema.safeParse(fixture.availabilityRule).success,
    ).toBe(true);

    for (const service of fixture.services) {
      expect(parseBrlToCents(service.priceInputBrl)).toBe(service.priceCents);
      expect(parseOptionalBrlToCents(service.depositInputBrl)).toBe(
        service.depositCents,
      );
      expect(serviceInputSchema.safeParse(service).success).toBe(true);
    }

    expect(fixture.expectedMultiServiceTotals).toEqual({
      nameSnapshot: "Serviço A + Serviço B",
      durationMinutes: 90,
      bufferMinutes: 10,
      occupiedMinutes: 100,
      priceCents: 12500,
      depositCents: 3000,
    });
  });

  it("mantém alinhados os rótulos das ações das jornadas J2 e J3 por papel", () => {
    const customerPending = reservationActionsFor("customer", "pending_payment").map(
      (spec) => spec.label,
    );
    expect(customerPending).toContain("Já enviei o comprovante");
    expect(customerPending).toContain("Cancelar agendamento");
    expect(customerPending).not.toContain("Confirmar pagamento");

    const ownerReview = reservationActionsFor("owner", "pending_review").map(
      (spec) => spec.label,
    );
    expect(ownerReview).toContain("Confirmar pagamento");
    expect(ownerReview).toContain("Cancelar reserva do cliente");
  });
});
