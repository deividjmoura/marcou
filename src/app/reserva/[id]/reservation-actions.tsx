"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  reservationTransitionAction,
  type ReservationActionState,
} from "./actions";
import {
  reservationActionsFor,
  reservationSuccessMessage,
  type ReservationActionSpec,
  type ReservationRole,
} from "./reservation-role";

const initialState: ReservationActionState = {};

function SubmitButton({
  spec,
  disabled,
}: {
  spec: ReservationActionSpec;
  disabled: boolean;
}) {
  // Só o formulário enviado mostra o rótulo de progresso.
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={spec.variant === "primary" ? "btn" : "btn btn-ghost"}
      disabled={disabled || pending}
    >
      {pending ? spec.pendingLabel : spec.label}
    </button>
  );
}

export function ReservationActions({
  bookingId,
  status,
  role,
}: {
  bookingId: string;
  status: string;
  role: ReservationRole;
}) {
  const [state, action, pending] = useActionState(
    reservationTransitionAction,
    initialState,
  );

  const actions = reservationActionsFor(role, status);
  const success = state.completedEvent
    ? reservationSuccessMessage(role, state.completedEvent)
    : undefined;
  const message = state.error ?? success;

  return (
    <div className="reservation-actions">
      {message ? (
        <p className={state.error ? "alert alert-error" : "alert alert-success"}>
          {message}
        </p>
      ) : null}

      {actions.map((spec) => (
        <form
          key={spec.event}
          action={action}
          className={spec.variant === "primary" ? "form-stack" : undefined}
        >
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="event" value={spec.event} />
          <SubmitButton spec={spec} disabled={pending} />
        </form>
      ))}
    </div>
  );
}
