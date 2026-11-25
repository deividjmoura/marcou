import { beforeEach, describe, expect, it } from "vitest";
import { googleEventIdForBooking } from "./crypto";
import { CalendarSyncError } from "./errors";
import type { BookingSnapshot } from "./store";
import { FakeGoogle, FakeStore, fakeCrypto, invalidGrant } from "./test-fakes";
import { CALENDAR_MAX_ATTEMPTS, cleanupProviderDisconnect, retryDelaySeconds, runCalendarSync } from "./worker";

const PROVIDER = "provider-1";
const NOW = Date.parse("2026-11-25T12:00:00Z");

function booking(id: string, status: string, overrides: Partial<BookingSnapshot> = {}): BookingSnapshot {
  return {
    id,
    provider_id: PROVIDER,
    service_name_snapshot: "Corte",
    starts_at: "2026-12-01T13:00:00Z",
    ends_at: "2026-12-01T13:30:00Z",
    timezone: "America/Sao_Paulo",
    status,
    ...overrides,
  };
}

let store: FakeStore;
let google: FakeGoogle;
let logs: Record<string, unknown>[];
const deps = () => ({ store, google, crypto: fakeCrypto, now: () => NOW, log: (e: Record<string, unknown>) => logs.push(e) });

beforeEach(() => {
  store = new FakeStore();
  google = new FakeGoogle();
  logs = [];
});

describe("calendar worker — atualização", () => {
  it("cria evento para reserva confirmada com payload sem dados do cliente e salva o vínculo", async () => {
    store.connect(PROVIDER);
    store.bookings.set("b1", booking("b1", "confirmed"));
    store.addJob({ id: "j1", booking_id: "b1" });

    const summary = await runCalendarSync(deps());

    expect(summary).toMatchObject({ claimed: 1, succeeded: 1, failed: 0, dead: 0, persistErrors: 0 });
    const eventId = googleEventIdForBooking("b1");
    const insert = google.calls.find((c) => c.method === "insert")!;
    expect(insert.event).toEqual({
      id: eventId,
      summary: "Corte",
      start: { dateTime: "2026-12-01T13:00:00Z", timeZone: "America/Sao_Paulo" },
      end: { dateTime: "2026-12-01T13:30:00Z", timeZone: "America/Sao_Paulo" },
    });
    expect(store.mappings.get("b1")).toMatchObject({ google_event_id: eventId, calendar_id: "primary" });
    expect(store.jobs.get("j1")!.status).toBe("succeeded");
    // O access token renovado é persistido cifrado.
    expect(store.connections.get(PROVIDER)!.access_token_ciphertext).toBe("enc:access-1");
  });

  it("transforma 409 do insert (ID determinístico já existente) em PATCH", async () => {
    store.connect(PROVIDER);
    store.bookings.set("b1", booking("b1", "confirmed"));
    google.events.set(googleEventIdForBooking("b1"), {} as never);
    store.addJob({ id: "j1", booking_id: "b1" });

    await runCalendarSync(deps());

    expect(google.calls.map((c) => c.method)).toEqual(["refresh", "insert", "patch"]);
    expect(store.mappings.has("b1")).toBe(true);
  });

  it("reaproveita access token armazenado e ainda válido", async () => {
    store.connect(PROVIDER, {
      access_token_ciphertext: "enc:stored",
      access_token_expires_at: new Date(NOW + 30 * 60_000).toISOString(),
    });
    store.bookings.set("b1", booking("b1", "confirmed"));
    store.addJob({ id: "j1", booking_id: "b1" });

    await runCalendarSync(deps());

    expect(google.calls.some((c) => c.method === "refresh")).toBe(false);
    expect(google.calls.find((c) => c.method === "insert")!.token).toBe("stored");
  });

  it("não chama o Google para prestador sem conexão", async () => {
    store.bookings.set("b1", booking("b1", "confirmed"));
    store.addJob({ id: "j1", booking_id: "b1" });

    const summary = await runCalendarSync(deps());

    expect(summary.succeeded).toBe(1);
    expect(google.calls).toHaveLength(0);
    expect(store.jobs.get("j1")!.last_error_code).toBe("calendar_not_connected");
  });

  it("job de upsert antigo para reserva já cancelada remove o evento (estado manda)", async () => {
    store.connect(PROVIDER);
    store.bookings.set("b1", booking("b1", "cancelled"));
    const eventId = googleEventIdForBooking("b1");
    google.events.set(eventId, {} as never);
    store.mappings.set("b1", { booking_id: "b1", provider_id: PROVIDER, calendar_id: "primary", google_event_id: eventId, orphaned_at: null });
    store.addJob({ id: "j1", booking_id: "b1", operation: "upsert" });

    await runCalendarSync(deps());

    expect(google.events.has(eventId)).toBe(false);
    expect(store.mappings.has("b1")).toBe(false);
  });
});

describe("calendar worker — exclusão", () => {
  beforeEach(() => {
    store.connect(PROVIDER);
    store.bookings.set("b1", booking("b1", "cancelled"));
    store.mappings.set("b1", { booking_id: "b1", provider_id: PROVIDER, calendar_id: "primary", google_event_id: "evt", orphaned_at: null });
    google.events.set("evt", {} as never);
    store.addJob({ id: "j1", booking_id: "b1", operation: "delete" });
  });

  it("remove o evento e depois o vínculo", async () => {
    const summary = await runCalendarSync(deps());
    expect(summary.succeeded).toBe(1);
    expect(google.events.has("evt")).toBe(false);
    expect(store.mappings.has("b1")).toBe(false);
  });

  it("falha na busca da conexão não apaga o vínculo nem o evento", async () => {
    store.fail.add("getConnection");
    const summary = await runCalendarSync(deps());
    expect(summary.failed).toBe(1);
    expect(store.mappings.has("b1")).toBe(true);
    expect(google.events.has("evt")).toBe(true);
    expect(store.jobs.get("j1")).toMatchObject({ status: "failed", last_error_code: "getConnection_failed" });
  });

  it("erro ao apagar o vínculo deixa o job para retry", async () => {
    store.fail.add("deleteMapping");
    const summary = await runCalendarSync(deps());
    expect(summary.failed).toBe(1);
    expect(store.jobs.get("j1")!.status).toBe("failed");
  });

  it("evento já ausente no Google (404/410) conta como removido", async () => {
    google.events.delete("evt");
    await runCalendarSync(deps());
    expect(store.mappings.has("b1")).toBe(false);
    expect(store.jobs.get("j1")!.status).toBe("succeeded");
  });

  it("sem conexão, mantém o vínculo como órfão em vez de apagá-lo", async () => {
    store.connections.clear();
    await runCalendarSync(deps());
    expect(store.mappings.get("b1")!.orphaned_at).not.toBeNull();
    expect(store.jobs.get("j1")).toMatchObject({ status: "succeeded", last_error_code: "mapping_orphaned" });
  });
});

describe("calendar worker — falhas e estado terminal", () => {
  beforeEach(() => {
    store.connect(PROVIDER);
    store.bookings.set("b1", booking("b1", "confirmed"));
  });

  it("erro transitório do Google agenda retry com backoff", async () => {
    google.insertError = new CalendarSyncError("google_event_insert_http_503", true);
    store.addJob({ id: "j1", booking_id: "b1", attempts: 2 });

    const summary = await runCalendarSync(deps());

    expect(summary.failed).toBe(1);
    const job = store.jobs.get("j1")!;
    expect(job.status).toBe("failed");
    expect(job.last_error_code).toBe("google_event_insert_http_503");
    expect(Date.parse(job.available_at!)).toBe(NOW + retryDelaySeconds(3) * 1000);
  });

  it("última tentativa vira dead e é registrada", async () => {
    google.insertError = new CalendarSyncError("google_event_insert_http_503", true);
    store.addJob({ id: "j1", booking_id: "b1", attempts: CALENDAR_MAX_ATTEMPTS - 1 });

    const summary = await runCalendarSync(deps());

    expect(summary.dead).toBe(1);
    expect(store.jobs.get("j1")!.status).toBe("dead");
    expect(logs).toContainEqual(expect.objectContaining({ event: "job_dead", jobId: "j1" }));
  });

  it("erro permanente (4xx) vai direto para dead", async () => {
    google.insertError = new CalendarSyncError("google_event_insert_http_400", false);
    store.addJob({ id: "j1", booking_id: "b1" });
    const summary = await runCalendarSync(deps());
    expect(summary.dead).toBe(1);
  });

  it("invalid_grant suspende a conexão e não fica tentando", async () => {
    google.refreshResult = invalidGrant();
    store.addJob({ id: "j1", booking_id: "b1" });

    const summary = await runCalendarSync(deps());

    expect(summary.dead).toBe(1);
    expect(store.connections.get(PROVIDER)).toMatchObject({ connection_status: "suspended", suspended_reason: "invalid_grant" });
    expect(store.jobs.get("j1")!.last_error_code).toBe("calendar_reconnect_required");
  });

  it("conexão suspensa não chama o Google e encerra o job", async () => {
    store.connect(PROVIDER, { connection_status: "suspended", suspended_reason: "invalid_grant" });
    store.addJob({ id: "j1", booking_id: "b1" });
    const summary = await runCalendarSync(deps());
    expect(summary.dead).toBe(1);
    expect(google.calls).toHaveLength(0);
  });

  it("erro ao salvar vínculo deixa retry; a nova tentativa vira PATCH idempotente", async () => {
    store.fail.add("saveMapping");
    store.addJob({ id: "j1", booking_id: "b1" });
    expect((await runCalendarSync(deps())).failed).toBe(1);

    store.fail.delete("saveMapping");
    expect((await runCalendarSync(deps())).succeeded).toBe(1);
    expect(google.calls.filter((c) => c.method === "patch")).toHaveLength(1);
    expect(store.mappings.has("b1")).toBe(true);
  });

  it("não ignora falha ao marcar succeeded: conta persistError e mantém processing", async () => {
    store.fail.add("completeJob");
    store.addJob({ id: "j1", booking_id: "b1" });

    const summary = await runCalendarSync(deps());

    expect(summary).toMatchObject({ succeeded: 0, persistErrors: 1 });
    expect(store.jobs.get("j1")!.status).toBe("processing");
  });

  it("não ignora falha ao marcar failed", async () => {
    google.insertError = new CalendarSyncError("google_event_insert_http_503", true);
    store.fail.add("failJob");
    store.addJob({ id: "j1", booking_id: "b1" });
    const summary = await runCalendarSync(deps());
    expect(summary).toMatchObject({ failed: 0, persistErrors: 1 });
  });

  it("logs não contêm token nem payload do evento", async () => {
    google.insertError = new CalendarSyncError("google_event_insert_http_400", false);
    store.addJob({ id: "j1", booking_id: "b1" });
    await runCalendarSync(deps());
    const text = JSON.stringify(logs);
    expect(text).not.toContain("access-1");
    expect(text).not.toContain("refresh");
    expect(text).not.toContain("Corte");
  });
});

describe("calendar — desconexão", () => {
  beforeEach(() => {
    store.connect(PROVIDER);
    for (const id of ["b1", "b2"]) {
      store.mappings.set(id, { booking_id: id, provider_id: PROVIDER, calendar_id: "primary", google_event_id: `evt-${id}`, orphaned_at: null });
      google.events.set(`evt-${id}`, {} as never);
    }
  });

  it("remove eventos, apaga vínculos, finaliza e revoga o refresh token", async () => {
    await store.requestDisconnect(PROVIDER);
    const result = await cleanupProviderDisconnect(deps(), PROVIDER);

    expect(result).toMatchObject({ finalized: true, removed: 2, orphaned: 0 });
    expect(google.events.size).toBe(0);
    expect(store.mappings.size).toBe(0);
    expect(store.connections.has(PROVIDER)).toBe(false);
    expect(google.revoked).toEqual(["refresh"]);
  });

  it("falha ao remover no Google mantém vínculos e conexão para o worker", async () => {
    google.deleteError = new CalendarSyncError("google_event_delete_http_503", true);
    await store.requestDisconnect(PROVIDER);

    const result = await cleanupProviderDisconnect(deps(), PROVIDER);

    expect(result).toMatchObject({ finalized: false, pending: true });
    expect(store.mappings.size).toBe(2);
    expect(store.connections.get(PROVIDER)!.refresh_token_ciphertext).toBe("enc:refresh");
    expect(google.revoked).toHaveLength(0);

    // O worker conclui quando o Google volta.
    google.deleteError = null;
    const summary = await runCalendarSync(deps());
    expect(summary.disconnectsFinalized).toBe(1);
    expect(store.mappings.size).toBe(0);
    expect(store.connections.has(PROVIDER)).toBe(false);
  });

  it("token revogado marca vínculos como órfãos (rastro) e finaliza", async () => {
    google.refreshResult = invalidGrant();
    await store.requestDisconnect(PROVIDER);

    const result = await cleanupProviderDisconnect(deps(), PROVIDER);

    expect(result).toMatchObject({ finalized: true, orphaned: 2 });
    expect([...store.mappings.values()].every((m) => m.orphaned_at)).toBe(true);
    expect(store.connections.has(PROVIDER)).toBe(false);
  });

  it("jobs durante a desconexão viram no-op; a limpeza cuida dos eventos", async () => {
    await store.requestDisconnect(PROVIDER);
    store.finalizeBlocked = true;
    store.bookings.set("b3", booking("b3", "confirmed"));
    store.addJob({ id: "j3", booking_id: "b3" });

    google.deleteError = new CalendarSyncError("google_event_delete_http_503", true);
    await runCalendarSync(deps());

    expect(store.jobs.get("j3")).toMatchObject({ status: "succeeded", last_error_code: "calendar_disconnecting" });
    expect(google.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("falha de revogação não impede finalizar, mas é registrada", async () => {
    google.revokeOk = false;
    store.mappings.clear();
    await store.requestDisconnect(PROVIDER);
    const result = await cleanupProviderDisconnect(deps(), PROVIDER);
    expect(result.finalized).toBe(true);
    expect(logs).toContainEqual(expect.objectContaining({ event: "revoke_failed" }));
  });
});
