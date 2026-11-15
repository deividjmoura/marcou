import { DateTime } from "luxon";
import { intervalsOverlap, type BookingInterval } from "./booking";

/**
 * Regra de expediente semanal de um prestador.
 * Os minutos são contados a partir da meia-noite no fuso do prestador.
 */
export interface AvailabilityRule {
  /** 0 = domingo, 6 = sábado. */
  dayOfWeek: number;
  startsAtMinutes: number;
  endsAtMinutes: number;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive: boolean;
}

/** Exceção pontual por data: bloqueio do dia ou horário especial. */
export interface AvailabilityException {
  /** Data no formato `yyyy-mm-dd`, no fuso do prestador. */
  date: string;
  kind: "blocked" | "custom_hours";
  startsAtMinutes?: number | null;
  endsAtMinutes?: number | null;
}

/** Intervalo já ocupado por reserva, bloqueio ou evento importado. */
export interface BusyInterval {
  startsAt: Date;
  occupiedUntil: Date;
}

/** Duração e intervalo do serviço no momento da reserva. */
export interface ServiceTiming {
  durationMinutes: number;
  bufferMinutes: number;
}

/** Slot candidato: início escolhido pelo cliente e fim do período ocupado. */
export interface Slot {
  startsAt: Date;
  occupiedUntil: Date;
}

export interface SlotQuery {
  /** Data no formato `yyyy-mm-dd`, no fuso do prestador. */
  date: string;
  timeZone: string;
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  busyIntervals: BusyInterval[];
  timing: ServiceTiming;
  /** Instante de referência; padrão: agora. */
  now?: Date;
  /** Espaçamento entre candidatos; padrão: duração + intervalo. */
  stepMinutes?: number;
  /** Antecedência mínima do slot em relação a `now`; padrão: 0. */
  minLeadMinutes?: number;
}

function parseLocalDate(date: string, timeZone: string): DateTime {
  const parsed = DateTime.fromISO(date, { zone: timeZone });
  if (!parsed.isValid) {
    throw new RangeError(`A data "${date}" é inválida. Use yyyy-mm-dd.`);
  }
  return parsed.startOf("day");
}

function assertValidTiming(timing: ServiceTiming) {
  if (!Number.isInteger(timing.durationMinutes) || timing.durationMinutes <= 0) {
    throw new RangeError("A duração do serviço deve ser um inteiro maior que zero.");
  }
  if (
    !Number.isInteger(timing.bufferMinutes) ||
    timing.bufferMinutes < 0
  ) {
    throw new RangeError("O intervalo do serviço deve ser um inteiro não negativo.");
  }
}

/** Converte um instante local (data + minutos) para UTC no fuso do prestador. */
export function localToUtc(
  date: string,
  minutes: number,
  timeZone: string,
): Date {
  return parseLocalDate(date, timeZone).plus({ minutes }).toUTC().toJSDate();
}

function dayOfWeekFor(date: string, timeZone: string): number {
  // luxon: segunda = 1 ... domingo = 7. Converter para 0 = domingo.
  return parseLocalDate(date, timeZone).weekday % 7;
}

function isRuleActiveOn(rule: AvailabilityRule, date: string): boolean {
  if (!rule.isActive) return false;
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validUntil && date > rule.validUntil) return false;
  return true;
}

function windowsForDate(
  date: string,
  timeZone: string,
  rules: AvailabilityRule[],
  exceptions: AvailabilityException[],
): Array<{ startsAtMinutes: number; endsAtMinutes: number }> {
  const dayExceptions = exceptions.filter((exception) => exception.date === date);

  const customHours = dayExceptions.find(
    (exception) => exception.kind === "custom_hours",
  );
  if (customHours) {
    if (
      customHours.startsAtMinutes === null ||
      customHours.startsAtMinutes === undefined ||
      customHours.endsAtMinutes === null ||
      customHours.endsAtMinutes === undefined
    ) {
      throw new RangeError(
        "Exceção de horário especial precisa de início e fim.",
      );
    }
    return [
      {
        startsAtMinutes: customHours.startsAtMinutes,
        endsAtMinutes: customHours.endsAtMinutes,
      },
    ];
  }

  if (dayExceptions.some((exception) => exception.kind === "blocked")) {
    return [];
  }

  const day = dayOfWeekFor(date, timeZone);
  return rules
    .filter((rule) => rule.dayOfWeek === day && isRuleActiveOn(rule, date))
    .map((rule) => ({
      startsAtMinutes: rule.startsAtMinutes,
      endsAtMinutes: rule.endsAtMinutes,
    }));
}

function mergeWindows(
  windows: Array<{ startsAtMinutes: number; endsAtMinutes: number }>,
): Array<{ startsAtMinutes: number; endsAtMinutes: number }> {
  const sorted = [...windows].sort(
    (a, b) => a.startsAtMinutes - b.startsAtMinutes,
  );
  const merged: Array<{ startsAtMinutes: number; endsAtMinutes: number }> = [];

  for (const window of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && window.startsAtMinutes <= previous.endsAtMinutes) {
      previous.endsAtMinutes = Math.max(
        previous.endsAtMinutes,
        window.endsAtMinutes,
      );
    } else {
      merged.push({ ...window });
    }
  }

  return merged;
}

/**
 * Calcula os slots disponíveis de um serviço em uma data, considerando
 * expediente, exceções, duração, intervalo e reservas já existentes.
 *
 * A checagem final de conflito deve acontecer no banco, de forma atômica;
 * esta função é a projeção usada na interface e nos testes de domínio.
 */
export function generateSlots(query: SlotQuery): Slot[] {
  const { date, timeZone, timing } = query;
  parseLocalDate(date, timeZone);
  assertValidTiming(timing);

  const now = query.now ?? new Date();
  const step =
    query.stepMinutes ?? timing.durationMinutes + timing.bufferMinutes;
  if (!Number.isInteger(step) || step <= 0) {
    throw new RangeError("O espaçamento entre slots deve ser maior que zero.");
  }

  const minLead = query.minLeadMinutes ?? 0;
  if (!Number.isInteger(minLead) || minLead < 0) {
    throw new RangeError("A antecedência mínima deve ser não negativa.");
  }

  const earliestStartUtc = new Date(now.getTime() + minLead * 60_000);
  const occupiedMinutes = timing.durationMinutes + timing.bufferMinutes;

  const windows = mergeWindows(
    windowsForDate(date, timeZone, query.rules, query.exceptions),
  );

  const slots: Slot[] = [];
  const seen = new Set<number>();

  for (const window of windows) {
    for (
      let minutes = window.startsAtMinutes;
      minutes + occupiedMinutes <= window.endsAtMinutes;
      minutes += step
    ) {
      const startsAt = localToUtc(date, minutes, timeZone);
      const occupiedUntil = new Date(
        startsAt.getTime() + occupiedMinutes * 60_000,
      );

      const candidate: BookingInterval = { startsAt, occupiedUntil };

      if (startsAt < earliestStartUtc) continue;

      const conflicts = query.busyIntervals.some((busy) =>
        intervalsOverlap(candidate, busy),
      );
      if (conflicts) continue;

      const key = startsAt.getTime();
      if (seen.has(key)) continue;
      seen.add(key);

      slots.push({ startsAt, occupiedUntil });
    }
  }

  return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
