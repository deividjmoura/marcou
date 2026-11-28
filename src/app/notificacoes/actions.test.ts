import { afterEach, describe, expect, it, vi } from "vitest";

const {
  revalidatePathMock,
  isSupabaseConfiguredMock,
  getUserMock,
  upsertMock,
  fromMock,
  createClientMock,
} = vi.hoisted(() => {
  const revalidatePathMock = vi.fn();
  const isSupabaseConfiguredMock = vi.fn(() => true);
  const getUserMock = vi.fn();
  const upsertMock = vi.fn();
  const fromMock = vi.fn(() => ({ upsert: upsertMock }));
  const createClientMock = vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }));
  return {
    revalidatePathMock,
    isSupabaseConfiguredMock,
    getUserMock,
    upsertMock,
    fromMock,
    createClientMock,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: isSupabaseConfiguredMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { saveNotificationPreferencesAction } from "./actions";
import { notificationPreferenceFieldName } from "@/domain/notifications/preferences";

afterEach(() => {
  vi.clearAllMocks();
  isSupabaseConfiguredMock.mockReturnValue(true);
});

describe("saveNotificationPreferencesAction", () => {
  it("fails closed when Supabase is not configured", async () => {
    isSupabaseConfiguredMock.mockReturnValue(false);
    const formData = new FormData();
    formData.set("audience", "customer");

    const result = await saveNotificationPreferencesAction({}, formData);
    expect(result.error).toContain("Supabase");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("rejects invalid audience values", async () => {
    const formData = new FormData();
    formData.set("audience", "admin");

    const result = await saveNotificationPreferencesAction({}, formData);
    expect(result.error).toContain("inválida");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("requires an authenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const formData = new FormData();
    formData.set("audience", "customer");

    const result = await saveNotificationPreferencesAction({}, formData);
    expect(result.error).toContain("login");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("persists customer preferences via upsert and preserves mandatory events enabled", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    upsertMock.mockResolvedValue({ error: null });

    const formData = new FormData();
    formData.set("audience", "customer");
    formData.set(notificationPreferenceFieldName("booking.created"), "on");
    // booking.reminder e booking.confirmed omitidos => desligados
    // tentativa maliciosa de silenciar obrigatórios:
    formData.set(notificationPreferenceFieldName("booking.cancelled"), "false");
    formData.set(notificationPreferenceFieldName("booking.changed"), "false");

    const result = await saveNotificationPreferencesAction({}, formData);

    expect(result).toEqual({
      success: "Preferências de notificação salvas.",
    });
    expect(fromMock).toHaveBeenCalledWith("notification_preferences");
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const [rows, options] = upsertMock.mock.calls[0];
    expect(options).toEqual({ onConflict: "user_id,event_type,channel" });

    const byEvent = new Map(
      (rows as Array<{ event_type: string; enabled: boolean; user_id: string; channel: string }>).map(
        (r) => [r.event_type, r],
      ),
    );
    expect(byEvent.get("booking.created")?.enabled).toBe(true);
    expect(byEvent.get("booking.confirmed")?.enabled).toBe(false);
    expect(byEvent.get("booking.reminder")?.enabled).toBe(false);
    expect(byEvent.get("booking.expired")?.enabled).toBe(false);
    expect(byEvent.get("booking.cancelled")?.enabled).toBe(true);
    expect(byEvent.get("booking.changed")?.enabled).toBe(true);
    expect(byEvent.has("booking.proof_received")).toBe(false);
    expect([...byEvent.values()].every((r) => r.user_id === "user-123" && r.channel === "in_app")).toBe(true);

    expect(revalidatePathMock).toHaveBeenCalledWith("/minha-conta");
    expect(revalidatePathMock).toHaveBeenCalledWith("/painel");
    expect(revalidatePathMock).toHaveBeenCalledWith("/notificacoes");
  });

  it("returns generic error message without leaking database details on failure", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    upsertMock.mockResolvedValue({
      error: { message: "duplicate key value violates internal_constraint_xyz" },
    });

    const formData = new FormData();
    formData.set("audience", "provider");

    const result = await saveNotificationPreferencesAction({}, formData);
    expect(result.error).toBe(
      "Não foi possível salvar suas preferências agora. Tente novamente.",
    );
    expect(result.error).not.toContain("internal_constraint_xyz");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
