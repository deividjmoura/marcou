"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/bookings";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/notifications";
import {
  isNotificationAudience,
  parseNotificationPreferencesFormData,
} from "@/domain/notifications/preferences";
import {
  NotificationPreferenceOperationError,
  saveNotificationPreferences,
} from "@/server/notification-preferences";

export interface NotificationPreferencesActionState {
  error?: string;
  success?: string;
}

export async function markNotificationReadAction(
  formData: FormData,
): Promise<void> {
  if (!isSupabaseConfigured()) return revalidatePath("/notificacoes");

  await requireUser("/notificacoes");

  const notificationId = String(formData.get("notificationId") ?? "");
  if (!notificationId) return;

  try {
    await markNotificationRead(notificationId);
  } catch {
    // A lista será revalidada e mostrará o estado atual.
  }

  revalidatePath("/notificacoes");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  if (!isSupabaseConfigured()) return revalidatePath("/notificacoes");

  await requireUser("/notificacoes");

  try {
    await markAllNotificationsRead();
  } catch {
    // A lista será revalidada e mostrará o estado atual.
  }

  revalidatePath("/notificacoes");
}

export async function saveNotificationPreferencesAction(
  _prevState: NotificationPreferencesActionState,
  formData: FormData,
): Promise<NotificationPreferencesActionState> {
  if (!isSupabaseConfigured()) {
    return {
      error: "Supabase não está configurado neste ambiente.",
    };
  }

  const rawAudience = String(formData.get("audience") ?? "");
  if (!isNotificationAudience(rawAudience)) {
    return { error: "Seção de preferências inválida." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      error: "Faça login novamente para salvar suas preferências.",
    };
  }

  const updates = parseNotificationPreferencesFormData(formData, rawAudience);

  try {
    await saveNotificationPreferences(user.id, updates);
  } catch (error) {
    if (error instanceof NotificationPreferenceOperationError) {
      return { error: error.message };
    }
    return {
      error: "Não foi possível salvar suas preferências agora. Tente novamente.",
    };
  }

  revalidatePath("/minha-conta");
  revalidatePath("/painel");
  revalidatePath("/notificacoes");

  return {
    success: "Preferências de notificação salvas.",
  };
}
