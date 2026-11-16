import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { timeStringToMinutes } from "@/lib/time";
import {
  generateSlots,
  localToUtc,
  type AvailabilityException,
  type AvailabilityRule,
  type BusyInterval,
  type ServiceTiming,
  type Slot,
} from "@/domain/bookings/availability";

export type BookingStatus =
  | "pending_payment"
  | "pending_review"
  | "confirmed"
  | "cancelled"
  | "expired";

export interface Provider {
  id: string;
  owner_id: string;
  slug: string;
  display_name: string;
  timezone: string;
  is_published: boolean;
  booking_hold_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  deposit_cents: number;
  buffer_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityRuleRow {
  id: string;
  provider_id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AvailabilityExceptionRow {
  id: string;
  provider_id: string;
  exception_date: string;
  kind: "blocked" | "custom_hours";
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
  created_at: string;
}

export interface Booking {
  id: string;
  provider_id: string;
  customer_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  occupied_until: string;
  timezone: string;
  customer_name: string;
  customer_phone: string;
  service_name_snapshot: string;
  duration_minutes_snapshot: number;
  price_cents_snapshot: number;
  deposit_cents_snapshot: number;
  buffer_minutes_snapshot: number;
  status: BookingStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingEventName =
  | "proof_received"
  | "payment_approved"
  | "cancel"
  | "expire";

export class BookingOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BookingOperationError";
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "Faça login para continuar.",
  provider_not_found: "Estabelecimento não encontrado.",
  provider_not_published: "Este estabelecimento ainda não está publicado.",
  service_not_available: "Serviço indisponível.",
  slot_in_the_past: "Escolha um horário futuro.",
  outside_working_hours: "O horário está fora da disponibilidade do prestador.",
  slot_unavailable: "Este horário acabou de ser reservado. Escolha outro.",
  booking_not_found: "Agendamento não encontrado.",
  forbidden: "Você não tem permissão para esta ação.",
  invalid_transition: "Transição de estado não permitida.",
  invalid_event: "Evento inválido.",
  booking_expired: "A reserva expirou. Escolha outro horário.",
  customer_name_required: "Informe seu nome para concluir a reserva.",
};

function toOperationError(error: {
  code?: string | null;
  message?: string | null;
}): BookingOperationError {
  const message = error.message ?? "";
  const translated = ERROR_MESSAGES[message];
  return new BookingOperationError(
    error.code ?? "unknown",
    translated ?? message ?? "Não foi possível concluir a operação.",
  );
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Exige autenticação; usado por páginas do painel e do cliente. */
export async function requireUser(next?: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(next ?? "/login");
  }
  return user;
}

export async function getProvider(slug: string): Promise<Provider | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return data as Provider;
}

export async function getProviderById(id: string): Promise<Provider | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Provider;
}

export async function getOwnedProvider(ownerId: string): Promise<Provider | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Provider;
}

export async function listActiveServices(providerId: string): Promise<Service[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) return [];
  return (data ?? []) as Service[];
}

export interface ScheduleData {
  timezone: string;
  bookingHoldMinutes: number;
  rules: AvailabilityRule[];
  exceptions: AvailabilityException[];
  busy: BusyInterval[];
  /**
   * Duração e intervalo já vêm da RPC `get_provider_schedule`, que resolve o
   * serviço no mesmo instante em que monta a agenda. Isso evita que a
   * projeção exibida use uma segunda leitura que pode divergir da validação.
   */
  timing: ServiceTiming;
}

/** Lê a agenda pública (RPC) de um prestador publicado. */
export async function getProviderSchedule(params: {
  slug: string;
  serviceId: string;
  date: string;
}): Promise<ScheduleData | null> {
  const provider = await getProvider(params.slug);
  if (!provider) return null;

  const from = localToUtc(params.date, 0, provider.timezone);
  const to = localToUtc(params.date, 24 * 60, provider.timezone);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_provider_schedule", {
    p_provider_slug: params.slug,
    p_service_id: params.serviceId,
    p_date: params.date,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  if (error || !data) return null;

  const rules: AvailabilityRule[] = (data.rules ?? []).map(
    (rule: Record<string, unknown>) => ({
      dayOfWeek: Number(rule.dayOfWeek),
      startsAtMinutes: Number(rule.startsAtMinutes),
      endsAtMinutes: Number(rule.endsAtMinutes),
      validFrom: (rule.validFrom as string | null) ?? null,
      validUntil: (rule.validUntil as string | null) ?? null,
      isActive: Boolean(rule.isActive),
    }),
  );

  const exceptions: AvailabilityException[] = (data.exceptions ?? []).map(
    (exception: Record<string, unknown>) => ({
      date: String(exception.date),
      kind: exception.kind as "blocked" | "custom_hours",
      startsAtMinutes:
        exception.startsAtMinutes === null
          ? null
          : Number(exception.startsAtMinutes),
      endsAtMinutes:
        exception.endsAtMinutes === null
          ? null
          : Number(exception.endsAtMinutes),
    }),
  );

  const busy: BusyInterval[] = (data.busy ?? []).map(
    (interval: Record<string, unknown>) => ({
      startsAt: new Date(String(interval.startsAt)),
      occupiedUntil: new Date(String(interval.occupiedUntil)),
    }),
  );

  const timing = (data.timing ?? {}) as Record<string, unknown>;

  return {
    timezone: String(data.timezone),
    bookingHoldMinutes: Number(data.bookingHoldMinutes),
    rules,
    exceptions,
    busy,
    timing: {
      durationMinutes: Number(timing.durationMinutes),
      bufferMinutes: Number(timing.bufferMinutes),
    },
  };
}

export interface SlotPayload {
  startsAt: string;
  occupiedUntil: string;
  label: string;
}

/** Slots disponíveis de um serviço em uma data, já filtrados contra agora. */
export async function getAvailableSlots(params: {
  slug: string;
  serviceId: string;
  date: string;
  minLeadMinutes?: number;
}): Promise<SlotPayload[] | null> {
  const schedule = await getProviderSchedule(params);
  if (!schedule) return null;

  const slots: Slot[] = generateSlots({
    date: params.date,
    timeZone: schedule.timezone,
    rules: schedule.rules,
    exceptions: schedule.exceptions,
    busyIntervals: schedule.busy,
    timing: schedule.timing,
    minLeadMinutes: params.minLeadMinutes ?? 0,
  });

  return slots.map((slot) => ({
    startsAt: slot.startsAt.toISOString(),
    occupiedUntil: slot.occupiedUntil.toISOString(),
    label: slot.startsAt.toISOString(),
  }));
}

export async function createBooking(params: {
  slug: string;
  serviceId: string;
  startsAt: string;
  customerName: string;
  customerPhone: string;
}): Promise<Booking> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_booking", {
    p_provider_slug: params.slug,
    p_service_id: params.serviceId,
    p_starts_at: params.startsAt,
    p_customer_name: params.customerName,
    p_customer_phone: params.customerPhone,
    p_idempotency_key: crypto.randomUUID(),
  });

  if (error) throw toOperationError(error);
  return data as Booking;
}

export async function transitionBooking(params: {
  bookingId: string;
  event: BookingEventName;
  idempotencyKey?: string;
}): Promise<Booking> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transition_booking", {
    p_booking_id: params.bookingId,
    p_event: params.event,
    p_idempotency_key:
      params.idempotencyKey ?? `${params.bookingId}:${params.event}`,
  });

  if (error) throw toOperationError(error);

  const booking = data as Booking;
  if (params.event !== "expire" && booking.status === "expired") {
    throw new BookingOperationError(
      "booking_expired",
      ERROR_MESSAGES.booking_expired,
    );
  }
  return booking;
}

export async function listProviderBookings(
  providerId: string,
): Promise<Booking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("provider_id", providerId)
    .order("starts_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as Booking[];
}

export async function listCustomerBookings(): Promise<Booking[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("customer_id", user.id)
    .order("starts_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as Booking[];
}

export async function getBooking(id: string): Promise<Booking | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Booking;
}

export { formatCents } from "@/lib/format";

export function timeStringToLabel(value: string): string {
  return value.slice(0, 5);
}

export { timeStringToMinutes };
