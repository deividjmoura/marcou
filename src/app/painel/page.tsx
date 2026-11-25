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
import { logoutAction } from "../(auth)/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { NotificationBell } from "@/components/notification-bell";
import { AccountModeSwitcher } from "@/components/account-mode-switcher";
import { countUnreadNotifications } from "@/server/notifications";
import { isSocialFeatureEnabled } from "@/server/feature-flags";
import {
  listCategorySuggestions,
  listProviderServiceAreas,
  listServiceCategories,
} from "@/server/discovery";
import {
  getPreferredMode,
  measureAuthFlow,
  measureAuthStep,
} from "@/server/identity";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";

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

  const { provider, unread, activeMode } = await measureAuthFlow(
    "account_bootstrap",
    async (setOutcome) => {
      const currentUser = await measureAuthStep("auth_get_user", () =>
        requireUser("/painel"),
      );
      const [ownedProvider, unreadCount, preferredMode] = await measureAuthStep(
        "load_account_context",
        () =>
          Promise.all([
            getOwnedProvider(currentUser.id),
            countUnreadNotifications(),
            getPreferredMode(),
          ]),
      );
      setOutcome("loaded");
      return {
        provider: ownedProvider,
        unread: unreadCount,
        activeMode: preferredMode,
      };
    },
  );

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

        <AccountModeSwitcher activeMode={activeMode} hasProvider={false} />
        <ProviderForm provider={null} />
      </main>
    );
  }

  const [services, rules, exceptions, bookings, discoveryEnabled] =
    await Promise.all([
      listServicesForOwner(provider.id),
      listRules(provider.id),
      listExceptions(provider.id),
      listProviderBookings(provider.id),
      isSocialFeatureEnabled("social_discovery", { providerId: provider.id }),
    ]);

  const [categories, serviceAreas, categorySuggestions] = discoveryEnabled
    ? await Promise.all([
        listServiceCategories(),
        listProviderServiceAreas(provider.id),
        listCategorySuggestions(provider.id),
      ])
    : [[], [], []];

  return (
    <main className="page-shell page-painel">
      <header className="painel-header">
        <div>
          <span className="eyebrow">PAINEL DO PRESTADOR</span>
          <h1>{provider.display_name}</h1>
          <p className="muted">Acompanhe e gerencie seus agendamentos.</p>
        </div>
      </header>

      <AccountModeSwitcher activeMode={activeMode} hasProvider />

      {isCalendarFeatureEnabled() ? (
        <section className="card">
          <h2>Integrações</h2>
          <p className="muted">Sincronize os agendamentos confirmados com seu Google Calendar.</p>
          <Link className="btn btn-ghost" href="/painel/integracoes/calendario">Google Calendar</Link>
        </section>
      ) : null}

      <ProviderPanelMenu
        provider={provider}
        services={services}
        rules={rules}
        exceptions={exceptions}
        discoveryEnabled={discoveryEnabled}
        categories={categories}
        serviceAreas={serviceAreas}
        categorySuggestions={categorySuggestions}
        unreadCount={unread}
        bookingsContent={(
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
        )}
      />
    </main>
  );
}
