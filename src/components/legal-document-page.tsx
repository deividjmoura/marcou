import Image from "next/image";
import Link from "next/link";
import {
  getLegalDocument,
  type LegalDocumentKey,
} from "@/lib/legal/documents";
import styles from "./legal-document.module.css";

const statusLabels = {
  draft: "Minuta não vigente",
  published: "Versão vigente",
  retired: "Versão substituída",
} as const;

export function LegalDocumentPage({ documentKey }: { documentKey: LegalDocumentKey }) {
  const document = getLegalDocument(documentKey);

  return (
    <main className={styles.shell}>
      <nav className={styles.topbar} aria-label="Navegação dos documentos">
        <Link className="brand brand-logo" href="/" aria-label="Marcou, início">
          <Image src="/branding/marcou-logo.svg" alt="Marcou." width={190} height={94} />
        </Link>
        <Link href="/documentos" className="btn btn-ghost btn-small">
          Todos os documentos
        </Link>
      </nav>

      <article className={styles.document}>
        <header className={styles.header}>
          <span className={styles.status} data-status={document.status}>
            {statusLabels[document.status]}
          </span>
          <h1>{document.title}</h1>
          <p className={styles.summary}>{document.materialChangeSummary}</p>
          <dl className={styles.metadata}>
            <div>
              <dt>Versão</dt>
              <dd>{document.version}</dd>
            </div>
            <div>
              <dt>Atualizada em</dt>
              <dd>
                <time dateTime={document.updatedAt}>
                  {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
                    new Date(`${document.updatedAt}T00:00:00.000Z`),
                  )}
                </time>
              </dd>
            </div>
            <div>
              <dt>SHA-256</dt>
              <dd><code>{document.contentHash}</code></dd>
            </div>
          </dl>
        </header>

        <aside className={styles.warning} aria-label="Aviso sobre a minuta">
          <strong>Documento em revisão</strong>
          <p>{document.reviewNotice}</p>
        </aside>

        <div className={styles.content}>
          {document.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets?.length ? (
                <ul>
                  {section.bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>

      <footer className={styles.footer}>
        <p>Estes textos são versionados. A situação de cada versão aparece no topo.</p>
        <nav aria-label="Outros documentos">
          <Link href="/termos">Termos</Link>
          <Link href="/privacidade">Privacidade</Link>
          <Link href="/diretrizes-da-comunidade">Comunidade</Link>
          <Link href="/politica-de-conteudo-e-avaliacoes">Conteúdo e avaliações</Link>
        </nav>
      </footer>
    </main>
  );
}
