"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  providerInputSchema,
  providerSettingsSchema,
  serviceInputSchema,
  availabilityRuleInputSchema,
  availabilityExceptionInputSchema,
} from "@/lib/validation";
import {
  BookingOperationError,
  getOwnedProvider,
  requireUser,
  transitionBooking,
  type BookingEventName,
} from "@/server/bookings";
import {
  createException,
  createProvider,
  createRule,
  createService,
  deleteException,
  deleteRule,
  setServiceActive,
  updateProviderSettings,
  updateRule,
  updateService,
} from "@/server/services";

export interface PainelActionState {
  error?: string;
  success?: string;
}

const SUPABASE_UNAVAILABLE_MESSAGE =
  "O Supabase não está configurado neste ambiente. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

function unavailableState(): PainelActionState {
  return { error: SUPABASE_UNAVAILABLE_MESSAGE };
}

async function ownedProviderOrError() {
  const user = await requireUser();
  return getOwnedProvider(user.id);
}

function firstIssue(error: { issues?: Array<{ message?: string }> }): string {
  return error.issues?.[0]?.message ?? "Dados inválidos.";
}

export async function saveProviderAction(
  _prev: PainelActionState,
  formData: FormData,
): Promise<PainelActionState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const user = await requireUser();
  const existing = await getOwnedProvider(user.id);

  const raw = {
    slug: formData.get("slug"),
    displayName: formData.get("displayName"),
    description: formData.get("description"),
    timezone: existing?.timezone ?? "America/Sao_Paulo",
    isPublished: formData.get("isPublished"),
    bookingHoldMinutes: formData.get("bookingHoldMinutes"),
  };

  try {
    if (existing) {
      const parsed = providerSettingsSchema.safeParse(raw);
      if (!parsed.success) return { error: firstIssue(parsed.error) };
      const updated = await updateProviderSettings(existing.id, parsed.data);
      revalidatePath("/painel");
      revalidatePath(`/p/${existing.slug}`);
      revalidatePath(`/p/${updated.slug}`);
      return { success: "Configurações salvas." };
    }

    const parsed = providerInputSchema.safeParse(raw);
    if (!parsed.success) return { error: firstIssue(parsed.error) };
    await createProvider(user.id, parsed.data);
    try {
      const supabase = await createClient();
      await supabase.rpc("set_preferred_mode", { p_mode: "provider" });
    } catch {
      // The provider is still created under the same auth.users identity. The
      // preference is only navigation and can be changed again from the hub.
    }
    revalidatePath("/painel");
    revalidatePath("/minha-conta");
    revalidatePath("/inicio");
    return { success: "Negócio criado. Agora cadastre seus serviços." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível salvar.",
    };
  }
}

export async function saveServiceAction(
  _prev: PainelActionState,
  formData: FormData,
): Promise<PainelActionState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const intent = String(formData.get("intent") ?? "create");
  const serviceId = String(formData.get("serviceId") ?? "");

  const toCents = (value: FormDataEntryValue | null): number => {
    const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
  };

  const parsed = serviceInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    durationMinutes: formData.get("durationMinutes"),
    priceCents: toCents(formData.get("price")),
    depositCents: toCents(formData.get("deposit")),
    bufferMinutes: formData.get("bufferMinutes"),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const provider = await ownedProviderOrError();
    if (!provider) return { error: "Você ainda não configurou seu negócio." };
    if (intent === "update") {
      if (!serviceId) return { error: "Serviço não informado." };
      await updateService(provider.id, serviceId, parsed.data);
    } else {
      await createService(provider.id, parsed.data);
    }
    revalidatePath("/painel");
    return { success: intent === "update" ? "Serviço atualizado." : "Serviço criado." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível salvar.",
    };
  }
}

export async function toggleServiceAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) return revalidatePath("/painel");

  const provider = await ownedProviderOrError();
  if (!provider) return revalidatePath("/painel");

  const serviceId = String(formData.get("serviceId") ?? "");
  const isActive = formData.get("isActive") === "true";

  try {
    await setServiceActive(provider.id, serviceId, isActive);
  } catch {
    // A UI será atualizada com o estado atual do servidor.
  }

  revalidatePath("/painel");
}

export async function saveRuleAction(
  _prev: PainelActionState,
  formData: FormData,
): Promise<PainelActionState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const parsed = availabilityRuleInputSchema.safeParse({
    dayOfWeek: formData.get("dayOfWeek"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    validFrom: formData.get("validFrom"),
    validUntil: formData.get("validUntil"),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const provider = await ownedProviderOrError();
    if (!provider) return { error: "Você ainda não configurou seu negócio." };
    const ruleId = String(formData.get("ruleId") ?? "");
    if (ruleId) {
      await updateRule(provider.id, ruleId, parsed.data);
      revalidatePath("/painel");
      return { success: "Período de expediente atualizado." };
    }
    await createRule(provider.id, parsed.data);
    revalidatePath("/painel");
    return { success: "Período de expediente adicionado." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível salvar.",
    };
  }
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) return revalidatePath("/painel");

  const provider = await ownedProviderOrError();
  if (!provider) return revalidatePath("/painel");

  try {
    await deleteRule(provider.id, String(formData.get("ruleId") ?? ""));
  } catch {
    // Ignora falha e revalida o estado atual.
  }
  revalidatePath("/painel");
}

export async function saveExceptionAction(
  _prev: PainelActionState,
  formData: FormData,
): Promise<PainelActionState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const parsed = availabilityExceptionInputSchema.safeParse({
    date: formData.get("date"),
    kind: formData.get("kind"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    note: formData.get("note"),
  });

  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const provider = await ownedProviderOrError();
    if (!provider) return { error: "Você ainda não configurou seu negócio." };
    await createException(provider.id, parsed.data);
    revalidatePath("/painel");
    return { success: "Exceção adicionada." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível salvar.",
    };
  }
}

export async function deleteExceptionAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) return revalidatePath("/painel");

  const provider = await ownedProviderOrError();
  if (!provider) return revalidatePath("/painel");

  try {
    await deleteException(
      provider.id,
      String(formData.get("exceptionId") ?? ""),
    );
  } catch {
    // Ignora falha e revalida o estado atual.
  }
  revalidatePath("/painel");
}

const BOOKING_EVENTS: BookingEventName[] = [
  "proof_received",
  "payment_approved",
  "cancel",
  "expire",
];

export async function providerBookingAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) return revalidatePath("/painel");

  const provider = await ownedProviderOrError();
  if (!provider) return revalidatePath("/painel");

  const bookingId = String(formData.get("bookingId") ?? "");
  const event = String(formData.get("event") ?? "") as BookingEventName;

  if (!BOOKING_EVENTS.includes(event) || !bookingId) return;

  try {
    await transitionBooking({ bookingId, event });
  } catch (error) {
    if (!(error instanceof BookingOperationError)) throw error;
    // Conflito de estado: a lista será revalidada e mostrará o estado atual.
  }

  revalidatePath("/painel");
}
