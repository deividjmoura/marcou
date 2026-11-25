/**
 * Rótulos e ações da página /reserva/[id] por papel.
 *
 * Isto controla APENAS a apresentação. A autorização continua no banco
 * (`transition_booking`): cliente e dono podem registrar comprovante e cancelar;
 * somente o dono aprova o pagamento. Mostrar ou esconder um botão aqui não
 * concede nem retira permissão.
 */

export type ReservationRole = "customer" | "owner";

export const RESERVATION_EVENTS = [
  "proof_received",
  "payment_approved",
  "cancel",
] as const;

export type ReservationEvent = (typeof RESERVATION_EVENTS)[number];

export interface ReservationActionSpec {
  event: ReservationEvent;
  label: string;
  pendingLabel: string;
  variant: "primary" | "ghost";
}

export function isReservationEvent(value: unknown): value is ReservationEvent {
  return (
    typeof value === "string" &&
    (RESERVATION_EVENTS as readonly string[]).includes(value)
  );
}

/**
 * Quem é o dono vê a visão de dono, mesmo que também seja o cliente da reserva
 * (por exemplo, ao testar o próprio negócio): a visão de dono contém todas as
 * ações que o cliente teria.
 */
export function resolveReservationRole({
  isCustomer,
  isOwner,
}: {
  isCustomer: boolean;
  isOwner: boolean;
}): ReservationRole | null {
  if (isOwner) return "owner";
  if (isCustomer) return "customer";
  return null;
}

const CUSTOMER_PROOF: ReservationActionSpec = {
  event: "proof_received",
  label: "Já enviei o comprovante",
  pendingLabel: "Registrando...",
  variant: "primary",
};

const CUSTOMER_CANCEL: ReservationActionSpec = {
  event: "cancel",
  label: "Cancelar agendamento",
  pendingLabel: "Cancelando...",
  variant: "ghost",
};

const OWNER_PROOF: ReservationActionSpec = {
  event: "proof_received",
  label: "Marcar comprovante recebido",
  pendingLabel: "Registrando...",
  variant: "primary",
};

const OWNER_APPROVE: ReservationActionSpec = {
  event: "payment_approved",
  label: "Confirmar pagamento",
  pendingLabel: "Confirmando...",
  variant: "primary",
};

const OWNER_CANCEL: ReservationActionSpec = {
  event: "cancel",
  label: "Cancelar reserva do cliente",
  pendingLabel: "Cancelando...",
  variant: "ghost",
};

/**
 * Cliente: mantém o comportamento anterior (comprovante enquanto aguarda
 * pagamento; cancelamento enquanto não confirmado).
 * Dono: mesmos eventos e status do painel (`src/app/painel/page.tsx`), com
 * rótulos mais explícitos para "marcar comprovante" e "cancelar".
 */
export function reservationActionsFor(
  role: ReservationRole,
  status: string,
): ReservationActionSpec[] {
  if (role === "customer") {
    if (status === "pending_payment") return [CUSTOMER_PROOF, CUSTOMER_CANCEL];
    if (status === "pending_review") return [CUSTOMER_CANCEL];
    return [];
  }

  if (status === "pending_payment") return [OWNER_PROOF, OWNER_CANCEL];
  if (status === "pending_review") return [OWNER_APPROVE, OWNER_CANCEL];
  if (status === "confirmed") return [OWNER_CANCEL];
  return [];
}

const SUCCESS_MESSAGES: Record<ReservationRole, Record<ReservationEvent, string>> = {
  customer: {
    proof_received: "Comprovante registrado. Aguardando validação do prestador.",
    payment_approved: "Pagamento confirmado.",
    cancel: "Agendamento cancelado.",
  },
  owner: {
    proof_received:
      "Comprovante marcado como recebido. Confirme o pagamento para garantir o horário.",
    payment_approved: "Pagamento confirmado. O agendamento está garantido.",
    cancel: "Reserva do cliente cancelada. O horário foi liberado.",
  },
};

export function reservationSuccessMessage(
  role: ReservationRole,
  event: ReservationEvent,
): string {
  return SUCCESS_MESSAGES[role][event];
}

const FALLBACK_ERRORS: Record<ReservationEvent, string> = {
  proof_received: "Não foi possível registrar o comprovante.",
  payment_approved: "Não foi possível confirmar o pagamento.",
  cancel: "Não foi possível cancelar o agendamento.",
};

export function reservationFallbackError(event: ReservationEvent): string {
  return FALLBACK_ERRORS[event];
}
