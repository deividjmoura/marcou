import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { logoutAction } from "../(auth)/actions";
import { NotificationBell } from "@/components/notification-bell";
import { AccountModeSwitcher } from "@/components/account-mode-switcher";
import { countUnreadNotifications } from "@/server/notifications";
import { getOwnedProvider } from "@/server/bookings";
import { getPreferredMode } from "@/server/identity";
import styles from "./account.module.css";

export const dynamic = "force-dynamic";

export default async function MinhaContaPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className={`page-shell ${styles.page}`}>
        <SupabaseConfigWarning />
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=%2Fminha-conta");

  const [{ data: profile }, unread, provider, activeMode] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, phone, created_at")
      .eq("id", user.id)
      .maybeSingle(),
    countUnreadNotifications(),
    getOwnedProvider(user.id),
    getPreferredMode(),
  ]);

  const metadataName = user.user_metadata?.display_name;
  const name: string =
    (typeof profile?.display_name === "string" && profile.display_name.trim()) ||
    (typeof metadataName === "string" && metadataName.trim()) ||
    "Seu perfil";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toLocaleUpperCase("pt-BR") ?? "")
    .join("");

  const createdAt = profile?.created_at
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(profile.created_at))
    : "—";

  return (
    <main className={`page-shell ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <span className="eyebrow">ÁREA DO CLIENTE</span>
          <h1>Minha conta</h1>
          <p className="muted">Tudo o que você precisa para acompanhar seus horários.</p>
        </div>
        <div className={styles.headerActions}>
          <NotificationBell unreadCount={unread} />
          <Link href="/inicio" className="btn btn-ghost">Trocar área</Link>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost">Sair</button>
          </form>
        </div>
      </header>

      <section className={styles.profile} aria-labelledby="account-name">
        <div className={styles.avatar} aria-hidden="true">{initials || "M"}</div>
        <div className={styles.profileText}>
          <span className="eyebrow">SEU PERFIL</span>
          <h2 id="account-name">{name}</h2>
          <p className="muted">{user.email ?? "E-mail não disponível"}</p>
        </div>
        <Link href="/perfil?next=%2Fminha-conta" className="btn btn-ghost">
          Editar dados
        </Link>
      </section>

      <div className={styles.modeSwitcher}>
        <AccountModeSwitcher
          activeMode={activeMode}
          hasProvider={Boolean(provider)}
        />
      </div>

      <section className={styles.section} aria-labelledby="account-shortcuts">
        <div className={styles.sectionHeading}>
          <div>
            <span className="eyebrow">ACESSO RÁPIDO</span>
            <h2 id="account-shortcuts">Sua experiência</h2>
          </div>
        </div>
        <nav className={styles.shortcuts} aria-label="Atalhos da conta">
          <Link href="/meus-agendamentos" className={styles.shortcut}>
            <svg className={styles.shortcutIcon} aria-hidden="true" viewBox="0 0 48 48">
              <use href="/icons/navigation/sprite.svg#ic-agenda" />
            </svg>
            <span className={styles.shortcutText}>
              <strong>Meus agendamentos</strong>
              <small>Consulte suas reservas e acompanhe cada etapa.</small>
            </span>
            <span className={styles.arrow} aria-hidden="true">→</span>
          </Link>
          <Link href="/notificacoes" className={styles.shortcut}>
            <svg className={styles.shortcutIcon} aria-hidden="true" viewBox="0 0 48 48">
              <use href="/icons/navigation/sprite.svg#ic-notificacoes" />
            </svg>
            <span className={styles.shortcutText}>
              <strong>Notificações</strong>
              <small>Veja atualizações importantes sobre suas reservas.</small>
            </span>
            {unread > 0 ? <span className={styles.count}>{unread > 99 ? "99+" : unread}</span> : null}
            <span className={styles.arrow} aria-hidden="true">→</span>
          </Link>
          <Link href="/perfil?next=%2Fminha-conta" className={styles.shortcut}>
            <svg className={styles.shortcutIcon} aria-hidden="true" viewBox="0 0 48 48">
              <use href="/icons/navigation/sprite.svg#ic-perfil" />
            </svg>
            <span className={styles.shortcutText}>
              <strong>Dados pessoais</strong>
              <small>Mantenha seu nome e telefone atualizados.</small>
            </span>
            <span className={styles.arrow} aria-hidden="true">→</span>
          </Link>
          <Link href="/documentos" className={styles.shortcut}>
            <svg className={styles.shortcutIcon} aria-hidden="true" viewBox="0 0 48 48">
              <use href="/icons/navigation/sprite.svg#ic-ajustes" />
            </svg>
            <span className={styles.shortcutText}>
              <strong>Documentos e privacidade</strong>
              <small>Consulte versões, situação e políticas do Marcou.</small>
            </span>
            <span className={styles.arrow} aria-hidden="true">→</span>
          </Link>
        </nav>
      </section>

      <section className={styles.details} aria-labelledby="account-details-title">
        <div className={styles.detailsHeading}>
          <span className="eyebrow">INFORMAÇÕES</span>
          <h2 id="account-details-title">Dados da conta</h2>
        </div>
        <dl className={styles.detailGrid}>
          <div>
            <dt>E-mail de acesso</dt>
            <dd>{user.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{profile?.phone || "Não informado"}</dd>
          </div>
          <div>
            <dt>Cliente desde</dt>
            <dd>{createdAt}</dd>
          </div>
        </dl>
      </section>

      <aside className={styles.notice}>
        <div>
          <strong>Sobre a exclusão da conta</strong>
          <p className="muted">
            Estamos preparando essa opção com cuidado para informar os efeitos sobre
            seus dados e eventuais agendamentos futuros antes de qualquer confirmação.
          </p>
        </div>
        <span>Em breve</span>
      </aside>
    </main>
  );
}
