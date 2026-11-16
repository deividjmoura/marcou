import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { logoutAction } from "../(auth)/actions";
import { NotificationBell } from "@/components/notification-bell";
import { countUnreadNotifications } from "@/server/notifications";

export const dynamic = "force-dynamic";

export default async function MinhaContaPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="page-shell page-account">
        <SupabaseConfigWarning />
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=%2Fminha-conta");

  const [{ data: profile }, unread] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, phone, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    countUnreadNotifications(),
  ]);

  const name =
    profile?.display_name ??
    (typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : "Seu perfil");
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <main className="page-shell page-account">
      <header className="painel-header account-header">
        <div>
          <span className="eyebrow">ÁREA DO CLIENTE</span>
          <h1>Minha conta</h1>
          <p className="muted">Gerencie seus dados e acompanhe sua experiência no Marcou.</p>
        </div>
        <div className="item-actions">
          <NotificationBell unreadCount={unread} />
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost">Sair</button>
          </form>
        </div>
      </header>

      <section className="account-overview card">
        <div className="account-avatar" aria-hidden="true">{initials || "M"}</div>
        <div className="account-identity">
          <span className="eyebrow">SEU PERFIL</span>
          <h2>{name}</h2>
          <p className="muted">{user.email ?? "E-mail não disponível"}</p>
        </div>
        <Link href="/perfil?next=%2Fminha-conta" className="btn btn-ghost">
          Editar dados
        </Link>
      </section>

      <section className="account-section">
        <h2>Organize sua experiência</h2>
        <div className="account-links">
          <Link href="/meus-agendamentos" className="account-link card">
            <span className="account-link-icon" aria-hidden="true">▦</span>
            <span>
              <strong>Meus agendamentos</strong>
              <small className="muted">Consulte suas reservas e acompanhe cada etapa.</small>
            </span>
            <span className="account-arrow" aria-hidden="true">→</span>
          </Link>
          <Link href="/notificacoes" className="account-link card">
            <span className="account-link-icon" aria-hidden="true">♧</span>
            <span>
              <strong>Notificações</strong>
              <small className="muted">Veja atualizações importantes sobre suas reservas.</small>
            </span>
            <span className="account-arrow" aria-hidden="true">→</span>
          </Link>
          <Link href="/perfil?next=%2Fminha-conta" className="account-link card">
            <span className="account-link-icon" aria-hidden="true">◎</span>
            <span>
              <strong>Dados pessoais</strong>
              <small className="muted">Mantenha seu nome e telefone atualizados.</small>
            </span>
            <span className="account-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="card account-details">
        <h2>Dados da conta</h2>
        <dl>
          <div><dt>E-mail de acesso</dt><dd>{user.email ?? "—"}</dd></div>
          <div><dt>Telefone</dt><dd>{profile?.phone || "Não informado"}</dd></div>
          <div><dt>Conta criada em</dt><dd>{profile?.created_at ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(profile.created_at)) : "—"}</dd></div>
        </dl>
      </section>

      <section className="card account-danger">
        <div>
          <span className="eyebrow">ZONA DE ATENÇÃO</span>
          <h2>Excluir minha conta</h2>
          <p className="muted">
            Se decidir sair do Marcou, você poderá solicitar a exclusão da conta.
            Antes da confirmação, mostraremos quais dados serão removidos e se há
            agendamentos futuros que serão cancelados.
          </p>
          <p className="small muted">
            A exclusão ainda está sendo preparada e não está disponível nesta versão.
          </p>
        </div>
        <button type="button" className="btn btn-danger" disabled>
          Exclusão em breve
        </button>
      </section>
    </main>
  );
}
