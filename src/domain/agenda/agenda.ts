/**
 * Regras puras da agenda do prestador (Issue #24).
 *
 * Filtro por período, busca textual e agrupamento por dia local vivem aqui, sem
 * React e sem acesso a dados, para serem testáveis de forma determinística.
 * O instante de referência (`now`) é sempre informado pelo chamador: nenhuma
 * função lê o relógio, evitando divergência entre servidor e cliente.
 */

export type AgendaPeriod = "upcoming" | "past" | "all";

export interface AgendaBooking {
  starts_at: string;
  timezone: string;
  customer_name: string;
  customer_phone: string;
  service_name_snapshot: string;
}

export interface AgendaFilters {
  period: AgendaPeriod;
  search: string;
  now: number;
}

export interface AgendaDayGroup<T extends AgendaBooking> {
  /** Data local do prestador no formato `YYYY-MM-DD`. */
  date: string;
  /** Instante de referência usado no agrupamento (primeiro item do dia). */
  referenceStartsAt: string;
  timezone: string;
  bookings: T[];
}

/**
 * Normaliza texto para busca: remove acentos, colapsa espaços e aplica caixa
 * baixa em `pt-BR`, de modo que "José" seja encontrado por "jose".
 */
export function normalizeAgendaText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/** Somente dígitos, para casar telefone digitado com telefone formatado. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function matchesSearch(booking: AgendaBooking, search: string): boolean {
  const haystacks = [
    normalizeAgendaText(booking.customer_name),
    normalizeAgendaText(booking.service_name_snapshot),
  ];
  if (haystacks.some((value) => value.includes(search))) return true;

  const digits = onlyDigits(search);
  return digits.length > 0 && onlyDigits(booking.customer_phone).includes(digits);
}

/**
 * Data local (`YYYY-MM-DD`) do agendamento no fuso IANA do prestador.
 * Lança quando o fuso é inválido, para não agrupar datas erradas em silêncio.
 */
export function agendaLocalDateKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const values: Record<string, string> = {};
  for (const part of parts) values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Aplica busca e período e devolve nova lista ordenada.
 * - `upcoming`: `starts_at >= now`, ordem crescente;
 * - `past`: `starts_at < now`, ordem decrescente (mais recente primeiro);
 * - `all`: tudo, ordem crescente.
 * O array recebido não é mutado.
 */
export function filterAgendaBookings<T extends AgendaBooking>(
  bookings: readonly T[],
  { period, search, now }: AgendaFilters,
): T[] {
  const normalized = normalizeAgendaText(search);

  const filtered = bookings.filter((booking) => {
    const start = Date.parse(booking.starts_at);
    if (Number.isNaN(start)) return false;
    if (period === "upcoming" && start < now) return false;
    if (period === "past" && start >= now) return false;
    if (!normalized) return true;
    return matchesSearch(booking, normalized);
  });

  const sorted = [...filtered].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  return period === "past" ? sorted.reverse() : sorted;
}

/**
 * Agrupa agendamentos por dia local do prestador, preservando a ordem recebida.
 * A chave usa o fuso de cada agendamento, então dois eventos no mesmo dia local
 * do prestador caem no mesmo grupo mesmo quando o ISO em UTC é de outro dia.
 */
export function groupAgendaByLocalDate<T extends AgendaBooking>(
  bookings: readonly T[],
): AgendaDayGroup<T>[] {
  const groups = new Map<string, AgendaDayGroup<T>>();

  for (const booking of bookings) {
    const date = agendaLocalDateKey(booking.starts_at, booking.timezone);
    const existing = groups.get(date);
    if (existing) {
      existing.bookings.push(booking);
      continue;
    }
    groups.set(date, {
      date,
      referenceStartsAt: booking.starts_at,
      timezone: booking.timezone,
      bookings: [booking],
    });
  }

  return [...groups.values()];
}
