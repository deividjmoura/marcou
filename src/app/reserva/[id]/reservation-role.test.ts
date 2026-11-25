import { describe, expect, it } from "vitest";
import {
  isReservationEvent,
  reservationActionsFor,
  reservationSuccessMessage,
  resolveReservationRole,
} from "./reservation-role";

const labels = (role: "customer" | "owner", status: string) =>
  reservationActionsFor(role, status).map((action) => action.label);

const events = (role: "customer" | "owner", status: string) =>
  reservationActionsFor(role, status).map((action) => action.event);

describe("resolveReservationRole", () => {
  it("identifica cliente e dono", () => {
    expect(resolveReservationRole({ isCustomer: true, isOwner: false })).toBe("customer");
    expect(resolveReservationRole({ isCustomer: false, isOwner: true })).toBe("owner");
  });

  it("prioriza a visão de dono quando o usuário é cliente e dono", () => {
    expect(resolveReservationRole({ isCustomer: true, isOwner: true })).toBe("owner");
  });

  it("retorna null para terceiros (a página responde 404)", () => {
    expect(resolveReservationRole({ isCustomer: false, isOwner: false })).toBeNull();
  });
});

describe("reservationActionsFor: cliente", () => {
  it("aguardando pagamento: enviar comprovante ou cancelar", () => {
    expect(labels("customer", "pending_payment")).toEqual([
      "Já enviei o comprovante",
      "Cancelar agendamento",
    ]);
  });

  it("em análise: apenas cancelar", () => {
    expect(labels("customer", "pending_review")).toEqual(["Cancelar agendamento"]);
  });

  it("nunca recebe a ação de aprovar pagamento", () => {
    for (const status of ["pending_payment", "pending_review", "confirmed"]) {
      expect(events("customer", status)).not.toContain("payment_approved");
    }
  });

  it.each(["confirmed", "cancelled", "expired", "desconhecido"])(
    "sem ações em %s",
    (status) => {
      expect(reservationActionsFor("customer", status)).toEqual([]);
    },
  );
});

describe("reservationActionsFor: dono", () => {
  it("não vê rótulos escritos para o cliente", () => {
    for (const status of ["pending_payment", "pending_review", "confirmed"]) {
      expect(labels("owner", status)).not.toContain("Já enviei o comprovante");
      expect(labels("owner", status)).not.toContain("Cancelar agendamento");
    }
  });

  it("aguardando pagamento: marcar comprovante recebido ou cancelar a reserva", () => {
    expect(labels("owner", "pending_payment")).toEqual([
      "Marcar comprovante recebido",
      "Cancelar reserva do cliente",
    ]);
    expect(events("owner", "pending_payment")).toEqual(["proof_received", "cancel"]);
  });

  it("em análise: confirmar pagamento ou cancelar", () => {
    expect(labels("owner", "pending_review")).toEqual([
      "Confirmar pagamento",
      "Cancelar reserva do cliente",
    ]);
    expect(events("owner", "pending_review")).toEqual(["payment_approved", "cancel"]);
  });

  it("confirmado: pode cancelar, como no painel", () => {
    expect(events("owner", "confirmed")).toEqual(["cancel"]);
  });

  it.each(["cancelled", "expired", "desconhecido"])("sem ações em %s", (status) => {
    expect(reservationActionsFor("owner", status)).toEqual([]);
  });
});

describe("reservationSuccessMessage", () => {
  it("usa mensagens diferentes por papel", () => {
    expect(reservationSuccessMessage("customer", "proof_received")).toMatch(
      /Aguardando validação do prestador/,
    );
    expect(reservationSuccessMessage("owner", "proof_received")).not.toMatch(
      /Aguardando validação do prestador/,
    );
    expect(reservationSuccessMessage("owner", "cancel")).toMatch(/cliente/);
    expect(reservationSuccessMessage("customer", "cancel")).toBe("Agendamento cancelado.");
  });
});

describe("isReservationEvent", () => {
  it("aceita apenas os eventos da página da reserva", () => {
    expect(isReservationEvent("proof_received")).toBe(true);
    expect(isReservationEvent("payment_approved")).toBe(true);
    expect(isReservationEvent("cancel")).toBe(true);
    expect(isReservationEvent("expire")).toBe(false);
    expect(isReservationEvent("")).toBe(false);
    expect(isReservationEvent(null)).toBe(false);
  });
});
