"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import {
  BookingOperationError,
  getCurrentUser,
  transitionBooking,
} from "@/server/bookings";
import {
  isReservationEvent,
  reservationFallbackError,
  type ReservationEvent,
} from "./reservation-role";

export interface ReservationActionState {
  error?: string;
  /** Evento aplicado com sucesso; o cliente escolhe a mensagem pelo papel. */
  completedEvent?: ReservationEvent;
}

const SUPABASE_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

/**
 * Aplica uma transição solicitada pela página da reserva. O papel exibido na
 * interface não é confiado aqui: `transition_booking` verifica no banco se o
 * usuário autenticado é cliente ou dono e se o evento é permitido.
 */
export async function reservationTransitionAction(
  _prev: ReservationActionState,
  formData: FormData,
): Promise<ReservationActionState> {
  if (!isSupabaseConfigured()) return { error: SUPABASE_UNAVAILABLE_MESSAGE };

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bookingId = String(formData.get("bookingId") ?? "");
  const event = formData.get("event");

  if (!bookingId || !isReservationEvent(event)) {
    return { error: "Ação inválida para esta reserva." };
  }

  try {
    await transitionBooking({ bookingId, event });
  } catch (error) {
    if (error instanceof BookingOperationError) {
      return { error: error.message };
    }
    return { error: reservationFallbackError(event) };
  }

  revalidatePath(`/reserva/${bookingId}`);
  return { completedEvent: event };
}
