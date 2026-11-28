export const NOTIFICATION_EVENT_TYPES = [
  "booking.created",
  "booking.proof_received",
  "booking.confirmed",
  "booking.reminder",
  "booking.expired",
  "booking.cancelled",
  "booking.changed",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationAudience = "customer" | "provider";

export const MANDATORY_IN_APP_EVENTS: readonly NotificationEventType[] = [
  "booking.cancelled",
  "booking.changed",
];

export interface NotificationPreferenceRow {
  event_type: NotificationEventType;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationPreferenceUpdate {
  eventType: NotificationEventType;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationEventDefinition {
  eventType: NotificationEventType;
  audiences: readonly NotificationAudience[];
  mandatoryInApp: boolean;
  mandatoryReason?: string;
  comingSoon?: boolean;
  customerLabel: string;
  customerDescription: string;
  providerLabel: string;
  providerDescription: string;
}

export interface ResolvedNotificationPreference {
  eventType: NotificationEventType;
  label: string;
  description: string;
  mandatoryInApp: boolean;
  mandatoryReason?: string;
  comingSoon?: boolean;
  inAppEnabled: boolean;
  emailEnabled: boolean;
}

export const NOTIFICATION_EVENT_CATALOG: readonly NotificationEventDefinition[] = [
  {
    eventType: "booking.created",
    audiences: ["customer", "provider"],
    mandatoryInApp: false,
    customerLabel: "Solicitação registrada",
    customerDescription: "Quando você enviar um novo pedido de agendamento.",
    providerLabel: "Novo agendamento recebido",
    providerDescription: "Quando um cliente solicitar um horário na sua agenda.",
  },
  {
    eventType: "booking.proof_received",
    audiences: ["provider"],
    mandatoryInApp: false,
    customerLabel: "Comprovante enviado",
    customerDescription: "Confirmação interna para o profissional.",
    providerLabel: "Comprovante recebido",
    providerDescription: "Quando o cliente enviar o comprovante de sinal da reserva.",
  },
  {
    eventType: "booking.confirmed",
    audiences: ["customer", "provider"],
    mandatoryInApp: false,
    customerLabel: "Agendamento confirmado",
    customerDescription: "Quando o profissional aprovar e confirmar seu horário.",
    providerLabel: "Agendamento confirmado",
    providerDescription: "Registro no aplicativo quando uma reserva for confirmada.",
  },
  {
    eventType: "booking.reminder",
    audiences: ["customer", "provider"],
    mandatoryInApp: false,
    customerLabel: "Lembrete de horário",
    customerDescription: "Aviso antecipado antes do início do seu agendamento confirmado.",
    providerLabel: "Lembrete de horário",
    providerDescription: "Aviso antecipado antes dos seus agendamentos confirmados.",
  },
  {
    eventType: "booking.expired",
    audiences: ["customer", "provider"],
    mandatoryInApp: false,
    customerLabel: "Reserva expirada",
    customerDescription: "Quando o prazo da reserva temporária encerrar sem confirmação.",
    providerLabel: "Reserva expirada",
    providerDescription: "Quando uma reserva temporária expirar e o horário voltar a ficar livre.",
  },
  {
    eventType: "booking.cancelled",
    audiences: ["customer", "provider"],
    mandatoryInApp: true,
    mandatoryReason:
      "Obrigatório: alertas de cancelamento não podem ser silenciados para evitar desencontros no atendimento.",
    customerLabel: "Cancelamento de agendamento",
    customerDescription: "Quando um agendamento for cancelado por você ou pelo profissional.",
    providerLabel: "Cancelamento de agendamento",
    providerDescription: "Quando um agendamento for cancelado por você ou pelo cliente.",
  },
  {
    eventType: "booking.changed",
    audiences: ["customer", "provider"],
    mandatoryInApp: true,
    comingSoon: true,
    mandatoryReason:
      "Obrigatório: alertas de alteração de horário não podem ser silenciados (passa a emitir assim que o reagendamento for liberado).",
    customerLabel: "Alteração de horário ou reagendamento",
    customerDescription: "Quando houver alteração no horário ou nos detalhes do agendamento.",
    providerLabel: "Alteração de horário ou reagendamento",
    providerDescription: "Quando houver alteração no horário ou nos detalhes de um agendamento.",
  },
];

export function isNotificationAudience(value: unknown): value is NotificationAudience {
  return value === "customer" || value === "provider";
}

export function isNotificationEventType(value: unknown): value is NotificationEventType {
  return (
    typeof value === "string" &&
    (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export function isMandatoryNotification(
  eventType: NotificationEventType,
  channel: NotificationChannel,
): boolean {
  return channel === "in_app" && MANDATORY_IN_APP_EVENTS.includes(eventType);
}

/**
 * Padrão documentado em `docs/NOTIFICACOES.md`:
 * - `in_app`: ligado por padrão (`true`);
 * - `email`: desligado por padrão (`false`) até haver provedor configurado (#26).
 */
export function getDefaultNotificationEnabled(
  eventType: NotificationEventType,
  channel: NotificationChannel,
): boolean {
  if (isMandatoryNotification(eventType, channel)) return true;
  return channel === "in_app";
}

export function listEventsForAudience(
  audience: NotificationAudience,
): readonly NotificationEventDefinition[] {
  return NOTIFICATION_EVENT_CATALOG.filter((item) =>
    item.audiences.includes(audience),
  );
}

export function resolveNotificationPreferences(
  rows: readonly NotificationPreferenceRow[],
  audience: NotificationAudience,
): ResolvedNotificationPreference[] {
  const byKey = new Map<string, boolean>();
  for (const row of rows) {
    byKey.set(`${row.event_type}:${row.channel}`, Boolean(row.enabled));
  }

  return listEventsForAudience(audience).map((item) => {
    const rawInApp = byKey.get(`${item.eventType}:in_app`);
    const rawEmail = byKey.get(`${item.eventType}:email`);

    const inAppEnabled = item.mandatoryInApp
      ? true
      : (rawInApp ?? getDefaultNotificationEnabled(item.eventType, "in_app"));
    const emailEnabled =
      rawEmail ?? getDefaultNotificationEnabled(item.eventType, "email");

    return {
      eventType: item.eventType,
      label: audience === "provider" ? item.providerLabel : item.customerLabel,
      description:
        audience === "provider"
          ? item.providerDescription
          : item.customerDescription,
      mandatoryInApp: item.mandatoryInApp,
      mandatoryReason: item.mandatoryReason,
      comingSoon: item.comingSoon,
      inAppEnabled,
      emailEnabled,
    };
  });
}

export function notificationPreferenceFieldName(
  eventType: NotificationEventType,
  channel: NotificationChannel = "in_app",
): string {
  return `pref:${eventType}:${channel}`;
}

/**
 * Lê o estado dos checkboxes da seção (`in_app`) e devolve apenas atualizações
 * válidas para a audiência solicitada. Eventos obrigatórios são sempre gravados
 * como `enabled: true`, mesmo que o payload enviado tente silenciá-los.
 */
export function parseNotificationPreferencesFormData(
  formData: FormData,
  audience: NotificationAudience,
): NotificationPreferenceUpdate[] {
  return listEventsForAudience(audience).map((item) => {
    if (item.mandatoryInApp) {
      return {
        eventType: item.eventType,
        channel: "in_app",
        enabled: true,
      };
    }

    const fieldName = notificationPreferenceFieldName(item.eventType, "in_app");
    const values = formData.getAll(fieldName).map((value) => String(value));
    const enabled = values.includes("on") || values.includes("true");

    return {
      eventType: item.eventType,
      channel: "in_app",
      enabled,
    };
  });
}
