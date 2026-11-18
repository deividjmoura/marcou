import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({
  isSupabaseConfigured: vi.fn(() => true),
  getSupabasePublicEnv: () => ({
    url: "https://project.supabase.co",
    publishableKey: "publishable-key",
  }),
}));

const mocks = vi.hoisted(() => ({ getClaims: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims: mocks.getClaims } })),
}));

import { proxy } from "../../proxy";

const ORIGIN = "https://marcoou.netlify.app";

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
  });

  it("encaminha o code recebido na landing page para o callback", async () => {
    const response = await proxy(new NextRequest(`${ORIGIN}/?code=abc-123`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${ORIGIN}/auth/callback?code=abc-123`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });

  it("não cria loop no próprio callback", async () => {
    const response = await proxy(
      new NextRequest(`${ORIGIN}/auth/callback?code=abc-123`),
    );

    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getClaims).toHaveBeenCalled();
  });

  it("mantém a visita normal à landing page", async () => {
    const response = await proxy(new NextRequest(`${ORIGIN}/`));

    expect(response.headers.get("location")).toBeNull();
    expect(mocks.getClaims).toHaveBeenCalled();
  });
});
