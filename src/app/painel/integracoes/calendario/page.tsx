import Link from "next/link";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { isSupabaseConfigured } from "@/lib/env";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
import { calendarRuntime } from "@/server/calendar/runtime";
import { getCalendarIntegrationView, type CalendarIntegrationState } from "@/server/calendar/status";
import { CalendarDisconnectForm } from "./disconnect-form";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  connected: "Google Calendar conectado.",
  disconnected: "Integração desconectada e eventos removidos.",
  disconnecting: "Desconexão em andamento. Os eventos sincronizados estão sendo removidos em segundo plano.",
  "disconnected-orphaned":
    "Integração desconectada, mas alguns eventos não puderam ser removidos porque o acesso foi revogado. Remova-os manualmente no Google Calendar.",
  denied: "Você cancelou ou negou a autorização.",
  "configuration-error": "Integração não configurada corretamente.",
  "connection-error": "Não foi possível completar a conexão.",
  "missing-refresh-token": "O Google não retornou autorização offline. Tente conectar novamente.",
  "insufficient-scope": "A permissão de gerenciar eventos do calendário não foi concedida. Tente novamente e marque a permissão.",
  "expired-state": "A autorização expirou ou já foi usada. Inicie novamente.",
  forbidden: "Esta autorização não pertence à sua conta.",
  "invalid-callback": "Retorno de autorização inválido. Inicie novamente.",
  "provider-required": "Configure seu negócio antes de conectar o calendário.",
  disabled: "Integração desativada.",
};

function ConnectForm({ label }: { label: string }) {
  return (
    <form action="/api/calendar/connect" method="post">
      <button type="submit" className="btn">
        {label}
      </button>
    </form>
  );
}

export default async function CalendarIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string | string[] }>;
}) {
  const params = await searchParams;
  const notice = Array.isArray(params.calendar) ? params.calendar[0] : params.calendar;
  if (!isSupabaseConfigured()) {
    return (
      <main className="page-shell page-painel">
        <header className="painel-header">
          <div>
            <span className="eyebrow">INTEGRAÇÕES</span>
            <h1>Google Calendar</h1>
          </div>
        </header>
        <SupabaseConfigWarning />
      </main>
    );
  }
  const user = await requireUser("/painel/integracoes/calendario");
  const provider = await getOwnedProvider(user.id);
  const enabled = isCalendarFeatureEnabled();

  let state: CalendarIntegrationState = "not_connected";
  let orphanedEvents = 0;
  let statusUnavailable = false;
  if (enabled && provider) {
    try {
      const view = await getCalendarIntegrationView(calendarRuntime().store, provider.id);
      state = view.state;
      orphanedEvents = view.orphanedEvents;
    } catch {
      statusUnavailable = true;
    }
  }

  return (
    <main className="page-shell page-painel">
      <header className="painel-header">
        <div>
          <span className="eyebrow">INTEGRAÇÕES</span>
          <h1>Google Calendar</h1>
          <p className="muted">Sincronização unidirecional dos agendamentos confirmados.</p>
        </div>
      </header>
      <section className="card form-stack">
        <Link href="/painel" className="btn btn-ghost">
          Voltar ao painel
        </Link>
        {notice && MESSAGES[notice] ? (
          <p className="alert" role="status">
            {MESSAGES[notice]}
          </p>
        ) : null}
        {orphanedEvents > 0 ? (
          <p className="alert alert-error">
            {orphanedEvents === 1
              ? "1 evento não pôde ser removido do seu Google Calendar."
              : `${orphanedEvents} eventos não puderam ser removidos do seu Google Calendar.`}{" "}
            Confira e remova manualmente, se necessário.
          </p>
        ) : null}
        {!enabled ? (
          <p className="muted">Integração desativada neste ambiente.</p>
        ) : !provider ? (
          <p className="muted">Configure seu negócio antes de conectar o calendário.</p>
        ) : statusUnavailable ? (
          <p className="alert alert-error">Não foi possível verificar o status da integração. Tente novamente mais tarde.</p>
        ) : state === "connected" ? (
          <>
            <p className="alert alert-success">Conta conectada.</p>
            <p>Somente o nome do serviço e horário são sincronizados. Dados do cliente não são enviados.</p>
            <CalendarDisconnectForm />
          </>
        ) : state === "disconnecting" ? (
          <p className="muted">
            Desconexão em andamento. Os eventos já sincronizados estão sendo removidos; depois disso o acesso é revogado.
          </p>
        ) : state === "reconnect_required" ? (
          <>
            <p className="alert alert-error">
              O Google recusou o acesso salvo (permissão revogada ou expirada). Reconecte para retomar a sincronização.
            </p>
            <ConnectForm label="Reconectar Google Calendar" />
            <CalendarDisconnectForm />
          </>
        ) : (
          <>
            <p>
              Conecte sua conta Google para enviar ao calendário os agendamentos confirmados e remover eventos cancelados ou
              expirados.
            </p>
            <p className="muted">Não enviamos nome, telefone ou e-mail do cliente.</p>
            <ConnectForm label="Conectar Google Calendar" />
          </>
        )}
      </section>
    </main>
  );
}
