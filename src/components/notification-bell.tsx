import Link from "next/link";

/**
 * Sino de notificações com contador de não lidas. É um link para a página
 * `/notificacoes`, onde o usuário lê e marca as mensagens.
 */
export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notificacoes"
      className="notification-bell"
      aria-label={`Notificações, ${unreadCount} não lidas`}
    >
      <span aria-hidden="true">🔔</span>
      <span>Notificações</span>
      {unreadCount > 0 ? (
        <span className="notification-badge">{unreadCount}</span>
      ) : null}
    </Link>
  );
}
