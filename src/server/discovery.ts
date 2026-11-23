import { createClient } from "@/lib/supabase/server";
import {
  normalizeDiscoveryKey,
  publicProviderDiscoverySchema,
  type CategorySuggestion,
  type CategorySuggestionInput,
  type ProviderServiceArea,
  type PublicProviderDiscovery,
  type ServiceAreaInput,
  type ServiceCategory,
} from "@/domain/discovery/discovery";

type DatabaseError = {
  code?: string | null;
  message?: string | null;
  constraint?: string | null;
};

function discoveryError(error: DatabaseError | null): Error {
  if (error?.message?.includes("customer_location_requires_service_area")) {
    return new Error(
      "Cadastre uma área de atendimento antes de oferecer serviço no local do cliente.",
    );
  }
  if (error?.message?.includes("service_area_in_use_by_customer_location")) {
    return new Error(
      "Esta é a última área ativa. Retire primeiro a modalidade no local do cliente dos serviços.",
    );
  }
  if (error?.message?.includes("service_category_not_published")) {
    return new Error("Selecione uma categoria publicada e disponível.");
  }
  if (error?.code === "23505") {
    if (error.constraint === "provider_service_area_unique_idx") {
      return new Error("Esta área de atendimento já foi cadastrada.");
    }
    if (error.constraint === "service_category_pending_suggestion_idx") {
      return new Error("Já existe uma sugestão pendente com este nome.");
    }
    return new Error("Já existe um registro equivalente.");
  }
  return new Error(error?.message ?? "Não foi possível concluir a operação.");
}

export async function listServiceCategories(): Promise<ServiceCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_category_catalog")
    .select("id,parent_id,stable_key,version,name,description")
    .order("name", { ascending: true });

  if (error) throw discoveryError(error);
  return (data ?? []) as ServiceCategory[];
}

export async function listProviderServiceAreas(
  providerId: string,
): Promise<ProviderServiceArea[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_service_areas")
    .select(
      "id,provider_id,country_code,state_code,city_name,city_key,ibge_city_code,neighborhood_name,neighborhood_key,precision,radius_km,source,is_active,created_at,updated_at",
    )
    .eq("provider_id", providerId)
    .eq("is_active", true)
    .order("state_code", { ascending: true })
    .order("city_key", { ascending: true })
    .order("neighborhood_key", { ascending: true, nullsFirst: true });

  if (error) throw discoveryError(error);
  return (data ?? []) as ProviderServiceArea[];
}

export async function createProviderServiceArea(
  providerId: string,
  input: ServiceAreaInput,
): Promise<ProviderServiceArea> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_service_areas")
    .insert({
      provider_id: providerId,
      country_code: "BR",
      state_code: input.stateCode,
      city_name: input.city,
      ibge_city_code: input.ibgeCityCode || null,
      neighborhood_name: input.neighborhood || null,
      precision: input.precision,
      radius_km: input.radiusKm ?? null,
      source: "provider_declared",
      is_active: true,
    })
    .select()
    .single();

  if (error) throw discoveryError(error);
  return data as ProviderServiceArea;
}

export async function deleteProviderServiceArea(
  providerId: string,
  areaId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_service_areas")
    .delete()
    .eq("id", areaId)
    .eq("provider_id", providerId)
    .select("id");

  if (error) throw discoveryError(error);
  if (!data || data.length === 0) {
    throw new Error("Área de atendimento não encontrada.");
  }
}

export async function listCategorySuggestions(
  providerId: string,
): Promise<CategorySuggestion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_category_suggestions")
    .select(
      "id,provider_id,proposed_parent_id,proposed_name,status,created_at",
    )
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false });

  if (error) throw discoveryError(error);
  return (data ?? []) as CategorySuggestion[];
}

export async function createCategorySuggestion(
  providerId: string,
  userId: string,
  input: CategorySuggestionInput,
): Promise<CategorySuggestion> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_category_suggestions")
    .insert({
      provider_id: providerId,
      proposed_parent_id: input.proposedParentId || null,
      proposed_name: input.proposedName,
      rationale: input.rationale,
      submitted_by: userId,
      status: "pending",
    })
    .select(
      "id,provider_id,proposed_parent_id,proposed_name,status,created_at",
    )
    .single();

  if (error) throw discoveryError(error);
  return data as CategorySuggestion;
}

export async function getPublicProviderDiscovery(
  providerSlug: string,
): Promise<PublicProviderDiscovery | null> {
  if (!/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/.test(providerSlug)) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_public_provider_discovery",
    { p_provider_slug: providerSlug },
  );

  if (error || data == null) return null;
  const parsed = publicProviderDiscoverySchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function normalizedAreaIdentity(input: ServiceAreaInput): string {
  return [
    input.stateCode,
    normalizeDiscoveryKey(input.city),
    normalizeDiscoveryKey(input.neighborhood || ""),
    input.precision,
    input.radiusKm ?? "",
  ].join(":");
}
