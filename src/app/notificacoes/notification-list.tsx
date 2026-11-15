"use client";

import Link from "next/link";
import type { Notification } from "@/server/notifications";

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const KIND_LABELS: Record<string, string> = {
  booking_created: "Solicitação",
  booking_proof_received: "Comprovante",
  booking_confirmed: "Confirmação",
  booking_cancelled: "Cancelamento",
  booking_expired: "Expiração",
  booking_reminder: "Lembrete",
  booking_changed: "Alteração",
};

export function NotificationList({
  notifications,
  markNotificationReadAction,
  markAllNotificationsReadAction,
}: {
  notifications: Notification[];
  markNotificationReadAction: (formData: FormData) => Promise<void>;
  markAllNotificationsReadAction: () => Promise<void>;
}) {
  const unread = notifications.filter((item) => !item.is_read).length;

  return (
    <section className="card">
      <div className="card-heading">
        <h2>Notificações</h2>
        {unread > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <button type="submit" className="btn btn-small btn-ghost">
              Marcar todas como lidas
            </button>
          </form>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <p className="muted">
          Você ainda não tem notificações. Elas aparecem quando há novidades
          sobre seus agendamentos.
        </p>
      ) : (
        <ul className="notification-list">
          {notifications.map((item) => (
            <li
              key={item.id}
              className={`notification-row${item.is_read ? "" : " is-unread"}`}
            >
              <div className="notification-main">
                <div className="notification-meta">
                  <span className="tag">
                    {KIND_LABELS[item.kind] ?? item.kind}
                  </span>
                  <span className="muted small">{formatWhen(item.created_at)}</span>
                </div>
                <strong>{item.title}</strong>
                <p className="muted small">{item.body}</p>
              </div>

              <div className="item-actions">
                {item.booking_id ? (
                  <Link
                    className="btn btn-small btn-ghost"
                    href={`/reserva/${item.booking_id}`}
                  >
                    Ver agendamento
                  </Link>
                ) : null}
                {item.is_read ? (
                  <span className="muted small">Lida</span>
                ) : (
                  <form action={markNotificationReadAction}>
                    <input
                      type="hidden"
                      name="notificationId"
                      value={item.id}
                    />
                    <button type="submit" className="btn btn-small">
                      Marcar como lida
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
