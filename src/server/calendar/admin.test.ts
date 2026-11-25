import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarAdminClient } from "./admin";

const original = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", original.url],
    ["SUPABASE_SERVICE_ROLE_KEY", original.key],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("calendar admin client", () => {
  it("usa a chave service-role como bearer, sem sessão de cookies", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-test";
    const calls: { url: string; headers: Headers }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: new Headers(init?.headers) });
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    });

    const { error } = await calendarAdminClient().from("calendar_connections").select("provider_id").limit(1);

    expect(error).toBeNull();
    expect(calls[0].url).toContain("/rest/v1/calendar_connections");
    expect(calls[0].headers.get("authorization")).toBe("Bearer service-key-test");
  });

  it("falha fechada sem chave service-role", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => calendarAdminClient()).toThrow("calendar_server_not_configured");
  });
});
