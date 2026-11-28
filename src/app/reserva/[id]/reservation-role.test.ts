import { describe, expect, it } from "vitest";
import {
  isReservationEvent,
  reservationActionsFor,
  reservationSuccessMessage,
  resolveReservationRole,
  type ReservationRole,
} from "./reservation-role";

const view = (role: ReservationRole, status: string) =>
  reservationActionsFor(role, status).map(({ event, label }) => `${event}:${label}`);

describe("resolveReservationRole", () => {
  it.each([
    [{ isCustomer: true, isOwner: false }, "customer"],
    [{ isCustomer: false, isOwner: true }, "owner"],
    // Dono que reservou o próprio serviço: a visão de dono contém a do cliente.
    [{ isCustomer: true, isOwner: true }, "owner"],
    // Terceiros: a página responde 404.
    [{ isCustomer: false, isOwner: false }, null],
  ])("%j → %s", (input, expected) => {
    expect(resolveReservationRole(input)).toBe(expected);
  });
});

describe("reservationActionsFor", () => {
  it.each<[ReservationRole, string, string[]]>([
    // Cliente: comportamento anterior preservado.
    ["customer", "pending_payment", [
      "proof_received:Já enviei o comprovante",
      "cancel:Cancelar agendamento",
    ]],
    ["customer", "pending_review", ["cancel:Cancelar agendamento"]],
    ["customer", "confirmed", []],
    // Dono: eventos/status do painel, rótulos explícitos e nenhum texto do cliente.
    ["owner", "pending_payment", [
      "proof_received:Marcar comprovante recebido",
      "cancel:Cancelar reserva do cliente",
    ]],
    ["owner", "pending_review", [
      "payment_approved:Confirmar pagamento",
      "cancel:Cancelar reserva do cliente",
    ]],
    ["owner", "confirmed", ["cancel:Cancelar reserva do cliente"]],
  ])("%s em %s", (role, status, expected) => {
    expect(view(role, status)).toEqual(expected);
  });

  it.each(["cancelled", "expired", "desconhecido"])(
    "nenhuma ação para nenhum papel em %s",
    (status) => {
      expect(reservationActionsFor("customer", status)).toEqual([]);
      expect(reservationActionsFor("owner", status)).toEqual([]);
    },
  );
});

describe("mensagens e eventos", () => {
  it("mensagens de sucesso dependem do papel", () => {
    expect(reservationSuccessMessage("customer", "proof_received")).toMatch(
      /Aguardando validação do prestador/,
    );
    expect(reservationSuccessMessage("owner", "proof_received")).not.toMatch(
      /Aguardando validação do prestador/,
    );
    expect(reservationSuccessMessage("owner", "cancel")).toMatch(/cliente/);
  });

  it("aceita apenas os eventos da página da reserva", () => {
    expect(["proof_received", "payment_approved", "cancel"].every(isReservationEvent)).toBe(true);
    expect([ "expire", "", null].some(isReservationEvent)).toBe(false);
  });
});
