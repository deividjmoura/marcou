export type BookingStatus =
  | "pending_payment"
  | "pending_review"
  | "confirmed"
  | "cancelled"
  | "expired";

export interface BookingInterval {
  startsAt: Date;
  occupiedUntil: Date;
}

export interface BookingRecord extends BookingInterval {
  status: BookingStatus;
  expiresAt: Date | null;
}

export type BookingEvent =
  | "proof_received"
  | "payment_approved"
  | "cancel"
  | "expire";

export class BookingTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingTransitionError";
  }
}

function assertValidInterval(interval: BookingInterval) {
  if (
    Number.isNaN(interval.startsAt.getTime()) ||
    Number.isNaN(interval.occupiedUntil.getTime()) ||
    interval.startsAt >= interval.occupiedUntil
  ) {
    throw new RangeError("O intervalo do agendamento é inválido.");
  }
}

/** Intervalos semiabertos: um compromisso pode começar quando o anterior termina. */
export function intervalsOverlap(
  first: BookingInterval,
  second: BookingInterval,
): boolean {
  assertValidInterval(first);
  assertValidInterval(second);

  return (
    first.startsAt < second.occupiedUntil &&
    second.startsAt < first.occupiedUntil
  );
}

export function bookingOccupiesTime(
  booking: BookingRecord,
  now: Date = new Date(),
): boolean {
  if (booking.status === "confirmed") return true;
  if (booking.status === "cancelled" || booking.status === "expired") {
    return false;
  }

  return booking.expiresAt !== null && booking.expiresAt > now;
}

/**
 * Pure domain transition. Persistence, authorization and atomic conflict checks
 * must be enforced by the server/database before committing the new state.
 */
export function transitionBooking(
  booking: BookingRecord,
  event: BookingEvent,
  now: Date = new Date(),
): BookingRecord {
  if (booking.status === "cancelled" || booking.status === "expired") {
    throw new BookingTransitionError(
      "Agendamentos cancelados ou expirados não podem ser reativados.",
    );
  }

  if (
    booking.status !== "confirmed" &&
    booking.expiresAt !== null &&
    booking.expiresAt <= now &&
    event !== "expire"
  ) {
    throw new BookingTransitionError(
      "A reserva expirou e precisa ser encerrada antes de qualquer confirmação.",
    );
  }

  if (event === "cancel") {
    return { ...booking, status: "cancelled" };
  }

  if (event === "expire") {
    if (
      (booking.status !== "pending_payment" &&
        booking.status !== "pending_review") ||
      booking.expiresAt === null ||
      booking.expiresAt > now
    ) {
      throw new BookingTransitionError(
        "Somente reservas pendentes vencidas podem expirar.",
      );
    }

    return { ...booking, status: "expired" };
  }

  if (event === "proof_received" && booking.status === "pending_payment") {
    return { ...booking, status: "pending_review" };
  }

  if (event === "payment_approved" && booking.status === "pending_review") {
    return { ...booking, status: "confirmed", expiresAt: null };
  }

  throw new BookingTransitionError(
    `Evento "${event}" não permitido no estado "${booking.status}".`,
  );
}
