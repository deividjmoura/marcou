import "server-only";

import { randomUUID } from "node:crypto";
import { buildEmailIdempotencyKey, renderBookingEmailMessage } from "./template";
import { NoopEmailSender, type EmailStructuredLogger } from "./sender";
import type {
  EmailDeliveryContext,
  EmailQueueEnqueueInput,
  EmailQueueJob,
  EmailQueueStore,
  EmailSender,
} from "./types";

export const EMAIL_DEFAULT_MAX_ATTEMPTS = 5;
export const EMAIL_DEFAULT_LEASE_MS = 60_000;
const EMAIL_MAX_BACKOFF_SECONDS = 3600;
const EMAIL_BASE_BACKOFF_SECONDS = 60;

/**
 * Backoff exponencial determinístico: 60s, 120s, 240s, 480s, ... teto 3600s.
 */
export function calculateEmailBackoffSeconds(attempts: number): number {
  const exponent = Math.max(0, Math.floor(attempts) - 1);
  return Math.min(
    EMAIL_MAX_BACKOFF_SECONDS,
    EMAIL_BASE_BACKOFF_SECONDS * 2 ** exponent,
  );
}

/**
 * Store em memória com exatamente a mesma semântica da tabela SQL
 * `public.email_delivery_queue` (unicidade por `idempotencyKey`, claim com
 * lease, backoff, estado terminal `dead` e reprocessamento seguro exclusivo de
 * itens `dead`). Ideal para testes determinísticos e desenvolvimento local.
 */
export class InMemoryEmailQueueStore implements EmailQueueStore {
  private readonly jobsById = new Map<string, EmailQueueJob>();
  private readonly idByKey = new Map<string, string>();

  async enqueue(
    input: EmailQueueEnqueueInput,
    nowMs = Date.now(),
  ): Promise<{ enqueued: boolean; job: EmailQueueJob }> {
    const idempotencyKey = buildEmailIdempotencyKey({
      bookingId: input.bookingId,
      eventType: input.eventType,
      windowKey: input.windowKey,
      recipientRole: input.recipientRole,
    });

    const existingId = this.idByKey.get(idempotencyKey);
    if (existingId) {
      const existing = this.jobsById.get(existingId)!;
      return { enqueued: false, job: { ...existing } };
    }

    const maxAttempts = Math.min(
      20,
      Math.max(1, input.maxAttempts ?? EMAIL_DEFAULT_MAX_ATTEMPTS),
    );
    const job: EmailQueueJob = {
      id: randomUUID(),
      idempotencyKey,
      bookingId: input.bookingId.trim(),
      recipientId: input.recipientId.trim(),
      recipientRole: input.recipientRole,
      eventType: input.eventType,
      windowKey: input.windowKey.trim(),
      status: "pending",
      attempts: 0,
      maxAttempts,
      nextAttemptAtMs: nowMs,
      lockedUntilMs: null,
      leaseToken: null,
      providerName: null,
      providerMessageId: null,
      lastErrorCode: null,
      sentAtMs: null,
      deadAtMs: null,
      reprocessedAtMs: null,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };

    this.jobsById.set(job.id, job);
    this.idByKey.set(idempotencyKey, job.id);
    return { enqueued: true, job: { ...job } };
  }

  async claimBatch(
    limit: number,
    nowMs: number,
    leaseMs: number,
  ): Promise<EmailQueueJob[]> {
    const eligible = [...this.jobsById.values()]
      .filter((job) => {
        if (job.status === "pending") {
          return job.nextAttemptAtMs <= nowMs;
        }
        if (job.status === "processing") {
          return job.lockedUntilMs !== null && job.lockedUntilMs <= nowMs;
        }
        return false;
      })
      .sort(
        (a, b) =>
          a.nextAttemptAtMs - b.nextAttemptAtMs ||
          a.createdAtMs - b.createdAtMs,
      )
      .slice(0, Math.max(0, limit));

    const claimed: EmailQueueJob[] = [];
    for (const job of eligible) {
      job.status = "processing";
      job.attempts += 1;
      job.leaseToken = randomUUID();
      job.lockedUntilMs = nowMs + leaseMs;
      job.updatedAtMs = nowMs;
      claimed.push({ ...job });
    }
    return claimed;
  }

  async markSent(
    jobId: string,
    leaseToken: string,
    info: { providerName: string; providerMessageId: string; nowMs: number },
  ): Promise<boolean> {
    const job = this.jobsById.get(jobId);
    if (!job || job.status !== "processing" || job.leaseToken !== leaseToken) {
      return false;
    }

    job.status = "sent";
    job.providerName = info.providerName;
    job.providerMessageId = info.providerMessageId;
    job.lastErrorCode = null;
    job.lockedUntilMs = null;
    job.leaseToken = null;
    job.sentAtMs = info.nowMs;
    job.updatedAtMs = info.nowMs;
    return true;
  }

  async markRetry(
    jobId: string,
    leaseToken: string,
    info: { errorCode: string; nextAttemptAtMs: number; nowMs: number },
  ): Promise<boolean> {
    const job = this.jobsById.get(jobId);
    if (!job || job.status !== "processing" || job.leaseToken !== leaseToken) {
      return false;
    }

    job.status = "pending";
    job.lastErrorCode = info.errorCode;
    job.nextAttemptAtMs = info.nextAttemptAtMs;
    job.lockedUntilMs = null;
    job.leaseToken = null;
    job.updatedAtMs = info.nowMs;
    return true;
  }

  async markDead(
    jobId: string,
    leaseToken: string,
    info: { errorCode: string; nowMs: number },
  ): Promise<boolean> {
    const job = this.jobsById.get(jobId);
    if (!job || job.status !== "processing" || job.leaseToken !== leaseToken) {
      return false;
    }

    job.status = "dead";
    job.lastErrorCode = info.errorCode;
    job.lockedUntilMs = null;
    job.leaseToken = null;
    job.deadAtMs = info.nowMs;
    job.updatedAtMs = info.nowMs;
    return true;
  }

  async reprocessDead(jobId: string, nowMs = Date.now()): Promise<boolean> {
    const job = this.jobsById.get(jobId);
    if (!job || job.status !== "dead") {
      return false;
    }

    job.status = "pending";
    job.attempts = 0;
    job.nextAttemptAtMs = nowMs;
    job.lockedUntilMs = null;
    job.leaseToken = null;
    job.lastErrorCode = null;
    job.deadAtMs = null;
    job.reprocessedAtMs = nowMs;
    job.updatedAtMs = nowMs;
    return true;
  }

  async getById(jobId: string): Promise<EmailQueueJob | null> {
    const job = this.jobsById.get(jobId);
    return job ? { ...job } : null;
  }
}

export interface EmailBatchSummary {
  claimed: number;
  sent: number;
  skippedByPreference: number;
  retried: number;
  dead: number;
}

export interface ProcessEmailBatchDeps {
  store: EmailQueueStore;
  resolveContext: (
    job: EmailQueueJob,
  ) => Promise<EmailDeliveryContext | null>;
  sender?: EmailSender;
  batchSize?: number;
  leaseMs?: number;
  now?: () => number;
  log?: EmailStructuredLogger;
}

const defaultBatchLogger: EmailStructuredLogger = (event) => {
  console.warn(JSON.stringify({ scope: "email_queue", ...event }));
};

function sanitizeErrorCode(raw: string | undefined): string {
  const cleaned = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, "_")
    .slice(0, 64);
  return cleaned || "delivery_failed";
}

/**
 * Processa um lote da fila de e-mail com:
 * - checagem obrigatória da preferência `email` do destinatário;
 * - renderização segura pt-BR no fuso do prestador sem PII de terceiros;
 * - retry com backoff exponencial em falhas transitórias;
 * - estado terminal `dead` em erro permanente ou ao atingir `maxAttempts`;
 * - logs estruturados estritamente sem e-mail, assunto ou corpo.
 */
export async function processEmailQueueBatch(
  deps: ProcessEmailBatchDeps,
): Promise<EmailBatchSummary> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? defaultBatchLogger;
  const sender = deps.sender ?? new NoopEmailSender(log);
  const batchSize = deps.batchSize ?? 25;
  const leaseMs = deps.leaseMs ?? EMAIL_DEFAULT_LEASE_MS;

  // O sender noop nunca entrega mensagens. Não reivindique jobs nem os marque
  // como "sent": eles devem permanecer pendentes até existir um provedor real.
  if (sender instanceof NoopEmailSender) {
    log({
      event: "email_batch_skipped_noop",
      reason: "provider_not_configured",
    });
    return {
      claimed: 0,
      sent: 0,
      skippedByPreference: 0,
      retried: 0,
      dead: 0,
    };
  }

  const jobs = await deps.store.claimBatch(batchSize, now(), leaseMs);
  const summary: EmailBatchSummary = {
    claimed: jobs.length,
    sent: 0,
    skippedByPreference: 0,
    retried: 0,
    dead: 0,
  };

  for (const job of jobs) {
    const leaseToken = job.leaseToken;
    if (!leaseToken) continue;

    let context: EmailDeliveryContext | null;
    try {
      context = await deps.resolveContext(job);
    } catch {
      const currentNow = now();
      if (job.attempts >= job.maxAttempts) {
        await deps.store.markDead(job.id, leaseToken, {
          errorCode: "context_resolution_error",
          nowMs: currentNow,
        });
        summary.dead += 1;
      } else {
        const delayMs = calculateEmailBackoffSeconds(job.attempts) * 1000;
        await deps.store.markRetry(job.id, leaseToken, {
          errorCode: "context_resolution_error",
          nextAttemptAtMs: currentNow + delayMs,
          nowMs: currentNow,
        });
        summary.retried += 1;
      }
      continue;
    }

    if (!context) {
      await deps.store.markDead(job.id, leaseToken, {
        errorCode: "recipient_or_booking_unavailable",
        nowMs: now(),
      });
      summary.dead += 1;
      log({
        event: "email_job_dead",
        jobId: job.id,
        idempotencyKey: job.idempotencyKey,
        errorCode: "recipient_or_booking_unavailable",
      });
      continue;
    }

    if (!context.emailPreferenceEnabled) {
      await deps.store.markSent(job.id, leaseToken, {
        providerName: "preference_disabled",
        providerMessageId: `skipped:preference:${job.idempotencyKey}`,
        nowMs: now(),
      });
      summary.skippedByPreference += 1;
      log({
        event: "email_skipped_preference_disabled",
        jobId: job.id,
        idempotencyKey: job.idempotencyKey,
      });
      continue;
    }

    let message;
    try {
      message = renderBookingEmailMessage({
        to: context.recipientEmail,
        bookingId: job.bookingId,
        eventType: job.eventType,
        recipientRole: job.recipientRole,
        windowKey: job.windowKey,
        serviceNameSnapshot: context.serviceNameSnapshot,
        startsAtIso: context.startsAtIso,
        providerTimezone: context.providerTimezone,
        siteUrl: context.siteUrl,
      });
    } catch (error) {
      const code = sanitizeErrorCode(
        error instanceof Error ? error.message : "invalid_template_input",
      );
      await deps.store.markDead(job.id, leaseToken, {
        errorCode: code,
        nowMs: now(),
      });
      summary.dead += 1;
      log({
        event: "email_job_dead",
        jobId: job.id,
        idempotencyKey: job.idempotencyKey,
        errorCode: code,
      });
      continue;
    }

    let result;
    try {
      result = await sender.send(message);
    } catch {
      result = {
        ok: false as const,
        provider: sender.providerName,
        errorCode: "sender_exception",
        retryable: true,
      };
    }

    const finishedNow = now();
    if (result.ok) {
      await deps.store.markSent(job.id, leaseToken, {
        providerName: result.provider,
        providerMessageId: result.messageId,
        nowMs: finishedNow,
      });
      summary.sent += 1;
      continue;
    }

    const errorCode = sanitizeErrorCode(result.errorCode);
    const shouldMoveToDead =
      !result.retryable || job.attempts >= job.maxAttempts;

    if (shouldMoveToDead) {
      await deps.store.markDead(job.id, leaseToken, {
        errorCode,
        nowMs: finishedNow,
      });
      summary.dead += 1;
      log({
        event: "email_job_dead",
        jobId: job.id,
        idempotencyKey: job.idempotencyKey,
        attempts: job.attempts,
        errorCode,
      });
    } else {
      const delaySeconds = calculateEmailBackoffSeconds(job.attempts);
      await deps.store.markRetry(job.id, leaseToken, {
        errorCode,
        nextAttemptAtMs: finishedNow + delaySeconds * 1000,
        nowMs: finishedNow,
      });
      summary.retried += 1;
      log({
        event: "email_job_retry_scheduled",
        jobId: job.id,
        idempotencyKey: job.idempotencyKey,
        attempts: job.attempts,
        delaySeconds,
        errorCode,
      });
    }
  }

  return summary;
}
