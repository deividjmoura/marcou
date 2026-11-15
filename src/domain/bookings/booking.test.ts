import { describe, expect, it } from "vitest";
import {
  BookingTransitionError,
  bookingOccupiesTime,
  intervalsOverlap,
  transitionBooking,
  type BookingRecord,
} from "./booking";

const date = (value: string) => new Date(value);

const pendingBooking = (overrides: Partial<BookingRecord> = {}): BookingRecord => ({
  startsAt: date("2026-12-01T12:00:00.000Z"),
  occupiedUntil: date("2026-12-01T13:00:00.000Z"),
  status: "pending_payment",
  expiresAt: date("2026-12-01T11:30:00.000Z"),
  ...overrides,
});

describe("intervalsOverlap", () => {
  it("detecta sobreposição parcial", () => {
    expect(
      intervalsOverlap(
        { startsAt: date("2026-12-01T12:00:00Z"), occupiedUntil: date("2026-12-01T13:00:00Z") },
        { startsAt: date("2026-12-01T12:30:00Z"), occupiedUntil: date("2026-12-01T13:30:00Z") },
      ),
    ).toBe(true);
  });

  it("aceita intervalos adjacentes", () => {
    expect(
      intervalsOverlap(
        { startsAt: date("2026-12-01T12:00:00Z"), occupiedUntil: date("2026-12-01T13:00:00Z") },
        { startsAt: date("2026-12-01T13:00:00Z"), occupiedUntil: date("2026-12-01T14:00:00Z") },
      ),
    ).toBe(false);
  });

  it("rejeita intervalos inválidos", () => {
    expect(() =>
      intervalsOverlap(
        { startsAt: date("2026-12-01T13:00:00Z"), occupiedUntil: date("2026-12-01T12:00:00Z") },
        { startsAt: date("2026-12-01T12:00:00Z"), occupiedUntil: date("2026-12-01T14:00:00Z") },
      ),
    ).toThrow(RangeError);
  });
});

describe("bookingOccupiesTime", () => {
  it("mantém reserva pendente ocupando o horário enquanto válida", () => {
    expect(
      bookingOccupiesTime(pendingBooking(), date("2026-12-01T11:00:00Z")),
    ).toBe(true);
  });

  it("não considera reserva pendente vencida como ocupante", () => {
    expect(
      bookingOccupiesTime(pendingBooking(), date("2026-12-01T12:00:00Z")),
    ).toBe(false);
  });

  it("mantém agendamento confirmado ocupando o horário", () => {
    expect(
      bookingOccupiesTime(
        pendingBooking({ status: "confirmed", expiresAt: null }),
        date("2026-12-01T14:00:00Z"),
      ),
    ).toBe(true);
  });

  it("reserva em revisão ocupa o horário enquanto válida", () => {
    expect(
      bookingOccupiesTime(
        pendingBooking({ status: "pending_review" }),
        date("2026-12-01T11:00:00Z"),
      ),
    ).toBe(true);
  });

  it("reserva em revisão vencida não ocupa o horário", () => {
    expect(
      bookingOccupiesTime(
        pendingBooking({ status: "pending_review" }),
        date("2026-12-01T12:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("transitionBooking", () => {
  it("receber comprovante leva para revisão, nunca para confirmado", () => {
    const next = transitionBooking(
      pendingBooking(),
      "proof_received",
      date("2026-12-01T11:00:00Z"),
    );
    expect(next.status).toBe("pending_review");
  });

  it("aprovação válida confirma a reserva em revisão", () => {
    const next = transitionBooking(
      pendingBooking({ status: "pending_review" }),
      "payment_approved",
      date("2026-12-01T11:00:00Z"),
    );
    expect(next.status).toBe("confirmed");
    expect(next.expiresAt).toBeNull();
  });

  it("não confirma reserva vencida", () => {
    expect(() =>
      transitionBooking(
        pendingBooking({ status: "pending_review" }),
        "payment_approved",
        date("2026-12-01T12:00:00Z"),
      ),
    ).toThrow(BookingTransitionError);
  });

  it("não reativa reserva expirada", () => {
    expect(() =>
      transitionBooking(
        pendingBooking({ status: "expired" }),
        "payment_approved",
        date("2026-12-01T11:00:00Z"),
      ),
    ).toThrow(BookingTransitionError);
  });

  it("expira reserva pendente somente após o prazo", () => {
    const next = transitionBooking(
      pendingBooking(),
      "expire",
      date("2026-12-01T12:00:00Z"),
    );
    expect(next.status).toBe("expired");
  });

  it("expira reserva em revisão após o prazo", () => {
    const next = transitionBooking(
      pendingBooking({ status: "pending_review" }),
      "expire",
      date("2026-12-01T12:00:00Z"),
    );
    expect(next.status).toBe("expired");
  });

  it("não expira reserva confirmada", () => {
    expect(() =>
      transitionBooking(
        pendingBooking({ status: "confirmed", expiresAt: null }),
        "expire",
        date("2026-12-01T12:00:00Z"),
      ),
    ).toThrow(BookingTransitionError);
  });

  it("não aprova pagamento diretamente a partir de pendente de pagamento", () => {
    expect(() =>
      transitionBooking(
        pendingBooking(),
        "payment_approved",
        date("2026-12-01T11:00:00Z"),
      ),
    ).toThrow(BookingTransitionError);
  });

  it("não registra comprovante em reserva já em revisão", () => {
    expect(() =>
      transitionBooking(
        pendingBooking({ status: "pending_review" }),
        "proof_received",
        date("2026-12-01T11:00:00Z"),
      ),
    ).toThrow(BookingTransitionError);
  });

  it("cancelamento libera o horário em qualquer estado ativo", () => {
    for (const status of [
      "pending_payment",
      "pending_review",
      "confirmed",
    ] as const) {
      const next = transitionBooking(
        pendingBooking({ status, expiresAt: null }),
        "cancel",
        date("2026-12-01T11:00:00Z"),
      );
      expect(next.status).toBe("cancelled");
    }
  });

  it("não reativa reserva cancelada", () => {
    expect(() =>
      transitionBooking(
        pendingBooking({ status: "cancelled", expiresAt: null }),
        "cancel",
        date("2026-12-01T11:00:00Z"),
      ),
    ).toThrow(BookingTransitionError);
  });
});
