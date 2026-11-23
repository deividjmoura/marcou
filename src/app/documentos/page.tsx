import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { legalDocuments } from "@/lib/legal/documents";
import styles from "./documents.module.css";

export const metadata: Metadata = {
  title: "Documentos e políticas — Marcou",
  description: "Versões e situação dos documentos de uso, privacidade e comunidade do Marcou.",
};

const statusLabels = {
  draft: "Minuta não vigente",
  published: "Versão vigente",
  retired: "Versão substituída",
} as const;

export default function DocumentsPage() {
  return (
    <main className={styles.shell}>
      <nav className={styles.topbar} aria-label="Navegação principal">
        <Link className="brand brand-logo" href="/" aria-label="Marcou, início">
          <Image src="/branding/marcou-logo.svg" alt="Marcou." width={190} height={94} priority />
        </Link>
        <Link href="/" className="btn btn-ghost btn-small">Voltar ao início</Link>
      </nav>

      <header className={styles.header}>
        <span className="eyebrow">TRANSPARÊNCIA E VERSÕES</span>
        <h1>Documentos e políticas</h1>
        <p>
          Consulte o texto, a versão, a situação e o hash de cada documento. As
          minutas são públicas para revisão, mas não são apresentadas como
          aprovadas nem geram aceite.
        </p>
      </header>

      <section className={styles.notice} aria-labelledby="documents-current-state">
        <h2 id="documents-current-state">Situação atual</h2>
        <p>
          Todos os documentos abaixo são minutas não vigentes. Antes de uma
          publicação obrigatória, ainda serão necessários confirmação da pessoa
          operadora e dos fornecedores, decisões de produto e revisão jurídica.
        </p>
      </section>

      <section className={styles.grid} aria-label="Lista de documentos">
        {legalDocuments.map((document) => (
          <article className={styles.card} key={document.key}>
            <span className={styles.status} data-status={document.status}>
              {statusLabels[document.status]}
            </span>
            <h2>{document.title}</h2>
            <p>{document.materialChangeSummary}</p>
            <dl>
              <div><dt>Versão</dt><dd>{document.version}</dd></div>
              <div><dt>Atualização</dt><dd>{document.updatedAt}</dd></div>
            </dl>
            <Link href={document.route}>Ler documento <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </section>

      <section className={styles.versioning} aria-labelledby="versioning-title">
        <h2 id="versioning-title">Como funcionará o aceite</h2>
        <ol>
          <li>Uma revisão aprovada recebe nova versão e hash SHA-256.</li>
          <li>Mudanças materiais podem ser marcadas como obrigatórias.</li>
          <li>Cada documento é apresentado separadamente, sem caixas pré-marcadas.</li>
          <li>O recibo registra usuário, versão, hash e instante do aceite.</li>
          <li>Uma nova versão material exige novo aceite; versões informativas não bloqueiam.</li>
        </ol>
        <p>
          Recusar um documento contratual obrigatório significa não continuar em
          funcionalidades autenticadas que dependam dele. Consentimentos de
          privacidade opcionais terão controles próprios e revogáveis.
        </p>
      </section>
    </main>
  );
}
