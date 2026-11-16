"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/server/bookings";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/notifications";

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
