"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  acceptLegalDocumentsAction,
  declineLegalDocumentsAction,
  type LegalConsentState,
} from "./actions";
import styles from "./consent.module.css";

interface ConsentDocument {
  key: string;
  title: string;
  version: string;
  route: string;
  contentHash: string;
  materialChangeSummary: string;
}

const initialState: LegalConsentState = {};

export function ConsentForm({
  documents,
  next,
}: {
  documents: ConsentDocument[];
  next: string;
}) {
  const [state, formAction, pending] = useActionState(
    acceptLegalDocumentsAction,
    initialState,
  );

  return (
    <div className={styles.actions}>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="next" value={next} />
        <fieldset disabled={pending}>
          <legend>Confirme cada documento separadamente</legend>
          {documents.map((document) => (
            <label className={styles.choice} key={document.key}>
              <input
                type="checkbox"
                name="documents"
                required
                value={JSON.stringify({
                  documentKey: document.key,
                  version: document.version,
                  contentHash: document.contentHash,
                })}
              />
              <span>
                Li e aceito <Link href={document.route} target="_blank" rel="noopener noreferrer">
                  {document.title}, versão {document.version}
                </Link>.
                <small>{document.materialChangeSummary}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {state.error ? <p className="alert alert-error" role="alert">{state.error}</p> : null}
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Registrando..." : "Aceitar e continuar"}
        </button>
      </form>

      <div className={styles.decline}>
        <p>
          Você pode recusar. Nesse caso, encerraremos a sessão sem registrar
          aceite e as funcionalidades autenticadas obrigatórias não continuarão.
        </p>
        <form action={declineLegalDocumentsAction}>
          <button className="btn btn-ghost" type="submit" disabled={pending}>
            Não aceitar e sair
          </button>
        </form>
      </div>
    </div>
  );
}
