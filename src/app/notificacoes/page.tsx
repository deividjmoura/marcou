import { requireUser } from "@/server/bookings";
import { listNotifications } from "@/server/notifications";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { NotificationBell } from "@/components/notification-bell";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "./actions";
import { NotificationList } from "./notification-list";

export const dynamic = "force-dynamic";

export default async function NotificacoesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="page-shell page-painel">
        <SupabaseConfigWarning />
      </main>
    );
  }

  await requireUser("/notificacoes");
  const notifications = await listNotifications(50);

  return (
    <main className="page-shell page-painel">
      <header className="painel-header">
        <div>
          <span className="eyebrow">NOTIFICAÇÕES</span>
          <h1>Novidades da sua agenda</h1>
          <p className="muted">
            Solicitações, confirmações, cancelamentos e lembretes ficam aqui.
          </p>
        </div>
        <NotificationBell unreadCount={notifications.filter((n) => !n.is_read).length} />
      </header>

      <NotificationList
        notifications={notifications}
        markNotificationReadAction={markNotificationReadAction}
        markAllNotificationsReadAction={markAllNotificationsReadAction}
      />
    </main>
  );
}
