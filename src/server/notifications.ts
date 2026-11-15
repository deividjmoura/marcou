import { createClient } from "@/lib/supabase/server";

export type NotificationKind =
  | "booking_created"
  | "booking_proof_received"
  | "booking_confirmed"
  | "booking_cancelled"
  | "booking_expired"
  | "booking_reminder"
  | "booking_changed";

export interface Notification {
  id: string;
  recipient_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  booking_id: string | null;
  event_key: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export class NotificationOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotificationOperationError";
  }
}

/**
 * Notificações do usuário autenticado. A visibilidade é garantida pelo RLS
 * (somente linhas com `recipient_id = auth.uid()`), então a query não filtra
 * manualmente por usuário.
 */
export async function listNotifications(limit = 50): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as Notification[];
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  if (error) return 0;
  return count ?? 0;
}

/** Marca uma notificação como lida; o RPC só afeta linhas do próprio usuário. */
export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: id,
  });

  if (error) {
    throw new NotificationOperationError(
      "mark_failed",
      "Não foi possível marcar a notificação como lida.",
    );
  }
}

/** Marca todas as notificações do usuário como lidas. */
export async function markAllNotificationsRead(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read");

  if (error) {
    throw new NotificationOperationError(
      "mark_all_failed",
      "Não foi possível marcar as notificações como lidas.",
    );
  }
  return typeof data === "number" ? data : 0;
}
