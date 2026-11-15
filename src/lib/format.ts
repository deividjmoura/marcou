export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatInstantInZone(
  iso: string,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    ...options,
  });
  return formatter.format(new Date(iso));
}

export function formatBookingDate(iso: string, timeZone: string): string {
  return formatInstantInZone(iso, timeZone, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function formatBookingTime(iso: string, timeZone: string): string {
  return formatInstantInZone(iso, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending_payment: "Aguardando pagamento",
  pending_review: "Aguardando validação",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

export const BOOKING_STATUS_CLASSES: Record<string, string> = {
  pending_payment: "status-pending",
  pending_review: "status-review",
  confirmed: "status-confirmed",
  cancelled: "status-cancelled",
  expired: "status-expired",
};
