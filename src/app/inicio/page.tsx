import Link from "next/link";
import { AccountModeSwitcher } from "@/components/account-mode-switcher";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getOwnedProvider, requireUser } from "@/server/bookings";
import { getPreferredMode } from "@/server/identity";
import { logoutAction } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ modeError?: string }>;
}) {
  const params = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <main className="page-shell page-account-home">
        <SupabaseConfigWarning />
      </main>
    );
  }

  const user = await requireUser("/inicio");
  const supabase = await createClient();
  const [provider, { data: profile }, activeMode] = await Promise.all([
    getOwnedProvider(user.id),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    getPreferredMode(),
  ]);

  const metadataName = user.user_metadata?.display_name ?? user.user_metadata?.name;
  const name =
    (typeof profile?.display_name === "string" && profile.display_name.trim()) ||
    (typeof metadataName === "string" && metadataName.trim()) ||
    "sua conta";

  return (
    <main className="page-shell page-account-home">
      <header className="painel-header">
        <div>
          <span className="eyebrow">ESPAÇO DA SUA CONTA</span>
          <h1>Olá, {name}</h1>
          <p className="muted">Uma conta para seus agendamentos e seu negócio.</p>
        </div>
        <div className="item-actions">
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost">Sair</button>
          </form>
        </div>
      </header>

      {params.modeError === "1" ? (
        <p className="alert alert-error" role="alert">
          Não foi possível salvar essa preferência agora. Tente novamente.
        </p>
      ) : null}

      <AccountModeSwitcher
        activeMode={activeMode}
        hasProvider={Boolean(provider)}
      />

      <section className="identity-mode-grid" aria-label="Áreas do Marcou">
        <article className="identity-mode-card">
          <span className="eyebrow">PARA VOCÊ</span>
          <h2>Área do cliente</h2>
          <p className="muted">
            Consulte suas reservas, atualizações e dados pessoais.
          </p>
          <div className="item-actions">
            <Link href="/minha-conta" className="btn">Minha conta</Link>
            <Link href="/meus-agendamentos" className="btn btn-ghost">
              Meus agendamentos
            </Link>
          </div>
        </article>

        <article className="identity-mode-card">
          <span className="eyebrow">PARA SEU NEGÓCIO</span>
          <h2>{provider ? provider.display_name : "Área profissional"}</h2>
          <p className="muted">
            {provider
              ? "Gerencie sua agenda, serviços e página pública."
              : "Crie uma página de negócio vinculada à mesma conta, sem perder sua área de cliente."}
          </p>
          <Link href="/painel" className="btn btn-ghost">
            {provider ? "Abrir painel profissional" : "Configurar meu negócio"}
          </Link>
        </article>
      </section>
    </main>
  );
}
