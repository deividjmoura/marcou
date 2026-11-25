"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isoDate, multiBookingInputSchema } from "@/lib/validation";
import { safeNextPath } from "@/lib/identity";
import { isSupabaseConfigured } from "@/lib/env";
import {
  BookingOperationError,
  createBooking,
  getAvailableSlots,
  getCurrentUser,
  type BookingTotals,
  type ScheduleServiceDetail,
  type SlotPayload,
} from "@/server/bookings";

const SUPABASE_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";
const INVALID_SELECTION_MESSAGE = "Selecione ao menos um serviço válido.";

export interface SlotsState {
  slots: SlotPayload[] | null;
  services: ScheduleServiceDetail[];
  totals: BookingTotals | null;
  error?: string;
}

const slotsSchema = z.object({
  slug: z.string().min(1),
  // `serviceId` é aceito apenas para links antigos de serviço único.
  serviceId: z.string().uuid().optional(),
  serviceIds: z
    .array(z.string().uuid())
    .max(20)
    .optional()
    .refine((ids) => !ids || new Set(ids).size === ids.length),
  date: isoDate,
});

function selectedServiceIds(input: {
  serviceId?: string;
  serviceIds?: string[];
}): string[] {
  const ids = [...(input.serviceIds ?? [])];
  if (input.serviceId && !ids.includes(input.serviceId)) {
    ids.unshift(input.serviceId);
  }
  return [...new Set(ids)];
}

export async function fetchSlotsAction(input: unknown): Promise<SlotsState> {
  if (!isSupabaseConfigured()) {
    return {
      slots: null,
      services: [],
      totals: null,
      error: SUPABASE_UNAVAILABLE_MESSAGE,
    };
  }

  const parsed = slotsSchema.safeParse(input);
  const serviceIds = parsed.success ? selectedServiceIds(parsed.data) : [];
  if (!parsed.success || serviceIds.length === 0) {
    return { slots: null, services: [], totals: null };
  }

  try {
    const available = await getAvailableSlots({
      slug: parsed.data.slug,
      serviceIds,
      date: parsed.data.date,
    });

    if (!available) {
      return {
        slots: null,
        services: [],
        totals: null,
        error: "Não foi possível consultar a disponibilidade destes serviços.",
      };
    }

    return {
      slots: available.slots,
      services: available.services,
      totals: available.totals,
    };
  } catch {
    return {
      slots: null,
      services: [],
      totals: null,
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
  if (!isSupabaseConfigured()) return { error: SUPABASE_UNAVAILABLE_MESSAGE };

  const user = await getCurrentUser();
  const slug = String(formData.get("slug") ?? "");
  const date = String(formData.get("date") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const serviceIds = formData
    .getAll("serviceIds")
    .map((value) => String(value))
    .filter(Boolean);
  // Compatibilidade com o formulário antigo de serviço único.
  const legacyServiceId = String(formData.get("serviceId") ?? "");
  if (legacyServiceId && !serviceIds.includes(legacyServiceId)) {
    serviceIds.unshift(legacyServiceId);
  }

  if (!user) {
    const query = new URLSearchParams({
      service: serviceIds[0] ?? "",
      services: serviceIds.join(","),
      date,
      slot: startsAt,
    });
    const target = safeNextPath(`/p/${slug}?${query.toString()}`);
    redirect(`/login?next=${encodeURIComponent(target)}`);
  }

  const parsed = multiBookingInputSchema.safeParse({
    slug,
    serviceIds,
    startsAt,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues.find((issue) =>
          issue.path.includes("serviceIds"),
        )?.message ??
        parsed.error.issues[0]?.message ??
        INVALID_SELECTION_MESSAGE,
    };
  }

  let bookingId: string;
  try {
    const booking = await createBooking({
      slug: parsed.data.slug,
      serviceIds: parsed.data.serviceIds,
      startsAt: parsed.data.startsAt,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone ?? "",
    });
    bookingId = booking.id;
  } catch (error) {
    if (error instanceof BookingOperationError) {
      return { error: error.message };
    }
    return { error: "Não foi possível concluir a reserva. Tente novamente." };
  }

  // redirect() lança a exceção de controle do Next.js: fora do try, para que
  // uma reserva criada não apareça como falha (Issue #22).
  redirect(`/reserva/${bookingId}`);
}
