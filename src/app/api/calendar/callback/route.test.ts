import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getOwnedProvider: vi.fn(),
  completeCalendarOAuth: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/server/bookings", () => ({
  requireUser: mocks.requireUser,
  getOwnedProvider: mocks.getOwnedProvider,
}));
vi.mock("@/server/calendar/crypto", () => ({ isCalendarFeatureEnabled: () => true }));
vi.mock("@/server/calendar/http", () => ({
  calendarSiteOrigin: () => {
    const configured = process.env.NEXT_PUBLIC_SITE_URL;
    if (!configured) return null;
    try {
      return new URL(configured).origin;
    } catch {
      return null;
    }
  },
  calendarNoticeRedirect: (notice: string, origin: string, status = 302) =>
    Response.redirect(new URL(`/painel/integracoes/calendario?calendar=${notice}`, origin), status),
}));
vi.mock("@/server/calendar/oauth", () => ({
  calendarRedirectUri: () => "https://configured.example/api/calendar/callback",
}));
vi.mock("@/server/calendar/oauth-flow", () => ({
  completeCalendarOAuth: mocks.completeCalendarOAuth,
}));
vi.mock("@/server/calendar/runtime", () => ({
  calendarRuntime: () => ({}),
  isCalendarServerConfigured: () => true,
}));

import { GET } from "./route";

describe("GET /api/calendar/callback — origem canônica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    mocks.requireUser.mockResolvedValue({ id: "owner-1" });
    mocks.getOwnedProvider.mockResolvedValue({ id: "provider-1" });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("não usa a origem da requisição como fallback quando NEXT_PUBLIC_SITE_URL falta", async () => {
    const request = new Request(
      "https://attacker.example/api/calendar/callback?state=valid-state&code=valid-code",
    );

    const response = await GET(request);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "calendar_origin_not_configured" });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.getOwnedProvider).not.toHaveBeenCalled();
    expect(mocks.completeCalendarOAuth).not.toHaveBeenCalled();
  });
});
