import "server-only";

import type { EmailMessage, EmailSendResult, EmailSender } from "./types";

export type EmailStructuredLogger = (
  event: Record<string, string | number | boolean | null>,
) => void;

const defaultLogger: EmailStructuredLogger = (event) => {
  console.info(JSON.stringify({ scope: "email", ...event }));
};

/**
 * Flag fail-closed para envio real de e-mail.
 *
 * Retorna `false` por padrão em todos os ambientes. Mesmo se configurada como
 * `true`, esta versão só possui `NoopEmailSender` — nenhuma integração real de
 * provedor existe até aprovação do responsável (`OWNER_DECISION`, Issue #26).
 */
export function isEmailDeliveryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = (env.EMAIL_DELIVERY_ENABLED ?? "").trim().toLowerCase();
  const provider = (env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  return flag === "true" && provider.length > 0 && provider !== "noop";
}

/**
 * Implementação padrão de `EmailSender`: não faz requisições externas nem envia
 * e-mails reais. Registra apenas metadados estruturados sem PII (sem endereço
 * de destinatário, assunto ou corpo).
 */
export class NoopEmailSender implements EmailSender {
  readonly providerName = "noop";

  constructor(private readonly log: EmailStructuredLogger = defaultLogger) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.log({
      mode: "noop",
      event: "email_skipped_noop",
      eventType: message.tags.eventType,
      recipientRole: message.tags.recipientRole,
      idempotencyKey: message.idempotencyKey,
    });

    return {
      ok: true,
      provider: this.providerName,
      messageId: `noop:${message.idempotencyKey}`,
      skipped: true,
    };
  }
}

/**
 * Resolve o `EmailSender` ativo.
 * - Com `EMAIL_DELIVERY_ENABLED` ausente/`false` ou `EMAIL_PROVIDER` ausente/`noop`:
 *   retorna `NoopEmailSender` (padrão seguro).
 * - Se alguém tentar ativar um provedor externo antes da implementação aprovada
 *   em código, falha fechado sem enviar nada.
 */
export function createEmailSender(options?: {
  env?: Record<string, string | undefined>;
  log?: EmailStructuredLogger;
}): EmailSender {
  const env = options?.env ?? process.env;
  const log = options?.log ?? defaultLogger;

  if (!isEmailDeliveryEnabled(env)) {
    return new NoopEmailSender(log);
  }

  throw new Error(
    "email_provider_not_implemented: escolha e implementacao de provedor pendente de OWNER_DECISION (#26)",
  );
}
