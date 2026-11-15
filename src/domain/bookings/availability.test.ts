import { describe, expect, it } from "vitest";
import {
  generateSlots,
  localToUtc,
  type AvailabilityException,
  type AvailabilityRule,
  type BusyInterval,
} from "./availability";

const date = (value: string) => new Date(value);

const rule = (
  dayOfWeek: number,
  startsAtMinutes: number,
  endsAtMinutes: number,
  overrides: Partial<AvailabilityRule> = {},
): AvailabilityRule => ({
  dayOfWeek,
  startsAtMinutes,
  endsAtMinutes,
  isActive: true,
  ...overrides,
});

const timing = { durationMinutes: 60, bufferMinutes: 0 };

/** 2026-12-01 é uma terça-feira. */
const TUESDAY = "2026-12-01";
const TUESDAY_09_TO_12 = [rule(2, 9 * 60, 12 * 60)];

describe("localToUtc", () => {
  it("converte horário local do prestador para UTC", () => {
    // America/Sao_Paulo está UTC-3 sem horário de verão desde 2019.
    expect(localToUtc(TUESDAY, 9 * 60, "America/Sao_Paulo").toISOString()).toBe(
      "2026-12-01T12:00:00.000Z",
    );
  });
});

describe("generateSlots", () => {
  it("gera slots dentro do expediente", () => {
    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules: TUESDAY_09_TO_12,
      exceptions: [],
      busyIntervals: [],
      timing,
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-12-01T12:00:00.000Z",
      "2026-12-01T13:00:00.000Z",
      "2026-12-01T14:00:00.000Z",
    ]);
    expect(slots[0].occupiedUntil.toISOString()).toBe(
      "2026-12-01T13:00:00.000Z",
    );
  });

  it("considera o intervalo do serviço no fim do período ocupado", () => {
    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules: TUESDAY_09_TO_12,
      exceptions: [],
      busyIntervals: [],
      timing: { durationMinutes: 60, bufferMinutes: 15 },
      stepMinutes: 60,
    });

    // 11:00 + 60 + 15 = 12:15, não cabe na janela que termina ao meio-dia.
    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-12-01T12:00:00.000Z",
      "2026-12-01T13:00:00.000Z",
    ]);
    expect(slots[1].occupiedUntil.toISOString()).toBe(
      "2026-12-01T14:15:00.000Z",
    );
  });

  it("remove slots sobrepostos a reservas existentes", () => {
    const busy: BusyInterval[] = [
      {
        startsAt: date("2026-12-01T13:00:00.000Z"),
        occupiedUntil: date("2026-12-01T14:00:00.000Z"),
      },
    ];

    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules: TUESDAY_09_TO_12,
      exceptions: [],
      busyIntervals: busy,
      timing,
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-12-01T12:00:00.000Z",
      "2026-12-01T14:00:00.000Z",
    ]);
  });

  it("aceita slot adjacente a uma reserva", () => {
    const busy: BusyInterval[] = [
      {
        startsAt: date("2026-12-01T12:00:00.000Z"),
        occupiedUntil: date("2026-12-01T13:00:00.000Z"),
      },
    ];

    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules: TUESDAY_09_TO_12,
      exceptions: [],
      busyIntervals: busy,
      timing,
    });

    // O slot das 09:00 (12:00Z) conflita com a reserva; o das 10:00 (13:00Z)
    // começa exatamente quando ela termina e deve ser aceito.
    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-12-01T13:00:00.000Z",
      "2026-12-01T14:00:00.000Z",
    ]);
  });

  it("bloqueio no dia não gera slots", () => {
    const exceptions: AvailabilityException[] = [
      { date: TUESDAY, kind: "blocked" },
    ];

    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules: TUESDAY_09_TO_12,
      exceptions,
      busyIntervals: [],
      timing,
    });

    expect(slots).toEqual([]);
  });

  it("horário especial substitui as regras do dia", () => {
    const exceptions: AvailabilityException[] = [
      {
        date: TUESDAY,
        kind: "custom_hours",
        startsAtMinutes: 14 * 60,
        endsAtMinutes: 15 * 60,
      },
    ];

    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules: TUESDAY_09_TO_12,
      exceptions,
      busyIntervals: [],
      timing,
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-12-01T17:00:00.000Z",
    ]);
  });

  it("respeita a vigência das regras", () => {
    const rules = [
      rule(2, 9 * 60, 12 * 60, { validFrom: "2026-12-02" }),
      rule(2, 13 * 60, 14 * 60, { validUntil: "2026-11-30" }),
    ];

    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules,
      exceptions: [],
      busyIntervals: [],
      timing,
    });

    expect(slots).toEqual([]);
  });

  it("desconsidera regras inativas", () => {
    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules: [rule(2, 9 * 60, 12 * 60, { isActive: false })],
      exceptions: [],
      busyIntervals: [],
      timing,
    });

    expect(slots).toEqual([]);
  });

  it("combina múltiplos períodos e evita duplicar horários sobrepostos", () => {
    const rules = [rule(2, 9 * 60, 11 * 60), rule(2, 10 * 60, 12 * 60)];

    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules,
      exceptions: [],
      busyIntervals: [],
      timing,
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-12-01T12:00:00.000Z",
      "2026-12-01T13:00:00.000Z",
      "2026-12-01T14:00:00.000Z",
    ]);
  });

  it("não gera slot no passado nem antes da antecedência mínima", () => {
    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules: TUESDAY_09_TO_12,
      exceptions: [],
      busyIntervals: [],
      timing,
      now: date("2026-12-01T12:30:00.000Z"),
      minLeadMinutes: 60,
    });

    expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-12-01T14:00:00.000Z",
    ]);
  });

  it("sem janela suficiente para a duração não gera slots", () => {
    const slots = generateSlots({
      date: TUESDAY,
      timeZone: "America/Sao_Paulo",
      rules: [rule(2, 9 * 60, 9 * 60 + 30)],
      exceptions: [],
      busyIntervals: [],
      timing,
    });

    expect(slots).toEqual([]);
  });

  it("rejeita dados inválidos", () => {
    expect(() =>
      generateSlots({
        date: "31/12/2026",
        timeZone: "America/Sao_Paulo",
        rules: [],
        exceptions: [],
        busyIntervals: [],
        timing,
      }),
    ).toThrow(RangeError);

    expect(() =>
      generateSlots({
        date: TUESDAY,
        timeZone: "America/Sao_Paulo",
        rules: [],
        exceptions: [],
        busyIntervals: [],
        timing: { durationMinutes: 0, bufferMinutes: 0 },
      }),
    ).toThrow(RangeError);
  });
});
