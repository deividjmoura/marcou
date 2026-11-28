import { createClient } from "@/lib/supabase/server";
import { inspectServiceImage } from "./service-image-validation";

export interface ServiceImageMutationResult {
  cleanupWarning: boolean;
}

async function getCurrentImagePath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  providerId: string,
  serviceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("services")
    .select("image_path")
    .eq("id", serviceId)
    .eq("provider_id", providerId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível localizar o serviço.");
  if (!data) throw new Error("Serviço não encontrado.");
  return (data.image_path as string | null) ?? null;
}

/**
 * Uploads with the authenticated user's Supabase session; Storage RLS is the
 * final ownership boundary. The server never accepts a caller-supplied path.
 */
export async function uploadServiceImage(
  providerId: string,
  serviceId: string,
  file: File,
): Promise<ServiceImageMutationResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = inspectServiceImage(bytes, file.type);
  const supabase = await createClient();
  const previousPath = await getCurrentImagePath(supabase, providerId, serviceId);
  const path = `providers/${providerId}/services/${serviceId}/${crypto.randomUUID()}.${metadata.extension}`;

  const { error: uploadError } = await supabase.storage
    .from("service-images")
    .upload(path, bytes, {
      contentType: metadata.mime,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    throw new Error("Não foi possível enviar a imagem. Tente novamente.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("services")
    .update({ image_path: path })
    .eq("id", serviceId)
    .eq("provider_id", providerId)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    await supabase.storage.from("service-images").remove([path]).catch(() => undefined);
    throw new Error("A imagem foi enviada, mas não foi possível vinculá-la ao serviço.");
  }

  let cleanupWarning = false;
  if (previousPath && previousPath !== path) {
    const { error } = await supabase.storage.from("service-images").remove([previousPath]);
    cleanupWarning = Boolean(error);
  }
  return { cleanupWarning };
}

/** Clear the database reference first; a failed object deletion leaves only an orphan. */
export async function removeServiceImage(
  providerId: string,
  serviceId: string,
): Promise<ServiceImageMutationResult> {
  const supabase = await createClient();
  const previousPath = await getCurrentImagePath(supabase, providerId, serviceId);
  if (!previousPath) return { cleanupWarning: false };

  const { data: updated, error: updateError } = await supabase
    .from("services")
    .update({ image_path: null })
    .eq("id", serviceId)
    .eq("provider_id", providerId)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    throw new Error("Não foi possível remover a imagem do serviço.");
  }

  const { error } = await supabase.storage.from("service-images").remove([previousPath]);
  return { cleanupWarning: Boolean(error) };
}
