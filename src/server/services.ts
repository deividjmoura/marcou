import { createClient } from "@/lib/supabase/server";
import { minutesToTimeString, timeStringToMinutes } from "@/lib/time";
import type {
  AvailabilityExceptionInput,
  AvailabilityRuleInput,
  ProviderInput,
  ProviderSettingsInput,
  ServiceInput,
} from "@/lib/validation";
import type { AvailabilityExceptionRow, AvailabilityRuleRow, Provider, Service } from "./bookings";

function fail(error: { message?: string | null } | null): never {
  throw new Error(error?.message ?? "Não foi possível concluir a operação.");
}

export async function listServicesForOwner(
  providerId: string,
): Promise<Service[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("*")
    .eq("provider_id", providerId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) fail(error);
  return (data ?? []) as Service[];
}

export async function createService(
  providerId: string,
  input: ServiceInput,
): Promise<Service> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      provider_id: providerId,
      name: input.name,
      description: input.description || null,
      duration_minutes: input.durationMinutes,
      price_cents: input.priceCents,
      deposit_cents: input.depositCents,
      buffer_minutes: input.bufferMinutes,
      is_active: true,
    })
    .select()
    .single();

  if (error) fail(error);
  return data as Service;
}

export async function updateService(
  providerId: string,
  serviceId: string,
  input: ServiceInput,
): Promise<Service> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update({
      name: input.name,
      description: input.description || null,
      duration_minutes: input.durationMinutes,
      price_cents: input.priceCents,
      deposit_cents: input.depositCents,
      buffer_minutes: input.bufferMinutes,
    })
    .eq("id", serviceId)
    .eq("provider_id", providerId)
    .select()
    .single();

  if (error) fail(error);
  if (!data) throw new Error("Serviço não encontrado.");
  return data as Service;
}

export async function setServiceActive(
  providerId: string,
  serviceId: string,
  isActive: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .update({ is_active: isActive })
    .eq("id", serviceId)
    .eq("provider_id", providerId)
    .select("id");

  if (error) fail(error);
  if (!data || data.length === 0) throw new Error("Serviço não encontrado.");
}

export async function listRules(providerId: string): Promise<AvailabilityRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_rules")
    .select("*")
    .eq("provider_id", providerId)
    .order("day_of_week", { ascending: true })
    .order("starts_at", { ascending: true });

  if (error) fail(error);
  return (data ?? []) as AvailabilityRuleRow[];
}

export async function createRule(
  providerId: string,
  input: AvailabilityRuleInput,
): Promise<AvailabilityRuleRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_rules")
    .insert({
      provider_id: providerId,
      day_of_week: input.dayOfWeek,
      starts_at: minutesToTimeString(
        timeStringToMinutes(input.startsAt),
      ),
      ends_at: minutesToTimeString(timeStringToMinutes(input.endsAt)),
      valid_from: input.validFrom || null,
      valid_until: input.validUntil || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) fail(error);
  return data as AvailabilityRuleRow;
}

export async function updateRule(
  providerId: string,
  ruleId: string,
  input: AvailabilityRuleInput,
): Promise<AvailabilityRuleRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_rules")
    .update({
      day_of_week: input.dayOfWeek,
      starts_at: minutesToTimeString(timeStringToMinutes(input.startsAt)),
      ends_at: minutesToTimeString(timeStringToMinutes(input.endsAt)),
      valid_from: input.validFrom || null,
      valid_until: input.validUntil || null,
    })
    .eq("id", ruleId)
    .eq("provider_id", providerId)
    .select()
    .single();

  if (error) fail(error);
  if (!data) throw new Error("Regra não encontrada.");
  return data as AvailabilityRuleRow;
}

export async function deleteRule(
  providerId: string,
  ruleId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_rules")
    .delete()
    .eq("id", ruleId)
    .eq("provider_id", providerId)
    .select("id");

  if (error) fail(error);
  if (!data || data.length === 0) throw new Error("Regra não encontrada.");
}

export async function listExceptions(
  providerId: string,
): Promise<AvailabilityExceptionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_exceptions")
    .select("*")
    .eq("provider_id", providerId)
    .order("exception_date", { ascending: true });

  if (error) fail(error);
  return (data ?? []) as AvailabilityExceptionRow[];
}

export async function createException(
  providerId: string,
  input: AvailabilityExceptionInput,
): Promise<AvailabilityExceptionRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_exceptions")
    .insert({
      provider_id: providerId,
      exception_date: input.date,
      kind: input.kind,
      starts_at:
        input.kind === "custom_hours" ? input.startsAt ?? null : null,
      ends_at:
        input.kind === "custom_hours" ? input.endsAt ?? null : null,
      note: input.note || null,
    })
    .select()
    .single();

  if (error) fail(error);
  return data as AvailabilityExceptionRow;
}

export async function deleteException(
  providerId: string,
  exceptionId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("availability_exceptions")
    .delete()
    .eq("id", exceptionId)
    .eq("provider_id", providerId)
    .select("id");

  if (error) fail(error);
  if (!data || data.length === 0) {
    throw new Error("Exceção não encontrada.");
  }
}

export async function createProvider(
  ownerId: string,
  input: ProviderInput,
): Promise<Provider> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .insert({
      owner_id: ownerId,
      slug: input.slug,
      display_name: input.displayName,
      description: input.description || null,
      timezone: input.timezone,
      is_published: input.isPublished,
      booking_hold_minutes: input.bookingHoldMinutes,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Este endereço já está em uso. Escolha outro.");
    }
    fail(error);
  }
  return data as Provider;
}

export async function updateProviderSettings(
  providerId: string,
  input: ProviderSettingsInput,
): Promise<Provider> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .update({
      slug: input.slug,
      display_name: input.displayName,
      description: input.description || null,
      timezone: input.timezone,
      is_published: input.isPublished,
      booking_hold_minutes: input.bookingHoldMinutes,
    })
    .eq("id", providerId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Este endereço já está em uso. Escolha outro.");
    }
    fail(error);
  }
  if (!data) throw new Error("Negócio não encontrado.");
  return data as Provider;
}
