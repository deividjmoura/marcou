"use client";

import { useActionState } from "react";
import {
  cancelOwnBookingAction,
  markProofReceivedAction,
  type ReservationActionState,
} from "./actions";

const initialState: ReservationActionState = {};

export function ReservationActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: string;
}) {
  const [proofState, proofAction, proofPending] = useActionState(
    markProofReceivedAction,
    initialState,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelOwnBookingAction,
    initialState,
  );

  const message = proofState.error ??
    cancelState.error ??
    proofState.success ??
    cancelState.success;

  return (
    <div className="reservation-actions">
      {message ? (
        <p
          className={
            proofState.error || cancelState.error
              ? "alert alert-error"
              : "alert alert-success"
          }
        >
          {message}
        </p>
      ) : null}

      {status === "pending_payment" ? (
        <form action={proofAction} className="form-stack">
          <input type="hidden" name="bookingId" value={bookingId} />
          <button type="submit" className="btn" disabled={proofPending}>
            {proofPending ? "Registrando..." : "Já enviei o comprovante"}
          </button>
        </form>
      ) : null}

      {status === "pending_payment" || status === "pending_review" ? (
        <form action={cancelAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <button type="submit" className="btn btn-ghost" disabled={cancelPending}>
            Cancelar agendamento
          </button>
        </form>
      ) : null}
    </div>
  );
}
