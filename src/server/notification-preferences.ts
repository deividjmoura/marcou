import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  isMandatoryNotification,
  resolveNotificationPreferences,
  type NotificationAudience,
  type NotificationPreferenceRow,
  type NotificationPreferenceUpdate,
  type ResolvedNotificationPreference,
} from "@/domain/notifications/preferences";

export class NotificationPreferenceOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotificationPreferenceOperationError";
  }
}

/**
 * Lista as preferências efetivas de notificação do usuário autenticado.
 * O isolamento por conta é garantido por RLS (`user_id = auth.uid()`).
 */
export async function listNotificationPreferences(
  audience: NotificationAudience,
): Promise<ResolvedNotificationPreference[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("event_type, channel, enabled");

  if (error) {
    return resolveNotificationPreferences([], audience);
  }

  return resolveNotificationPreferences(
    (data ?? []) as NotificationPreferenceRow[],
    audience,
  );
}

/**
 * Salva em lote as preferências de notificação do usuário autenticado.
 * Eventos obrigatórios no canal `in_app` são sempre forçados para `true`
 * antes do envio ao banco (além da constraint CHECK no PostgreSQL).
 */
export async function saveNotificationPreferences(
  userId: string,
  updates: readonly NotificationPreferenceUpdate[],
): Promise<void> {
  if (!userId) {
    throw new NotificationPreferenceOperationError(
      "unauthenticated",
      "Faça login novamente para salvar suas preferências.",
    );
  }

  if (updates.length === 0) return;

  const nowIso = new Date().toISOString();
  const payload = updates.map((entry) => ({
    user_id: userId,
    event_type: entry.eventType,
    channel: entry.channel,
    enabled: isMandatoryNotification(entry.eventType, entry.channel)
      ? true
      : Boolean(entry.enabled),
    updated_at: nowIso,
  }));

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(payload, { onConflict: "user_id,event_type,channel" });

  if (error) {
    throw new NotificationPreferenceOperationError(
      "save_failed",
      "Não foi possível salvar suas preferências agora. Tente novamente.",
    );
  }
}
