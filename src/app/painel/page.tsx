import Link from "next/link";
import { getOwnedProvider, listProviderBookings, requireUser } from "@/server/bookings";
import { listExceptions, listRules, listServicesForOwner } from "@/server/services";
import { BookingAgenda } from "./booking-agenda";
import { AvailabilityManager, ProviderForm, ServicesManager } from "./painel-client";
import { logoutAction } from "../(auth)/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { NotificationBell } from "@/components/notification-bell";
import { countUnreadNotifications } from "@/server/notifications";

export const dynamic = "force-dynamic";

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
          <p className="muted">
            {provider.is_published ? (
              <>
                Página pública:{" "}
                <Link href={`/p/${provider.slug}`} target="_blank">
                  /p/{provider.slug}
                </Link>
              </>
            ) : (
              "Sua página pública ainda está desativada."
            )}
          </p>
        </div>
        <div className="item-actions">
          <Link href="/perfil?next=%2Fpainel" className="btn btn-ghost">Meu perfil</Link>
          <NotificationBell unreadCount={unread} />
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost">
              Sair
            </button>
          </form>
        </div>
      </header>

      <div className="painel-grid">
        <ProviderForm provider={provider} />
        <ServicesManager services={services} />
        <AvailabilityManager rules={rules} exceptions={exceptions} />
      </div>

      <BookingAgenda bookings={bookings} />

    </main>
  );
}
