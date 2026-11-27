import { decryptCalendarToken, encryptCalendarToken, googleEventIdForBooking } from "./crypto";
import {
  CalendarSyncError,
  RECONNECT_REQUIRED,
  calendarErrorCode,
  isRetryableCalendarError,
} from "./errors";
import { buildCalendarEvent } from "./event-payload";
import type { GoogleCalendarApi } from "./google";
import type { CalendarConnectionRow, CalendarStore, OutboxJob } from "./store";

/** Espelha o limite `attempts < 8` de claim_calendar_sync_jobs. */
export const CALENDAR_MAX_ATTEMPTS = 8;
const ACCESS_TOKEN_SKEW_MS = 60_000;
const DISCONNECT_BATCH = 50;

export type CalendarCrypto = {
  encrypt(value: string): string;
  decrypt(value: string): string;
};

export type CalendarWorkerDeps = {
  store: CalendarStore;
  google: GoogleCalendarApi;
  crypto?: CalendarCrypto;
  now?: () => number;
  log?: (event: Record<string, string | number | boolean | null>) => void;
};

type ResolvedDeps = Required<CalendarWorkerDeps>;

const defaultCrypto: CalendarCrypto = { encrypt: encryptCalendarToken, decrypt: decryptCalendarToken };

function resolve(deps: CalendarWorkerDeps): ResolvedDeps {
  return {
    store: deps.store,
    google: deps.google,
    crypto: deps.crypto ?? defaultCrypto,
    now: deps.now ?? Date.now,
    // Logs estruturados com códigos e IDs internos apenas: sem token, payload
    // de evento ou dado pessoal.
    log: deps.log ?? ((event) => console.warn(JSON.stringify({ scope: "calendar", ...event }))),
  };
}

export function retryDelaySeconds(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

/**
 * Access token válido para a conexão: reaproveita o armazenado enquanto não
 * vence; senão renova pelo refresh token. invalid_grant suspende a conexão e
 * vira erro permanente (sem retry).
 */
export function createAccessTokenProvider(deps: ResolvedDeps) {
  const cache = new Map<string, string>();
  return async function accessTokenFor(connection: CalendarConnectionRow): Promise<string> {
    const cached = cache.get(connection.provider_id);
    if (cached) return cached;
    if (
      connection.access_token_ciphertext &&
      connection.access_token_expires_at &&
      Date.parse(connection.access_token_expires_at) - ACCESS_TOKEN_SKEW_MS > deps.now()
    ) {
      try {
        const token = deps.crypto.decrypt(connection.access_token_ciphertext);
        cache.set(connection.provider_id, token);
        return token;
      } catch {
        // Cifra ilegível: cai para o refresh.
      }
    }
    if (!connection.refresh_token_ciphertext) {
      await deps.store.suspendConnection(connection.provider_id, "missing_refresh_token");
      throw new CalendarSyncError(RECONNECT_REQUIRED, false);
    }
    let refreshToken: string;
    try {
      refreshToken = deps.crypto.decrypt(connection.refresh_token_ciphertext);
    } catch {
      throw new CalendarSyncError("calendar_token_decrypt_failed", false);
    }
    try {
      const { accessToken, expiresIn } = await deps.google.refreshAccessToken(refreshToken);
      await deps.store.saveAccessToken(
        connection.provider_id,
        deps.crypto.encrypt(accessToken),
        new Date(deps.now() + expiresIn * 1000).toISOString(),
      );
      cache.set(connection.provider_id, accessToken);
      return accessToken;
    } catch (error) {
      if (error instanceof CalendarSyncError && error.code === RECONNECT_REQUIRED) {
        await deps.store.suspendConnection(connection.provider_id, "invalid_grant");
        deps.log({ event: "connection_suspended", providerId: connection.provider_id, code: "invalid_grant" });
      }
      throw error;
    }
  };
}

type JobOutcome = { code: string | null };

/**
 * Processa um job pela situação atual da reserva (idempotência por estado):
 * confirmada => evento presente; qualquer outro estado ou reserva ausente =>
 * evento ausente. A ordem por reserva é garantida pelo claim.
 */
async function processJob(
  deps: ResolvedDeps,
  accessTokenFor: (connection: CalendarConnectionRow) => Promise<string>,
  job: OutboxJob,
): Promise<JobOutcome> {
  const booking = await deps.store.getBooking(job.booking_id);
  const mapping = await deps.store.getMapping(job.booking_id);
  const shouldExist = Boolean(booking && booking.status === "confirmed");

  if (!shouldExist) {
    if (!mapping) return { code: "noop_absent" };
    const connection = await deps.store.getConnection(mapping.provider_id);
    if (!connection) {
      // Sem tokens não há como remover do Google: mantém o vínculo como rastro.
      await deps.store.markMappingOrphaned(mapping.booking_id);
      return { code: "mapping_orphaned" };
    }
    if (connection.disconnect_requested_at) return { code: "calendar_disconnecting" };
    if (connection.connection_status === "pending") {
      // Vínculo de uma conexão anterior já encerrada: sem tokens válidos.
      await deps.store.markMappingOrphaned(mapping.booking_id);
      return { code: "mapping_orphaned" };
    }
    if (connection.connection_status !== "connected") throw new CalendarSyncError(RECONNECT_REQUIRED, false);
    const token = await accessTokenFor(connection);
    await deps.google.deleteEvent(token, mapping.calendar_id, mapping.google_event_id);
    await deps.store.deleteMapping(mapping.booking_id, mapping.provider_id);
    return { code: null };
  }

  const confirmed = booking!;
  const connection = await deps.store.getConnection(confirmed.provider_id);
  if (!connection || connection.connection_status === "pending") return { code: "calendar_not_connected" };
  if (connection.disconnect_requested_at) return { code: "calendar_disconnecting" };
  if (connection.connection_status !== "connected") throw new CalendarSyncError(RECONNECT_REQUIRED, false);

  const calendarId = mapping?.calendar_id ?? (connection.calendar_id || "primary");
  const eventId = mapping?.google_event_id ?? googleEventIdForBooking(confirmed.id);
  const token = await accessTokenFor(connection);
  // Só serviço, início, fim e fuso: sem nome, telefone, e-mail ou ID da reserva.
  const event = buildCalendarEvent({
    id: eventId,
    serviceName: confirmed.service_name_snapshot,
    startsAt: confirmed.starts_at,
    endsAt: confirmed.ends_at,
    timezone: confirmed.timezone,
  });

  let result = mapping
    ? await deps.google.patchEvent(token, calendarId, eventId, event)
    : await deps.google.insertEvent(token, calendarId, event);
  if (result === "conflict") result = await deps.google.patchEvent(token, calendarId, eventId, event);
  if (result === "gone") {
    // Evento removido manualmente no Google: não recriamos (v1); vínculo mantido.
    return { code: "google_event_missing" };
  }
  await deps.store.saveMapping({
    booking_id: confirmed.id,
    provider_id: confirmed.provider_id,
    calendar_id: calendarId,
    google_event_id: eventId,
  });
  return { code: null };
}

export type DisconnectCleanupResult = {
  finalized: boolean;
  removed: number;
  orphaned: number;
  pending: boolean;
};

/**
 * Limpeza de uma desconexão pedida: remove eventos mapeados no Google e só
 * apaga a conexão (tokens) quando não sobra vínculo ativo. Falha transitória
 * mantém conexão e vínculos para a próxima execução; token revogado marca os
 * vínculos restantes como órfãos (rastro) e conclui.
 */
export async function cleanupProviderDisconnect(
  input: CalendarWorkerDeps,
  providerId: string,
  accessTokenFor?: (connection: CalendarConnectionRow) => Promise<string>,
): Promise<DisconnectCleanupResult> {
  const deps = resolve(input);
  const tokenFor = accessTokenFor ?? createAccessTokenProvider(deps);
  const result: DisconnectCleanupResult = { finalized: false, removed: 0, orphaned: 0, pending: false };

  const connection = await deps.store.getConnection(providerId);
  if (!connection) return { ...result, finalized: true };
  if (!connection.disconnect_requested_at) return result;
  let tokenAlreadyRevoked = false;

  const mappings = await deps.store.listActiveMappings(providerId, DISCONNECT_BATCH);
  if (mappings.length > 0) {
    let token: string | null = null;
    try {
      token = await tokenFor(connection);
    } catch (error) {
      if (error instanceof CalendarSyncError && !error.retryable) {
        tokenAlreadyRevoked = error.code === RECONNECT_REQUIRED;
        result.orphaned += await deps.store.orphanActiveMappings(providerId);
        deps.log({ event: "disconnect_orphaned", providerId, count: result.orphaned, code: error.code });
      } else {
        deps.log({ event: "disconnect_pending", providerId, code: calendarErrorCode(error) });
        return { ...result, pending: true };
      }
    }
    if (token) {
      for (const mapping of mappings) {
        try {
          await deps.google.deleteEvent(token, mapping.calendar_id, mapping.google_event_id);
          await deps.store.deleteMapping(mapping.booking_id, mapping.provider_id);
          result.removed += 1;
        } catch (error) {
          result.pending = true;
          deps.log({ event: "disconnect_event_pending", providerId, code: calendarErrorCode(error) });
        }
      }
      if (result.pending || mappings.length === DISCONNECT_BATCH) return { ...result, pending: true };
    }
  }

  const finalization = await deps.store.finalizeDisconnect(providerId);
  if (!finalization.finalized) return { ...result, pending: true };
  if (finalization.refreshCiphertext && !tokenAlreadyRevoked) {
    let revoked = false;
    try {
      revoked = await deps.google.revokeToken(deps.crypto.decrypt(finalization.refreshCiphertext));
    } catch {
      revoked = false;
    }
    if (!revoked) {
      deps.log({ event: "revoke_failed", providerId, code: "google_revoke_failed" });
      return { ...result, pending: true };
    }
  }
  // Só apaga a conexão/token depois de revogação confirmada (ou invalid_grant).
  await deps.store.completeDisconnect(providerId);
  const orphaned = await deps.store.countOrphanedMappings(providerId);
  return { ...result, finalized: true, orphaned };
}

export type CalendarWorkerSummary = {
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
  persistErrors: number;
  disconnectsFinalized: number;
  disconnectsPending: number;
};

export async function runCalendarSync(
  input: CalendarWorkerDeps,
  options: { limit?: number; disconnectBatch?: number } = {},
): Promise<CalendarWorkerSummary> {
  const deps = resolve(input);
  const accessTokenFor = createAccessTokenProvider(deps);
  const summary: CalendarWorkerSummary = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
    persistErrors: 0,
    disconnectsFinalized: 0,
    disconnectsPending: 0,
  };

  const jobs = await deps.store.claimJobs(options.limit ?? 10);
  summary.claimed = jobs.length;

  for (const job of jobs) {
    let outcome: JobOutcome | null = null;
    let failure: unknown = null;
    try {
      outcome = await processJob(deps, accessTokenFor, job);
    } catch (error) {
      failure = error;
    }

    try {
      if (outcome) {
        await deps.store.completeJob(job.id, job.lease_token ?? "", outcome.code);
        summary.succeeded += 1;
        continue;
      }
      const code = calendarErrorCode(failure).slice(0, 80);
      const attempts = Number(job.attempts ?? 1);
      if (!isRetryableCalendarError(failure) || attempts >= CALENDAR_MAX_ATTEMPTS) {
        await deps.store.killJob(job.id, job.lease_token ?? "", code);
        summary.dead += 1;
        deps.log({ event: "job_dead", jobId: job.id, attempts, code });
      } else {
        const availableAt = new Date(deps.now() + retryDelaySeconds(attempts) * 1000).toISOString();
        await deps.store.failJob(job.id, job.lease_token ?? "", code, availableAt);
        summary.failed += 1;
      }
    } catch (error) {
      // O job permanece em processing e será reivindicado de novo depois do
      // timeout; o lease token impede que este worker antigo confirme o novo claim.
      summary.persistErrors += 1;
      deps.log({ event: "job_persist_failed", jobId: job.id, code: calendarErrorCode(error) });
    }
  }

  let providers: string[] = [];
  try {
    providers = await deps.store.listDisconnectingProviders(options.disconnectBatch ?? 5);
  } catch (error) {
    summary.persistErrors += 1;
    deps.log({ event: "disconnect_list_failed", code: calendarErrorCode(error) });
  }
  for (const providerId of providers) {
    try {
      const result = await cleanupProviderDisconnect(deps, providerId, accessTokenFor);
      if (result.finalized) summary.disconnectsFinalized += 1;
      else summary.disconnectsPending += 1;
    } catch (error) {
      summary.disconnectsPending += 1;
      deps.log({ event: "disconnect_cleanup_failed", providerId, code: calendarErrorCode(error) });
    }
  }

  return summary;
}
