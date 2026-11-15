/** Conversões entre horário local (minutos desde a meia-noite) e texto. */

export function timeStringToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) {
    throw new RangeError(`Horário inválido: "${value}". Use HH:MM.`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new RangeError(`Horário inválido: "${value}".`);
  }
  return hours * 60 + minutes;
}

export function minutesToTimeString(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const rest = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function todayIsoDate(timeZone?: string): string {
  if (!timeZone) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDaysIsoDate(isoDate: string, days: number): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`Data inválida: "${isoDate}".`);
  }
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
