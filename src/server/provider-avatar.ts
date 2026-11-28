import { createClient } from "@/lib/supabase/server";
import { inspectServiceImage } from "./service-image-validation";

export interface ProviderAvatarMutationResult {
  cleanupWarning: boolean;
}

async function getCurrentAvatarPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  providerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("avatar_path")
    .eq("id", providerId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível localizar o perfil profissional.");
  if (!data) throw new Error("Perfil profissional não encontrado.");
  return (data.avatar_path as string | null) ?? null;
}

/**
 * Uploads with the authenticated user's Supabase session; Storage RLS is the
 * final ownership boundary. The server never accepts a caller-supplied path.
 */
export async function uploadProviderAvatar(
  providerId: string,
  file: File,
): Promise<ProviderAvatarMutationResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = inspectServiceImage(bytes, file.type);
  const supabase = await createClient();
  const previousPath = await getCurrentAvatarPath(supabase, providerId);
  const path = `providers/${providerId}/avatar/${crypto.randomUUID()}.${metadata.extension}`;

  const { error: uploadError } = await supabase.storage
    .from("service-images")
    .upload(path, bytes, {
      contentType: metadata.mime,
      cacheControl: "31536000",
      upsert: false,
    });
  if (uploadError) {
    throw new Error("Não foi possível enviar a foto. Tente novamente.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("providers")
    .update({ avatar_path: path })
    .eq("id", providerId)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    await supabase.storage.from("service-images").remove([path]).catch(() => undefined);
    throw new Error("A foto foi enviada, mas não foi possível vinculá-la ao perfil.");
  }

  let cleanupWarning = false;
  if (previousPath && previousPath !== path) {
    const { error } = await supabase.storage.from("service-images").remove([previousPath]);
    cleanupWarning = Boolean(error);
  }
  return { cleanupWarning };
}

/** Clear the profile reference first; a failed object deletion leaves only an orphan. */
export async function removeProviderAvatar(
  providerId: string,
): Promise<ProviderAvatarMutationResult> {
  const supabase = await createClient();
  const previousPath = await getCurrentAvatarPath(supabase, providerId);
  if (!previousPath) return { cleanupWarning: false };

  const { data: updated, error: updateError } = await supabase
    .from("providers")
    .update({ avatar_path: null })
    .eq("id", providerId)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    throw new Error("Não foi possível remover a foto do perfil.");
  }

  const { error } = await supabase.storage.from("service-images").remove([previousPath]);
  return { cleanupWarning: Boolean(error) };
}
