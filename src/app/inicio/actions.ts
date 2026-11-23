"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getOwnedProvider, requireUser } from "@/server/bookings";

export async function setPreferredModeAction(formData: FormData): Promise<void> {
  if (!isSupabaseConfigured()) redirect("/inicio");

  const requestedMode = formData.get("mode");
  if (requestedMode !== "customer" && requestedMode !== "provider") {
    redirect("/inicio");
  }

  const user = await requireUser("/inicio");
  if (requestedMode === "provider") {
    const provider = await getOwnedProvider(user.id);
    if (!provider) {
      // No preference is stored: /painel will offer provider setup while the
      // account remains a customer and keeps the same auth.users identity.
      redirect("/painel");
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_preferred_mode", {
    p_mode: requestedMode,
  });

  if (error) {
    if (requestedMode === "provider" && error.message.includes("provider_required")) {
      redirect("/painel");
    }
    redirect("/inicio?modeError=1");
  }

  revalidatePath("/inicio");
  revalidatePath("/minha-conta");
  revalidatePath("/painel");
  redirect(requestedMode === "provider" ? "/painel" : "/minha-conta");
}
