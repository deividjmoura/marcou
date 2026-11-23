"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import {
  providerInputSchema,
  providerSettingsSchema,
  serviceInputSchema,
  availabilityRuleInputSchema,
  availabilityExceptionInputSchema,
} from "@/lib/validation";
import {
  categorySuggestionInputSchema,
  serviceAreaInputSchema,
  serviceDiscoveryInputSchema,
  type ServiceDiscoveryInput,
} from "@/domain/discovery/discovery";
import { isSocialFeatureEnabled } from "@/server/feature-flags";
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
import {
  createCategorySuggestion,
  createProviderServiceArea,
  deleteProviderServiceArea,
} from "@/server/discovery";

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

async function discoveryEnabledForProvider(providerId: string): Promise<boolean> {
  return isSocialFeatureEnabled("social_discovery", { providerId });
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
    revalidatePath("/painel");
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
    const normalized = String(value ?? "")
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
    const valueAsNumber = Number(normalized);
    return Number.isFinite(valueAsNumber)
      ? Math.round(valueAsNumber * 100)
      : Number.NaN;
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

    let discovery: ServiceDiscoveryInput | undefined;
    if (await discoveryEnabledForProvider(provider.id)) {
      const parsedDiscovery = serviceDiscoveryInputSchema.safeParse({
        categoryId: formData.get("categoryId"),
        deliveryModes: formData.getAll("deliveryModes"),
      });
      if (!parsedDiscovery.success) {
        return { error: firstIssue(parsedDiscovery.error) };
      }
      discovery = parsedDiscovery.data;
    }

    if (intent === "update") {
      if (!serviceId) return { error: "Serviço não informado." };
      await updateService(provider.id, serviceId, parsed.data, discovery);
    } else {
      await createService(provider.id, parsed.data, discovery);
    }
    revalidatePath("/painel");
    revalidatePath(`/p/${provider.slug}`);
    return {
      success: intent === "update" ? "Serviço atualizado." : "Serviço criado.",
    };
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

export async function saveServiceAreaAction(
  _prev: PainelActionState,
  formData: FormData,
): Promise<PainelActionState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const parsed = serviceAreaInputSchema.safeParse({
    stateCode: formData.get("stateCode"),
    city: formData.get("city"),
    ibgeCityCode: formData.get("ibgeCityCode") ?? "",
    precision: formData.get("precision"),
    neighborhood: formData.get("neighborhood") ?? "",
    radiusKm: formData.get("radiusKm") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const provider = await ownedProviderOrError();
    if (!provider) return { error: "Você ainda não configurou seu negócio." };
    if (!(await discoveryEnabledForProvider(provider.id))) {
      return { error: "As áreas de atendimento ainda não foram liberadas para esta conta." };
    }

    await createProviderServiceArea(provider.id, parsed.data);
    revalidatePath("/painel");
    revalidatePath(`/p/${provider.slug}`);
    return { success: "Área de atendimento adicionada." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível salvar a área.",
    };
  }
}

export async function deleteServiceAreaAction(
  _prev: PainelActionState,
  formData: FormData,
): Promise<PainelActionState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const areaId = String(formData.get("areaId") ?? "");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(areaId)) {
    return { error: "Área de atendimento inválida." };
  }

  try {
    const provider = await ownedProviderOrError();
    if (!provider) return { error: "Você ainda não configurou seu negócio." };
    if (!(await discoveryEnabledForProvider(provider.id))) {
      return { error: "As áreas de atendimento ainda não foram liberadas para esta conta." };
    }

    await deleteProviderServiceArea(provider.id, areaId);
    revalidatePath("/painel");
    revalidatePath(`/p/${provider.slug}`);
    return { success: "Área removida." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível remover a área.",
    };
  }
}

export async function suggestServiceCategoryAction(
  _prev: PainelActionState,
  formData: FormData,
): Promise<PainelActionState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const parsed = categorySuggestionInputSchema.safeParse({
    proposedName: formData.get("proposedName"),
    proposedParentId: formData.get("proposedParentId") ?? "",
    rationale: formData.get("rationale"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const user = await requireUser();
    const provider = await getOwnedProvider(user.id);
    if (!provider) return { error: "Você ainda não configurou seu negócio." };
    if (!(await discoveryEnabledForProvider(provider.id))) {
      return { error: "As sugestões de categoria ainda não foram liberadas para esta conta." };
    }

    await createCategorySuggestion(provider.id, user.id, parsed.data);
    revalidatePath("/painel");
    return { success: "Sugestão enviada para moderação." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível enviar a sugestão.",
    };
  }
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
