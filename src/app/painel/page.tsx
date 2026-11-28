import {
  getOwnedProvider,
  listProviderBookingsForPanel,
  requireUser,
} from "@/server/bookings";
import { listExceptions, listRules, listServicesForOwner } from "@/server/services";
import { ProviderForm, ProviderPanelMenu } from "./painel-client";
import { BookingAgenda } from "./booking-agenda";
import { logoutAction } from "../(auth)/actions";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { NotificationBell } from "@/components/notification-bell";
import { AccountModeSwitcher } from "@/components/account-mode-switcher";
import { countUnreadNotifications } from "@/server/notifications";
import { listNotificationPreferences } from "@/server/notification-preferences";
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

  const [
    services,
    rules,
    exceptions,
    agenda,
    discoveryEnabled,
    notificationPreferences,
  ] = await Promise.all([
    listServicesForOwner(provider.id),
    listRules(provider.id),
    listExceptions(provider.id),
    listProviderBookingsForPanel(provider.id),
    isSocialFeatureEnabled("social_discovery", { providerId: provider.id }),
    listNotificationPreferences("provider"),
  ]);
  const { bookings, failed: bookingsFailed } = agenda;

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
        notificationPreferences={notificationPreferences}
        bookingsContent={<BookingAgenda bookings={bookings} failed={bookingsFailed} />}
      />
    </main>
  );
}
