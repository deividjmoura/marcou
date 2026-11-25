import Link from "next/link";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { calendarAdminClient } from "@/server/calendar/admin";
import { isCalendarFeatureEnabled } from "@/server/calendar/crypto";
import { CalendarDisconnectForm } from "./disconnect-form";
export const dynamic = "force-dynamic";
export default async function CalendarIntegrationPage({ searchParams }: { searchParams: Promise<{ calendar?: string | string[] }> }) {
  const params = await searchParams, notice = Array.isArray(params.calendar) ? params.calendar[0] : params.calendar, user = await requireUser("/painel/integracoes/calendario");
  const provider = await getOwnedProvider(user.id);
  const enabled = isCalendarFeatureEnabled();
  let isConnected = false, statusUnavailable = false;
  if (enabled && provider) {
    try {
      const { data, error } = await calendarAdminClient().from("provider_calendar_connections").select("connection_status").eq("provider_id", provider.id).maybeSingle();
      if (error) statusUnavailable = true;
      else isConnected = data?.connection_status === "connected";
    } catch { statusUnavailable = true; }
  }
  const messages: Record<string,string> = {
    connected: "Google Calendar conectado.", disconnected: "Integração desconectada.",
    "disconnected-cleanup-warning": "Desconectado, mas alguns eventos podem não ter sido removidos. Confira seu Google Calendar.",
    denied: "Você cancelou ou negou a autorização.", "configuration-error": "Integração não configurada corretamente.",
    "connection-error": "Não foi possível completar a conexão.", "missing-refresh-token": "O Google não retornou autorização offline. Tente conectar novamente.",
    "expired-state": "A autorização expirou. Inicie novamente.", disabled: "Integração desativada.",
  };
  return <main className="page-shell page-painel">
    <header className="painel-header"><div><span className="eyebrow">INTEGRAÇÕES</span><h1>Google Calendar</h1><p className="muted">Sincronização unidirecional dos agendamentos confirmados.</p></div></header>
    <section className="card form-stack">
      <Link href="/painel" className="btn btn-ghost">Voltar ao painel</Link>
      {notice && messages[notice] ? <p className="alert" role="status">{messages[notice]}</p> : null}
      {!enabled ? <p className="muted">Integração desativada neste ambiente.</p> : !provider ? <p className="muted">Configure seu negócio antes de conectar o calendário.</p> : statusUnavailable ? <p className="alert alert-error">Não foi possível verificar o status da integração. Tente novamente mais tarde.</p> : isConnected ? <>
        <p className="alert alert-success">Conta conectada.</p>
        <p>Somente o nome do serviço e horário são sincronizados. Dados do cliente não são enviados.</p>
        <CalendarDisconnectForm />
      </> : <>
        <p>Conecte sua conta Google para enviar ao calendário os agendamentos confirmados e remover eventos cancelados ou expirados.</p>
        <p className="muted">Não enviamos nome, telefone ou e-mail do cliente.</p>
        <Link className="btn" href="/api/calendar/connect">Conectar Google Calendar</Link>
      </>}
    </section>
  </main>;
}
