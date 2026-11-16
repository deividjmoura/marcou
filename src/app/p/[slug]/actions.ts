"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { bookingInputSchema, isoDate } from "@/lib/validation";
import {
  BookingOperationError,
  createBooking,
  getAvailableSlots,
  getCurrentUser,
} from "@/server/bookings";

export interface SlotsState {
  slots: Array<{ startsAt: string; occupiedUntil: string; label: string }> | null;
  error?: string;
}

const slotsSchema = z.object({
  slug: z.string().min(1),
  serviceId: z.string().uuid(),
  date: isoDate,
});

export async function fetchSlotsAction(input: unknown): Promise<SlotsState> {
  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return { slots: null };

  try {
    const slots = await getAvailableSlots({
      slug: parsed.data.slug,
      serviceId: parsed.data.serviceId,
      date: parsed.data.date,
    });

    if (!slots) {
      return {
        slots: null,
        error: "Não foi possível consultar a disponibilidade deste serviço.",
      };
    }

    return { slots };
  } catch {
    return {
      slots: null,
      error: "Falha ao consultar os horários. Verifique sua conexão e tente novamente.",
    };
  }
}

export interface BookState {
  error?: string;
}

export async function bookSlotAction(
  _prev: BookState,
  formData: FormData,
): Promise<BookState> {
  const user = await getCurrentUser();
  const slug = String(formData.get("slug") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const date = String(formData.get("date") ?? "");

  if (!user) {
    const query = new URLSearchParams({
      service: serviceId,
      date,
      slot: startsAt,
    });
    const target = `/p/${slug}?${query.toString()}`;
    redirect(`/login?next=${encodeURIComponent(target)}`);
  }

  const parsed = bookingInputSchema.safeParse({
    slug,
    serviceId,
    startsAt,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  let booking;
  try {
    booking = await createBooking({
      slug: parsed.data.slug,
      serviceId: parsed.data.serviceId,
      startsAt: parsed.data.startsAt,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone ?? "",
    });
  } catch (error) {
    if (error instanceof BookingOperationError) {
      return { error: error.message };
    }
    return { error: "Não foi possível concluir a reserva. Tente novamente." };
  }

  // Next.js redirect() throws an internal control-flow exception.
  // Keep it outside this catch so a successful booking is not shown as a failure.
  redirect(`/reserva/${booking.id}`);
}
