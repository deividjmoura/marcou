import type { CalendarAdminClient } from "./admin";
import { CalendarSyncError } from "./errors";

export type ConnectionStatus = "pending" | "connected" | "suspended";

export type CalendarConnectionRow = {
  provider_id: string;
  refresh_token_ciphertext: string | null;
  access_token_ciphertext: string | null;
  access_token_expires_at: string | null;
  calendar_id: string;
  connection_status: ConnectionStatus;
  suspended_reason: string | null;
  disconnect_requested_at: string | null;
};

export type OutboxJob = {
  id: string;
  booking_id: string;
  booking_event_id: string | null;
  reason: "booking_event" | "backfill";
  operation: "upsert" | "delete";
  status: string;
  attempts: number;
  lease_token: string | null;
};

export type BookingSnapshot = {
  id: string;
  provider_id: string;
  service_name_snapshot: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
};

export type EventMapping = {
  booking_id: string;
  provider_id: string;
  calendar_id: string;
  google_event_id: string;
  orphaned_at: string | null;
};

export type ConsumeStateOutcome = "ok" | "invalid" | "expired" | "forbidden" | "disconnecting";

/**
 * Persistência do Calendar. Toda escrita confirma que afetou a linha esperada;
 * qualquer erro vira CalendarSyncError (retentável) em vez de ser ignorado.
 */
export interface CalendarStore {
  claimJobs(limit: number): Promise<OutboxJob[]>;
  completeJob(jobId: string, leaseToken: string, code: string | null): Promise<void>;
  failJob(jobId: string, leaseToken: string, code: string, availableAt: string): Promise<void>;
  killJob(jobId: string, leaseToken: string, code: string): Promise<void>;

  getBooking(bookingId: string): Promise<BookingSnapshot | null>;
  getMapping(bookingId: string): Promise<EventMapping | null>;
  saveMapping(mapping: Omit<EventMapping, "orphaned_at">): Promise<void>;
  deleteMapping(bookingId: string, providerId: string): Promise<void>;
  markMappingOrphaned(bookingId: string): Promise<void>;
  listActiveMappings(providerId: string, limit: number): Promise<EventMapping[]>;
  orphanActiveMappings(providerId: string): Promise<number>;
  countOrphanedMappings(providerId: string): Promise<number>;

  getConnection(providerId: string): Promise<CalendarConnectionRow | null>;
  saveAccessToken(providerId: string, ciphertext: string, expiresAt: string): Promise<void>;
  suspendConnection(providerId: string, reason: string): Promise<void>;

  startOAuth(input: { providerId: string; userId: string; stateHash: string; expiresAt: string }): Promise<"started" | "disconnecting">;
  consumeOAuthState(stateHash: string, userId: string): Promise<{ outcome: ConsumeStateOutcome; providerId: string | null }>;
  completeOAuth(input: {
    providerId: string;
    refreshCiphertext: string;
    accessCiphertext: string;
    accessExpiresAt: string;
    grantedScope: string;
  }): Promise<void>;

  requestDisconnect(providerId: string): Promise<"requested" | "already" | "none">;
  listDisconnectingProviders(limit: number): Promise<string[]>;
  finalizeDisconnect(providerId: string): Promise<{ finalized: boolean; refreshCiphertext: string | null }>;
  completeDisconnect(providerId: string): Promise<void>;
}

const CONNECTION_COLUMNS =
  "provider_id,refresh_token_ciphertext,access_token_ciphertext,access_token_expires_at,calendar_id,connection_status,suspended_reason,disconnect_requested_at";

function fail(code: string): never {
  throw new CalendarSyncError(code, true);
}

export function createSupabaseCalendarStore(admin: CalendarAdminClient): CalendarStore {
  const now = () => new Date().toISOString();

  async function updateJob(jobId: string, leaseToken: string, values: Record<string, unknown>, code: string) {
    const { data, error } = await admin
      .from("calendar_sync_outbox")
      .update(values)
      .eq("id", jobId)
      .eq("status", "processing")
      .eq("lease_token", leaseToken)
      .select("id");
    if (error || !data || data.length !== 1) fail(code);
  }

  const store: CalendarStore = {
    async claimJobs(limit) {
      const { data, error } = await admin.rpc("claim_calendar_sync_jobs", { p_limit: limit });
      if (error) fail("calendar_outbox_claim_failed");
      return (data ?? []) as OutboxJob[];
    },

    completeJob(jobId, leaseToken, code) {
      const at = now();
      return updateJob(
        jobId,
        leaseToken,
        { status: "succeeded", completed_at: at, processing_started_at: null, lease_token: null, last_error_code: code, available_at: at },
        "calendar_outbox_complete_failed",
      );
    },

    failJob(jobId, leaseToken, code, availableAt) {
      return updateJob(
        jobId,
        leaseToken,
        { status: "failed", completed_at: null, processing_started_at: null, lease_token: null, last_error_code: code, available_at: availableAt },
        "calendar_outbox_fail_failed",
      );
    },

    killJob(jobId, leaseToken, code) {
      return updateJob(
        jobId,
        leaseToken,
        { status: "dead", completed_at: now(), processing_started_at: null, lease_token: null, last_error_code: code },
        "calendar_outbox_dead_failed",
      );
    },

    async getBooking(bookingId) {
      const { data, error } = await admin
        .from("bookings")
        .select("id,provider_id,service_name_snapshot,starts_at,ends_at,timezone,status")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) fail("booking_lookup_failed");
      return (data as BookingSnapshot | null) ?? null;
    },

    async getMapping(bookingId) {
      const { data, error } = await admin
        .from("booking_calendar_events")
        .select("booking_id,provider_id,calendar_id,google_event_id,orphaned_at")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (error) fail("event_mapping_lookup_failed");
      return (data as EventMapping | null) ?? null;
    },

    async saveMapping(mapping) {
      const { data, error } = await admin
        .from("booking_calendar_events")
        .upsert({ ...mapping, orphaned_at: null, updated_at: now() })
        .select("booking_id");
      if (error || !data || data.length !== 1) fail("calendar_event_mapping_save_failed");
    },

    async deleteMapping(bookingId, providerId) {
      const { error } = await admin
        .from("booking_calendar_events")
        .delete()
        .eq("booking_id", bookingId)
        .eq("provider_id", providerId)
        .select("booking_id");
      // 0 linhas é aceitável (já removido por outra execução); erro não.
      if (error) fail("calendar_event_mapping_delete_failed");
    },

    async markMappingOrphaned(bookingId) {
      const { error } = await admin
        .from("booking_calendar_events")
        .update({ orphaned_at: now(), updated_at: now() })
        .eq("booking_id", bookingId)
        .is("orphaned_at", null);
      if (error) fail("calendar_event_mapping_orphan_failed");
    },

    async listActiveMappings(providerId, limit) {
      const { data, error } = await admin
        .from("booking_calendar_events")
        .select("booking_id,provider_id,calendar_id,google_event_id,orphaned_at")
        .eq("provider_id", providerId)
        .is("orphaned_at", null)
        .limit(limit);
      if (error) fail("event_mapping_lookup_failed");
      return (data ?? []) as EventMapping[];
    },

    async orphanActiveMappings(providerId) {
      const { data, error } = await admin
        .from("booking_calendar_events")
        .update({ orphaned_at: now(), updated_at: now() })
        .eq("provider_id", providerId)
        .is("orphaned_at", null)
        .select("booking_id");
      if (error) fail("calendar_event_mapping_orphan_failed");
      return (data ?? []).length;
    },

    async countOrphanedMappings(providerId) {
      const { count, error } = await admin
        .from("booking_calendar_events")
        .select("booking_id", { count: "exact", head: true })
        .eq("provider_id", providerId)
        .not("orphaned_at", "is", null);
      if (error) fail("event_mapping_lookup_failed");
      return count ?? 0;
    },

    async getConnection(providerId) {
      const { data, error } = await admin
        .from("calendar_connections")
        .select(CONNECTION_COLUMNS)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (error) fail("calendar_connection_lookup_failed");
      return (data as CalendarConnectionRow | null) ?? null;
    },

    async saveAccessToken(providerId, ciphertext, expiresAt) {
      const { data, error } = await admin
        .from("calendar_connections")
        .update({ access_token_ciphertext: ciphertext, access_token_expires_at: expiresAt, updated_at: now() })
        .eq("provider_id", providerId)
        .select("provider_id");
      if (error || !data || data.length !== 1) fail("calendar_token_save_failed");
    },

    async suspendConnection(providerId, reason) {
      const { error } = await admin
        .from("calendar_connections")
        .update({
          connection_status: "suspended",
          suspended_reason: reason,
          access_token_ciphertext: null,
          access_token_expires_at: null,
          updated_at: now(),
        })
        .eq("provider_id", providerId);
      if (error) fail("calendar_connection_suspend_failed");
    },

    async startOAuth({ providerId, userId, stateHash, expiresAt }) {
      const existing = await store.getConnection(providerId);
      if (existing?.disconnect_requested_at) return "disconnecting";
      const values = {
        oauth_state_hash: stateHash,
        oauth_state_expires_at: expiresAt,
        oauth_state_user_id: userId,
        updated_at: now(),
      };
      if (existing) {
        const { data, error } = await admin
          .from("calendar_connections")
          .update(values)
          .eq("provider_id", providerId)
          .is("disconnect_requested_at", null)
          .select("provider_id");
        if (error) fail("calendar_oauth_start_failed");
        return data && data.length === 1 ? "started" : "disconnecting";
      }
      const { error } = await admin.from("calendar_connections").insert({ provider_id: providerId, ...values });
      if (error) fail("calendar_oauth_start_failed");
      return "started";
    },

    async consumeOAuthState(stateHash, userId) {
      const { data, error } = await admin.rpc("consume_calendar_oauth_state", {
        p_state_hash: stateHash,
        p_user_id: userId,
      });
      if (error) fail("calendar_oauth_state_failed");
      const row = (Array.isArray(data) ? data[0] : data) as
        | { connection_provider_id: string | null; outcome: ConsumeStateOutcome }
        | undefined;
      if (!row) return { outcome: "invalid", providerId: null };
      return { outcome: row.outcome, providerId: row.connection_provider_id };
    },

    async completeOAuth({ providerId, refreshCiphertext, accessCiphertext, accessExpiresAt, grantedScope }) {
      const at = now();
      const { data, error } = await admin
        .from("calendar_connections")
        .update({
          refresh_token_ciphertext: refreshCiphertext,
          access_token_ciphertext: accessCiphertext,
          access_token_expires_at: accessExpiresAt,
          granted_scope: grantedScope,
          connection_status: "connected",
          suspended_reason: null,
          connected_at: at,
          updated_at: at,
        })
        .eq("provider_id", providerId)
        .is("disconnect_requested_at", null)
        .select("provider_id");
      if (error || !data || data.length !== 1) fail("calendar_oauth_save_failed");
    },

    async requestDisconnect(providerId) {
      const existing = await store.getConnection(providerId);
      if (!existing) return "none";
      if (existing.disconnect_requested_at) return "already";
      const { data, error } = await admin
        .from("calendar_connections")
        .update({
          connection_status: "suspended",
          suspended_reason: "disconnect_requested",
          disconnect_requested_at: now(),
          oauth_state_hash: null,
          oauth_state_expires_at: null,
          oauth_state_user_id: null,
          updated_at: now(),
        })
        .eq("provider_id", providerId)
        .is("disconnect_requested_at", null)
        .select("provider_id");
      if (error) fail("calendar_disconnect_request_failed");
      return data && data.length === 1 ? "requested" : "already";
    },

    async listDisconnectingProviders(limit) {
      const { data, error } = await admin
        .from("calendar_connections")
        .select("provider_id")
        .not("disconnect_requested_at", "is", null)
        .order("disconnect_requested_at", { ascending: true })
        .limit(limit);
      if (error) fail("calendar_connection_lookup_failed");
      return (data ?? []).map((row) => row.provider_id as string);
    },

    async finalizeDisconnect(providerId) {
      const { data, error } = await admin.rpc("finalize_calendar_disconnect", { p_provider_id: providerId });
      if (error) fail("calendar_disconnect_finalize_failed");
      const row = (Array.isArray(data) ? data[0] : data) as
        | { finalized: boolean; revoke_token_ciphertext: string | null }
        | undefined;
      return { finalized: Boolean(row?.finalized), refreshCiphertext: row?.revoke_token_ciphertext ?? null };
    },

    async completeDisconnect(providerId) {
      const { data, error } = await admin.rpc("complete_calendar_disconnect", { p_provider_id: providerId });
      if (error || data !== true) fail("calendar_disconnect_complete_failed");
    },
  };
  return store;
}
