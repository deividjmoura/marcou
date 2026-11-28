"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { parseBrlToCents, parseOptionalBrlToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
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
import { uploadServiceImage, removeServiceImage } from "@/server/service-images";
import { inspectServiceImage, SERVICE_IMAGE_MAX_BYTES } from "@/server/service-image-validation";
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

function invalidMoneyMessage(field: string): string {
  return `Informe ${field} em reais, por exemplo 50, 50,50 ou 1.234,56. Use vírgula para centavos.`;
}

function firstIssue(error: { issues?: Array<{ message?: string }> }): string {
  return error.issues?.[0]?.message ?? "Dados inválidos.";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

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
  const imageValue = formData.get("image");
  const imageFile = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;
  const removeImage = formData.get("removeImage") === "true";

  if (imageFile && imageFile.size > SERVICE_IMAGE_MAX_BYTES) {
    return { error: "A imagem deve ter no máximo 5 MB." };
  }
  if (imageFile) {
    try {
      inspectServiceImage(new Uint8Array(await imageFile.arrayBuffer()), imageFile.type);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Imagem inválida." };
    }
  }

  const priceCents = parseBrlToCents(formData.get("price"));
  if (Number.isNaN(priceCents)) {
    return { error: invalidMoneyMessage("o preço") };
  }
  // Sinal é opcional: vazio significa "sem sinal" (0), permitido pelo schema
  // (min 0) e pelo banco (deposit_cents default 0, check >= 0).
  const depositCents = parseOptionalBrlToCents(formData.get("deposit"));
  if (Number.isNaN(depositCents)) {
    return { error: invalidMoneyMessage("o sinal") };
  }

  const parsed = serviceInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    durationMinutes: formData.get("durationMinutes"),
    priceCents,
    depositCents,
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

    let savedService;
    if (intent === "update") {
      if (!UUID_PATTERN.test(serviceId)) return { error: "Serviço não informado." };
      savedService = await updateService(provider.id, serviceId, parsed.data, discovery);
    } else {
      savedService = await createService(provider.id, parsed.data, discovery);
    }

    let cleanupWarning = false;
    if (imageFile) {
      try {
        const mediaResult = await uploadServiceImage(provider.id, savedService.id, imageFile);
        cleanupWarning = mediaResult.cleanupWarning;
      } catch (error) {
        revalidatePath("/painel");
        revalidatePath(`/p/${provider.slug}`);
        const reason = error instanceof Error ? error.message : "falha inesperada";
        return { error: `O serviço foi salvo, mas a imagem não foi enviada: ${reason}` };
      }
    } else if (removeImage && intent === "update") {
      const mediaResult = await removeServiceImage(provider.id, savedService.id);
      cleanupWarning = mediaResult.cleanupWarning;
    }

    revalidatePath("/painel");
    revalidatePath(`/p/${provider.slug}`);
    const baseSuccess = intent === "update" ? "Serviço atualizado." : "Serviço criado.";
    return {
      success: cleanupWarning
        ? `${baseSuccess} A imagem anterior não pôde ser removida do Storage.`
        : baseSuccess,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível salvar.",
    };
  }
}

export async function toggleServiceAction(
  _prev: PainelActionState,
  formData: FormData,
): Promise<PainelActionState> {
  if (!isSupabaseConfigured()) return unavailableState();

  const serviceId = String(formData.get("serviceId") ?? "");
  const requestedState = String(formData.get("isActive") ?? "");
  if (!UUID_PATTERN.test(serviceId) || !["true", "false"].includes(requestedState)) {
    return { error: "Serviço ou estado inválido." };
  }

  try {
    const provider = await ownedProviderOrError();
    if (!provider) return { error: "Você ainda não configurou seu negócio." };

    const isActive = requestedState === "true";
    await setServiceActive(provider.id, serviceId, isActive);
    revalidatePath("/painel");
    revalidatePath(`/p/${provider.slug}`);
    return { success: isActive ? "Serviço ativado." : "Serviço desativado." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o serviço.",
    };
  }
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
  if (!UUID_PATTERN.test(areaId)) {
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
