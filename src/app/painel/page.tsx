import Link from "next/link";
import {
  getOwnedProvider,
  listProviderBookings,
  requireUser,
  type Booking,
} from "@/server/bookings";
import { listExceptions, listRules, listServicesForOwner } from "@/server/services";
import {
  BOOKING_STATUS_CLASSES,
  BOOKING_STATUS_LABELS,
  formatBookingDate,
  formatBookingTime,
  formatCents,
} from "@/lib/format";
import { ProviderForm, ProviderPanelMenu } from "./painel-client";
import { providerBookingAction } from "./actions";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { NotificationBell } from "@/components/notification-bell";
import { countUnreadNotifications } from "@/server/notifications";

export const dynamic = "force-dynamic";

function BookingActions({ booking }: { booking: Booking }) {
  return (
    <div className="item-actions">
      {booking.status === "pending_payment" ? (
        <form action={providerBookingAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="event" value="proof_received" />
          <button type="submit" className="btn btn-small">
            Marcar comprovante
          </button>
        </form>
      ) : null}

      {booking.status === "pending_review" ? (
        <form action={providerBookingAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="event" value="payment_approved" />
          <button type="submit" className="btn btn-small">
            Confirmar pagamento
          </button>
        </form>
      ) : null}

      {booking.status === "pending_payment" ||
      booking.status === "pending_review" ||
      booking.status === "confirmed" ? (
        <form action={providerBookingAction}>
          <input type="hidden" name="bookingId" value={booking.id} />
          <input type="hidden" name="event" value="cancel" />
          <button type="submit" className="btn btn-small btn-ghost">
            Cancelar
          </button>
        </form>
      ) : null}
    </div>
  );
}

export default async function PainelPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="page-shell page-painel">
        <header className="painel-header">
          <div>
            <span className="eyebrow">PAINEL DO PRESTADOR</span>
            <h1>Configure seu negócio</h1>
          </div>
        </header>
        <SupabaseConfigWarning />
      </main>
    );
  }

  const user = await requireUser("/painel");
  const provider = await getOwnedProvider(user.id);
  const unread = await countUnreadNotifications();

  if (!provider) {
    return (
      <main className="page-shell page-painel">
        <header className="painel-header">
          <div>
            <span className="eyebrow">PAINEL DO PRESTADOR</span>
            <h1>Configure seu negócio</h1>
            <p className="muted">
              Crie a página pública de agendamento do seu negócio.
            </p>
          </div>
          <div className="item-actions">
            <NotificationBell unreadCount={unread} />
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost">
                Sair
              </button>
            </form>
          </div>
        </header>

        <ProviderForm provider={null} />
      </main>
    );
  }

  const [services, rules, exceptions, bookings] = await Promise.all([
    listServicesForOwner(provider.id),
    listRules(provider.id),
    listExceptions(provider.id),
    listProviderBookings(provider.id),
  ]);

  return (
    <main className="page-shell page-painel">
      <header className="painel-header">
        <div>
          <span className="eyebrow">PAINEL DO PRESTADOR</span>
          <h1>{provider.display_name}</h1>
          <p className="muted">Acompanhe e gerencie seus agendamentos.</p>
        </div>
      </header>

      <ProviderPanelMenu
        provider={provider}
        services={services}
        rules={rules}
        exceptions={exceptions}
        unreadCount={unread}
      />

      <section className="card">
        <h2>Agendamentos</h2>
        {bookings.length === 0 ? (
          <p className="muted">Nenhum agendamento por enquanto.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      {formatBookingDate(booking.starts_at, booking.timezone)}
                      <br />
                      <span className="muted small">
                        {formatBookingTime(booking.starts_at, booking.timezone)} às{" "}
                        {formatBookingTime(booking.ends_at, booking.timezone)}
                      </span>
                    </td>
                    <td>
                      {booking.customer_name}
                      {booking.customer_phone ? (
                        <>
                          <br />
                          <span className="muted small">
                            {booking.customer_phone}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>{booking.service_name_snapshot}</td>
                    <td>{formatCents(booking.price_cents_snapshot)}</td>
                    <td>
                      <span
                        className={`status-pill ${BOOKING_STATUS_CLASSES[booking.status] ?? ""}`}
                      >
                        {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                      </span>
                    </td>
                    <td>
                      <BookingActions booking={booking} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
