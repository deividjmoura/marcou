import Link from "next/link";
import {
  listCustomerBookings,
  requireUser,
} from "@/server/bookings";
import {
  BOOKING_STATUS_CLASSES,
  BOOKING_STATUS_LABELS,
  formatBookingDate,
  formatBookingTime,
  formatCents,
} from "@/lib/format";
import { logoutAction } from "../(auth)/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { NotificationBell } from "@/components/notification-bell";
import { countUnreadNotifications } from "@/server/notifications";

export const dynamic = "force-dynamic";

export default async function MeusAgendamentosPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="page-shell page-painel">
        <SupabaseConfigWarning />
      </main>
    );
  }

  await requireUser("/meus-agendamentos");
  const [bookings, unread] = await Promise.all([
    listCustomerBookings(),
    countUnreadNotifications(),
  ]);

  return (
    <main className="page-shell page-painel">
      <header className="painel-header">
        <div>
          <span className="eyebrow">MEUS AGENDAMENTOS</span>
          <h1>Suas reservas</h1>
        </div>
        <div className="item-actions">
          <Link href="/minha-conta" className="btn btn-ghost">Minha conta</Link>
          <NotificationBell unreadCount={unread} />
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost">
              Sair
            </button>
          </form>
        </div>
      </header>

      {bookings.length === 0 ? (
        <div className="card">
          <p className="muted">
            Você ainda não tem agendamentos. Encontre um estabelecimento e
            reserve seu horário.
          </p>
        </div>
      ) : (
        <ul className="booking-cards">
          {bookings.map((booking) => (
            <li key={booking.id} className="card booking-card">
              <div className="card-heading">
                <span
                  className={`status-pill ${BOOKING_STATUS_CLASSES[booking.status] ?? ""}`}
                >
                  {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                </span>
                <span className="muted small">
                  {formatCents(booking.price_cents_snapshot)}
                </span>
              </div>
              <h2>{booking.service_name_snapshot}</h2>
              <p className="muted">
                {formatBookingDate(booking.starts_at, booking.timezone)} às{" "}
                {formatBookingTime(booking.starts_at, booking.timezone)}
              </p>
              <Link className="btn" href={`/reserva/${booking.id}`}>
                Ver detalhes
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
