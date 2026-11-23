import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConsentForm } from "./consent-form";
import styles from "./consent.module.css";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/identity";
import {
  listPendingLegalDocuments,
  type PendingLegalDocument,
} from "@/server/legal";
import { SupabaseConfigWarning } from "@/components/supabase-config-warning";

export const metadata: Metadata = {
  title: "Revisar documentos — Marcou",
  description: "Revisão e aceite explícito de documentos versionados do Marcou.",
};

export const dynamic = "force-dynamic";

export default async function LegalConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  if (!isSupabaseConfigured()) {
    return (
      <main className={styles.shell}>
        <div className={styles.card}>
          <h1>Revisar documentos</h1>
          <SupabaseConfigWarning />
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect(`/login?next=${encodeURIComponent(`/consentimento?next=${next}`)}`);
  }

  let pending: PendingLegalDocument[] = [];
  let loadError = false;
  try {
    pending = await listPendingLegalDocuments();
  } catch {
    pending = [];
    loadError = true;
  }

  return (
    <main className={styles.shell}>
      <nav className={styles.topbar} aria-label="Navegação principal">
        <Link className="brand brand-logo" href="/" aria-label="Marcou, início">
          <Image src="/branding/marcou-logo.svg" alt="Marcou." width={190} height={94} priority />
        </Link>
      </nav>

      <section className={styles.card} aria-labelledby="consent-title">
        <span className="eyebrow">DOCUMENTOS VERSIONADOS</span>
        <h1 id="consent-title">Revise antes de continuar</h1>
        <p className={styles.intro}>
          O Marcou registra somente o aceite explícito da versão e do hash que
          você consegue abrir e ler. Nenhuma opção vem marcada antecipadamente.
        </p>

        {loadError ? (
          <div className={styles.empty}>
            <p className="alert alert-error" role="alert">
              Não foi possível conferir as versões publicadas. Nenhum aceite foi
              presumido. Tente novamente depois ou consulte os documentos.
            </p>
            <div className={styles.links}>
              <Link href="/documentos">Consultar documentos</Link>
              <Link href="/" className="btn btn-ghost">Voltar ao início</Link>
            </div>
          </div>
        ) : pending.length > 0 ? (
          <ConsentForm
            next={next}
            documents={pending.map((document) => ({
              key: document.key,
              title: document.title,
              version: document.version,
              route: document.route,
              contentHash: document.contentHash,
              materialChangeSummary: document.materialChangeSummary,
            }))}
          />
        ) : (
          <div className={styles.empty}>
            <p>
              Não há documento vigente pendente para sua conta. As versões
              disponíveis hoje são minutas públicas e não exigem aceite.
            </p>
            <div className={styles.links}>
              <Link href="/documentos">Consultar minutas</Link>
              <Link href={next} className="btn">Continuar</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
