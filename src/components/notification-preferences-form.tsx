"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  notificationPreferenceFieldName,
  type NotificationAudience,
  type NotificationEventType,
  type ResolvedNotificationPreference,
} from "@/domain/notifications/preferences";
import {
  saveNotificationPreferencesAction,
  type NotificationPreferencesActionState,
} from "@/app/notificacoes/actions";
import styles from "./notification-preferences.module.css";

interface NotificationPreferencesFormProps {
  audience: NotificationAudience;
  initialPreferences: ResolvedNotificationPreference[];
  headingId?: string;
}

export function NotificationPreferencesForm({
  audience,
  initialPreferences,
  headingId = "notification-preferences-heading",
}: NotificationPreferencesFormProps) {
  const [state, action, pending] = useActionState<
    NotificationPreferencesActionState,
    FormData
  >(saveNotificationPreferencesAction, {});

  const [enabledByEvent, setEnabledByEvent] = useState<
    Record<NotificationEventType, boolean>
  >(() => {
    const initial = {} as Record<NotificationEventType, boolean>;
    for (const item of initialPreferences) {
      initial[item.eventType] = item.mandatoryInApp ? true : item.inAppEnabled;
    }
    return initial;
  });

  function toggleEvent(eventType: NotificationEventType, nextValue: boolean) {
    setEnabledByEvent((current) => ({
      ...current,
      [eventType]: nextValue,
    }));
  }

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.header}>
        <div>
          <span className="eyebrow">NOTIFICAÇÕES</span>
          <h2 id={headingId}>Preferências de alertas</h2>
          <p className={styles.lead}>
            {audience === "provider"
              ? "Escolha quais atualizações da sua agenda deseja receber no aplicativo."
              : "Escolha quais atualizações sobre suas reservas deseja receber no aplicativo."}
          </p>
        </div>
        <Link href="/notificacoes" className="btn btn-small btn-ghost">
          Ver notificações
        </Link>
      </div>

      <div className={styles.channelMeta}>
        <span>
          <strong>No aplicativo:</strong> ativo por padrão.
        </span>
        <span>
          <strong>E-mail:</strong> desligado por padrão até a ativação de um
          provedor de envio (nenhum e-mail é enviado nesta versão).
        </span>
      </div>

      <form action={action} className="form-stack">
        <input type="hidden" name="audience" value={audience} />

        {state.error ? (
          <p className="alert alert-error" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="alert alert-success" role="status">
            {state.success}
          </p>
        ) : null}

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Alertas no aplicativo</legend>
          <ul className={styles.list}>
            {initialPreferences.map((item) => {
              const fieldName = notificationPreferenceFieldName(
                item.eventType,
                "in_app",
              );
              const inputId = `${audience}-${item.eventType}-in-app`;
              const descId = `${inputId}-desc`;
              const mandatoryId = `${inputId}-mandatory`;
              const checked = item.mandatoryInApp
                ? true
                : Boolean(enabledByEvent[item.eventType]);

              return (
                <li
                  key={item.eventType}
                  className={`${styles.row} ${
                    item.mandatoryInApp ? styles.rowMandatory : ""
                  }`}
                >
                  <div className={styles.rowBody}>
                    <div className={styles.titleLine}>
                      <strong>{item.label}</strong>
                      {item.mandatoryInApp ? (
                        <span className={styles.badgeMandatory}>
                          Obrigatório
                        </span>
                      ) : null}
                      {item.comingSoon ? (
                        <span className={styles.badgeSoon}>Em breve</span>
                      ) : null}
                    </div>
                    <p id={descId} className={styles.description}>
                      {item.description}
                    </p>
                    {item.mandatoryInApp && item.mandatoryReason ? (
                      <p id={mandatoryId} className={styles.mandatoryNote}>
                        {item.mandatoryReason}
                      </p>
                    ) : null}
                  </div>

                  <label
                    htmlFor={inputId}
                    className={`${styles.toggleLabel} ${
                      item.mandatoryInApp ? styles.toggleLabelDisabled : ""
                    }`}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      name={fieldName}
                      value="on"
                      className={styles.toggleInput}
                      checked={checked}
                      disabled={item.mandatoryInApp || pending}
                      aria-describedby={
                        item.mandatoryInApp ? `${descId} ${mandatoryId}` : descId
                      }
                      onChange={(event) => {
                        if (!item.mandatoryInApp) {
                          toggleEvent(item.eventType, event.target.checked);
                        }
                      }}
                    />
                    <span>{item.mandatoryInApp ? "Sempre ativo" : "No app"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className={styles.footer}>
          <p className={styles.privacyNote}>
            As notificações mostram apenas o serviço e o horário da reserva, sem
            dados pessoais de terceiros. Eventos obrigatórios de cancelamento e
            alteração de horário não podem ser silenciados.
          </p>
          <div className={styles.actions}>
            <button type="submit" className="btn" disabled={pending}>
              {pending ? "Salvando..." : "Salvar preferências"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
