/* Fakes em memória para testes do Calendar (não usados em produção). */
import { CalendarSyncError, RECONNECT_REQUIRED } from "./errors";
import type { CalendarEventBody, EventWriteResult, GoogleCalendarApi, OAuthTokens } from "./google";
import type {
  BookingSnapshot,
  CalendarConnectionRow,
  CalendarStore,
  ConsumeStateOutcome,
  EventMapping,
  OutboxJob,
} from "./store";

type JobRow = OutboxJob & { last_error_code?: string | null; available_at?: string };

export class FakeStore implements CalendarStore {
  jobs = new Map<string, JobRow>();
  bookings = new Map<string, BookingSnapshot>();
  mappings = new Map<string, EventMapping>();
  connections = new Map<string, CalendarConnectionRow & { state?: { hash: string; userId: string; expiresAt: number } }>();
  fail = new Set<string>();
  calls: string[] = [];
  finalizeBlocked = false;

  private guard(name: string) {
    this.calls.push(name);
    if (this.fail.has(name)) throw new CalendarSyncError(`${name}_failed`, true);
  }

  connect(providerId: string, overrides: Partial<CalendarConnectionRow> = {}) {
    this.connections.set(providerId, {
      provider_id: providerId,
      refresh_token_ciphertext: "enc:refresh",
      access_token_ciphertext: null,
      access_token_expires_at: null,
      calendar_id: "primary",
      connection_status: "connected",
      suspended_reason: null,
      disconnect_requested_at: null,
      ...overrides,
    });
  }

  addJob(job: Partial<OutboxJob> & { id: string; booking_id: string }) {
    this.jobs.set(job.id, {
      booking_event_id: job.reason === "backfill" ? null : `event-${job.id}`,
      reason: "booking_event",
      operation: "upsert",
      status: "pending",
      attempts: 0,
      ...job,
    });
  }

  async claimJobs(limit: number) {
    this.guard("claimJobs");
    const claimed: OutboxJob[] = [];
    for (const job of this.jobs.values()) {
      if (claimed.length >= limit) break;
      if (job.status === "pending" || job.status === "failed") {
        job.status = "processing";
        job.attempts += 1;
        claimed.push({ ...job });
      }
    }
    return claimed;
  }
  private setJob(id: string, values: Partial<JobRow>, name: string) {
    this.guard(name);
    const job = this.jobs.get(id);
    if (!job || job.status !== "processing") throw new CalendarSyncError(`${name}_failed`, true);
    Object.assign(job, values);
  }
  async completeJob(id: string, code: string | null) {
    this.setJob(id, { status: "succeeded", last_error_code: code }, "completeJob");
  }
  async failJob(id: string, code: string, availableAt: string) {
    this.setJob(id, { status: "failed", last_error_code: code, available_at: availableAt }, "failJob");
  }
  async killJob(id: string, code: string) {
    this.setJob(id, { status: "dead", last_error_code: code }, "killJob");
  }

  async getBooking(id: string) {
    this.guard("getBooking");
    return this.bookings.get(id) ?? null;
  }
  async getMapping(id: string) {
    this.guard("getMapping");
    return this.mappings.get(id) ?? null;
  }
  async saveMapping(mapping: Omit<EventMapping, "orphaned_at">) {
    this.guard("saveMapping");
    this.mappings.set(mapping.booking_id, { ...mapping, orphaned_at: null });
  }
  async deleteMapping(bookingId: string, providerId: string) {
    this.guard("deleteMapping");
    const mapping = this.mappings.get(bookingId);
    if (mapping?.provider_id === providerId) this.mappings.delete(bookingId);
  }
  async markMappingOrphaned(bookingId: string) {
    this.guard("markMappingOrphaned");
    const mapping = this.mappings.get(bookingId);
    if (mapping && !mapping.orphaned_at) mapping.orphaned_at = new Date().toISOString();
  }
  async listActiveMappings(providerId: string, limit: number) {
    this.guard("listActiveMappings");
    return [...this.mappings.values()].filter((m) => m.provider_id === providerId && !m.orphaned_at).slice(0, limit);
  }
  async orphanActiveMappings(providerId: string) {
    this.guard("orphanActiveMappings");
    let count = 0;
    for (const mapping of this.mappings.values()) {
      if (mapping.provider_id === providerId && !mapping.orphaned_at) {
        mapping.orphaned_at = new Date().toISOString();
        count += 1;
      }
    }
    return count;
  }
  async countOrphanedMappings(providerId: string) {
    this.guard("countOrphanedMappings");
    return [...this.mappings.values()].filter((m) => m.provider_id === providerId && m.orphaned_at).length;
  }

  async getConnection(providerId: string) {
    this.guard("getConnection");
    const connection = this.connections.get(providerId);
    return connection ? { ...connection } : null;
  }
  async saveAccessToken(providerId: string, ciphertext: string, expiresAt: string) {
    this.guard("saveAccessToken");
    const connection = this.connections.get(providerId);
    if (!connection) throw new CalendarSyncError("calendar_token_save_failed", true);
    connection.access_token_ciphertext = ciphertext;
    connection.access_token_expires_at = expiresAt;
  }
  async suspendConnection(providerId: string, reason: string) {
    this.guard("suspendConnection");
    const connection = this.connections.get(providerId);
    if (connection) {
      connection.connection_status = "suspended";
      connection.suspended_reason = reason;
    }
  }

  async startOAuth(input: { providerId: string; userId: string; stateHash: string; expiresAt: string }) {
    this.guard("startOAuth");
    const existing = this.connections.get(input.providerId);
    if (existing?.disconnect_requested_at) return "disconnecting" as const;
    if (!existing) this.connect(input.providerId, { connection_status: "pending", refresh_token_ciphertext: null });
    this.connections.get(input.providerId)!.state = {
      hash: input.stateHash,
      userId: input.userId,
      expiresAt: Date.parse(input.expiresAt),
    };
    return "started" as const;
  }
  async consumeOAuthState(stateHash: string, userId: string) {
    this.guard("consumeOAuthState");
    for (const connection of this.connections.values()) {
      if (connection.state?.hash !== stateHash) continue;
      const state = connection.state;
      connection.state = undefined;
      let outcome: ConsumeStateOutcome = "ok";
      if (state.expiresAt <= Date.now()) outcome = "expired";
      else if (state.userId !== userId) outcome = "forbidden";
      else if (connection.disconnect_requested_at) outcome = "disconnecting";
      return { outcome, providerId: outcome === "ok" ? connection.provider_id : null };
    }
    return { outcome: "invalid" as const, providerId: null };
  }
  async completeOAuth(input: {
    providerId: string;
    refreshCiphertext: string;
    accessCiphertext: string;
    accessExpiresAt: string;
    grantedScope: string;
  }) {
    this.guard("completeOAuth");
    const connection = this.connections.get(input.providerId);
    if (!connection || connection.disconnect_requested_at) throw new CalendarSyncError("calendar_oauth_save_failed", true);
    Object.assign(connection, {
      refresh_token_ciphertext: input.refreshCiphertext,
      access_token_ciphertext: input.accessCiphertext,
      access_token_expires_at: input.accessExpiresAt,
      connection_status: "connected",
      suspended_reason: null,
    });
  }

  async requestDisconnect(providerId: string) {
    this.guard("requestDisconnect");
    const connection = this.connections.get(providerId);
    if (!connection) return "none" as const;
    if (connection.disconnect_requested_at) return "already" as const;
    connection.disconnect_requested_at = new Date().toISOString();
    connection.connection_status = "suspended";
    connection.suspended_reason = "disconnect_requested";
    return "requested" as const;
  }
  async listDisconnectingProviders(limit: number) {
    this.guard("listDisconnectingProviders");
    return [...this.connections.values()]
      .filter((c) => c.disconnect_requested_at)
      .slice(0, limit)
      .map((c) => c.provider_id);
  }
  async finalizeDisconnect(providerId: string) {
    this.guard("finalizeDisconnect");
    const connection = this.connections.get(providerId);
    if (!connection?.disconnect_requested_at || this.finalizeBlocked) return { finalized: false, refreshCiphertext: null };
    const active = [...this.mappings.values()].some((m) => m.provider_id === providerId && !m.orphaned_at);
    if (active) return { finalized: false, refreshCiphertext: null };
    this.connections.delete(providerId);
    return { finalized: true, refreshCiphertext: connection.refresh_token_ciphertext };
  }
}

type Responder<T> = T | Error | (() => T | Promise<T>);

export class FakeGoogle implements GoogleCalendarApi {
  calls: { method: string; calendarId?: string; eventId?: string; event?: CalendarEventBody; token?: string }[] = [];
  events = new Map<string, CalendarEventBody>();
  refreshResult: Responder<{ accessToken: string; expiresIn: number }> = { accessToken: "access-1", expiresIn: 3600 };
  exchangeResult: Responder<OAuthTokens> = {
    access_token: "oauth-access",
    refresh_token: "oauth-refresh",
    expires_in: 3600,
    scope: "https://www.googleapis.com/auth/calendar.events",
  };
  deleteError: Error | null = null;
  insertError: Error | null = null;
  revoked: string[] = [];
  revokeOk = true;

  private async answer<T>(value: Responder<T>): Promise<T> {
    if (value instanceof Error) throw value;
    if (typeof value === "function") return (value as () => T | Promise<T>)();
    return value;
  }

  async exchangeCode() {
    this.calls.push({ method: "exchangeCode" });
    return this.answer(this.exchangeResult);
  }
  async refreshAccessToken(token: string) {
    this.calls.push({ method: "refresh", token });
    return this.answer(this.refreshResult);
  }
  async revokeToken(token: string) {
    this.calls.push({ method: "revoke", token });
    this.revoked.push(token);
    return this.revokeOk;
  }
  async insertEvent(token: string, calendarId: string, event: CalendarEventBody): Promise<EventWriteResult> {
    this.calls.push({ method: "insert", calendarId, eventId: event.id, event, token });
    if (this.insertError) throw this.insertError;
    if (this.events.has(event.id)) return "conflict";
    this.events.set(event.id, event);
    return "ok";
  }
  async patchEvent(token: string, calendarId: string, eventId: string, event: CalendarEventBody): Promise<EventWriteResult> {
    this.calls.push({ method: "patch", calendarId, eventId, event, token });
    if (!this.events.has(eventId)) return "gone";
    this.events.set(eventId, event);
    return "ok";
  }
  async deleteEvent(token: string, calendarId: string, eventId: string): Promise<"ok" | "gone"> {
    this.calls.push({ method: "delete", calendarId, eventId, token });
    if (this.deleteError) throw this.deleteError;
    return this.events.delete(eventId) ? "ok" : "gone";
  }
}

export const invalidGrant = () => new CalendarSyncError(RECONNECT_REQUIRED, false);

export const fakeCrypto = {
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => {
    if (!value.startsWith("enc:")) throw new Error("bad ciphertext");
    return value.slice(4);
  },
};
