import type { NotificationEventType } from "@/domain/notifications/preferences";

export type EmailRecipientRole = "customer" | "provider";

export type EmailQueueStatus = "pending" | "processing" | "sent" | "dead";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  tags: {
    eventType: NotificationEventType;
    recipientRole: EmailRecipientRole;
  };
}

export type EmailSendResult =
  | {
      ok: true;
      provider: string;
      messageId: string;
      skipped?: boolean;
    }
  | {
      ok: false;
      provider: string;
      errorCode: string;
      retryable: boolean;
    };

/**
 * Contrato neutro para entrega de e-mails transacionais (#26).
 *
 * A implementação padrão no repositório é `NoopEmailSender` (não envia nada).
 * Uma implementação real só pode ser plugada após decisão de provedor e
 * provisionamento de credenciais pelo responsável (`OWNER_DECISION`).
 */
export interface EmailSender {
  readonly providerName: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface EmailQueueEnqueueInput {
  bookingId: string;
  recipientId: string;
  recipientRole: EmailRecipientRole;
  eventType: NotificationEventType;
  /** Identificador de janela de idempotência (ex.: data local `20261128` ou UUID do evento). */
  windowKey: string;
  maxAttempts?: number;
}

export interface EmailQueueJob {
  id: string;
  idempotencyKey: string;
  bookingId: string;
  recipientId: string;
  recipientRole: EmailRecipientRole;
  eventType: NotificationEventType;
  windowKey: string;
  status: EmailQueueStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAtMs: number;
  lockedUntilMs: number | null;
  leaseToken: string | null;
  providerName: string | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  sentAtMs: number | null;
  deadAtMs: number | null;
  reprocessedAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface EmailQueueStore {
  enqueue(
    input: EmailQueueEnqueueInput,
    nowMs?: number,
  ): Promise<{ enqueued: boolean; job: EmailQueueJob }>;
  claimBatch(
    limit: number,
    nowMs: number,
    leaseMs: number,
  ): Promise<EmailQueueJob[]>;
  markSent(
    jobId: string,
    leaseToken: string,
    info: { providerName: string; providerMessageId: string; nowMs: number },
  ): Promise<boolean>;
  markRetry(
    jobId: string,
    leaseToken: string,
    info: { errorCode: string; nextAttemptAtMs: number; nowMs: number },
  ): Promise<boolean>;
  markDead(
    jobId: string,
    leaseToken: string,
    info: { errorCode: string; nowMs: number },
  ): Promise<boolean>;
  /**
   * Reprocessa exclusivamente itens em estado terminal `dead`, preservando
   * a mesma `idempotencyKey`. Nunca reabre itens `sent`, `pending` ou `processing`.
   */
  reprocessDead(jobId: string, nowMs?: number): Promise<boolean>;
  getById(jobId: string): Promise<EmailQueueJob | null>;
}

export interface EmailDeliveryContext {
  recipientEmail: string;
  emailPreferenceEnabled: boolean;
  serviceNameSnapshot: string;
  startsAtIso: string;
  providerTimezone: string;
  siteUrl: string;
}
