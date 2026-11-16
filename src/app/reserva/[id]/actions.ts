"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import {
  BookingOperationError,
  getCurrentUser,
  transitionBooking,
} from "@/server/bookings";

export interface ReservationActionState {
  error?: string;
  success?: string;
}

const SUPABASE_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

export async function markProofReceivedAction(
  _prev: ReservationActionState,
  formData: FormData,
): Promise<ReservationActionState> {
  if (!isSupabaseConfigured()) return { error: SUPABASE_UNAVAILABLE_MESSAGE };

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bookingId = String(formData.get("bookingId") ?? "");

  try {
    await transitionBooking({ bookingId, event: "proof_received" });
  } catch (error) {
    if (error instanceof BookingOperationError) {
      return { error: error.message };
    }
    return { error: "Não foi possível registrar o comprovante." };
  }

  revalidatePath(`/reserva/${bookingId}`);
  return { success: "Comprovante registrado. Aguardando validação do prestador." };
}

export async function cancelOwnBookingAction(
  _prev: ReservationActionState,
  formData: FormData,
): Promise<ReservationActionState> {
  if (!isSupabaseConfigured()) return { error: SUPABASE_UNAVAILABLE_MESSAGE };

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bookingId = String(formData.get("bookingId") ?? "");

  try {
    await transitionBooking({ bookingId, event: "cancel" });
  } catch (error) {
    if (error instanceof BookingOperationError) {
      return { error: error.message };
    }
    return { error: "Não foi possível cancelar o agendamento." };
  }

  revalidatePath(`/reserva/${bookingId}`);
  return { success: "Agendamento cancelado." };
}
