import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { GET } from "@/app/api/cron/route";

const secret = "scheduler-test-secret";

function request(authorization?: string) {
  return new Request("https://marcou.test/api/cron", {
    headers: authorization ? { authorization } : {},
  });
}

function expectPrivateNoStore(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("expires")).toBe("0");
}

describe("GET /api/cron reminder scheduler", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
    mocks.rpc.mockReset();
    mocks.createClient.mockReset().mockReturnValue({ rpc: mocks.rpc });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("denies requests without the bearer secret and returns private no-store", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expectPrivateNoStore(response);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase URL is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const response = await GET(request("Bearer " + secret));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "cron_not_configured" });
    expectPrivateNoStore(response);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 503 when service-role key is absent", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "cron_not_configured" });
    expectPrivateNoStore(response);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("runs reminders only and reports a safe count", async () => {
    mocks.rpc.mockResolvedValue({ data: 2, error: null });
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.ok).toBe(true);
    expect(payload.jobs.reminders).toEqual({ status: "succeeded", created: 2 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("create_booking_reminders", {
      p_within_hours: 24,
    });
    expectPrivateNoStore(response);
  });

  it("returns a generic error when the reminder RPC fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private db detail" } });
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "cron_job_failed" });
    expect(log).toHaveBeenCalledWith("[cron] create_booking_reminders failed", { code: "42501" });
    expect(JSON.stringify(body)).not.toContain("private db detail");
    expectPrivateNoStore(response);
    log.mockRestore();
  });

  it("handles thrown exceptions without exposing their details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockRejectedValue(new Error("secret/query details"));
    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "cron_job_failed" });
    expect(log).toHaveBeenCalledWith("[cron] reminder scheduler threw", { name: "Error" });
    expectPrivateNoStore(response);
    log.mockRestore();
  });
});
