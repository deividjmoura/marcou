import { afterEach, describe, expect, it, vi } from "vitest";

const { limitMock, selectMock, fromMock, createServerClientMock } = vi.hoisted(
  () => {
    const limitMock = vi.fn();
    const selectMock = vi.fn(() => ({ limit: limitMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    const createServerClientMock = vi.fn(() => ({ from: fromMock }));
    return { limitMock, selectMock, fromMock, createServerClientMock };
  },
);

vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

import { GET } from "./route";
import { APP_VERSION, getBuildCommit, isHealthDeepAuthorized } from "@/server/health";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("responds 200 with version and sanitized commit without touching secrets or Supabase", async () => {
    vi.stubEnv("COMMIT_REF", "994cf1c4efe65754ebb70042b448259344a2cc7c");
    vi.stubEnv("HEALTH_CHECK_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const response = await GET(new Request("https://marcoou.netlify.app/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      version: APP_VERSION,
      commit: "994cf1c",
    });
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("returns commit='unknown' when build commit env is absent or non-hex", async () => {
    vi.stubEnv("COMMIT_REF", "not-a-valid-sha;drop");
    vi.stubEnv("GITHUB_SHA", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");

    expect(getBuildCommit()).toBe("unknown");

    const response = await GET(new Request("https://marcoou.netlify.app/api/health?deep=0"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.commit).toBe("unknown");
    expect(body.checks).toBeUndefined();
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects deep mode (401) when HEALTH_CHECK_SECRET is not configured", async () => {
    vi.stubEnv("HEALTH_CHECK_SECRET", "");

    const response = await GET(
      new Request("https://marcoou.netlify.app/api/health?deep=1", {
        headers: { authorization: "Bearer any-token" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ status: "unauthorized" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects deep mode (401) without bearer credential or with wrong token", async () => {
    vi.stubEnv("HEALTH_CHECK_SECRET", "super-secret-health-token");

    for (const req of [
      new Request("https://marcoou.netlify.app/api/health?deep=1"),
      new Request("https://marcoou.netlify.app/api/health?deep=true", {
        headers: { authorization: "Basic c3VwZXI=" },
      }),
      new Request("https://marcoou.netlify.app/api/health?mode=deep", {
        headers: { authorization: "Bearer wrong-token" },
      }),
      new Request("https://marcoou.netlify.app/api/health?deep", {
        headers: { authorization: "Bearer super-secret-health-tokeX" },
      }),
    ]) {
      const response = await GET(req);
      const body = await response.json();
      expect(response.status).toBe(401);
      expect(body).toEqual({ status: "unauthorized" });
      expect(response.headers.get("cache-control")).toContain("no-store");
    }

    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("accepts deep mode with valid bearer token and reports database ok", async () => {
    vi.stubEnv("HEALTH_CHECK_SECRET", "super-secret-health-token");
    vi.stubEnv("COMMIT_REF", "abcdef1234567");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    limitMock.mockResolvedValue({ error: null });

    const response = await GET(
      new Request("https://marcoou.netlify.app/api/health?deep=1", {
        headers: { authorization: "bearer super-secret-health-token" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      version: APP_VERSION,
      commit: "abcdef1",
      checks: { database: "ok" },
    });
    expect(fromMock).toHaveBeenCalledWith("legal_documents");
    expect(selectMock).toHaveBeenCalledWith("id", { head: true });
    expect(limitMock).toHaveBeenCalledWith(1);
    expect(JSON.stringify(body)).not.toContain("supabase.co");
    expect(JSON.stringify(body)).not.toContain("super-secret-health-token");
  });

  it("returns 503 degraded in authorized deep mode when database query fails without leaking error details", async () => {
    vi.stubEnv("HEALTH_CHECK_SECRET", "super-secret-health-token");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    limitMock.mockResolvedValue({
      error: { message: "password authentication failed for postgres://internal" },
    });

    const response = await GET(
      new Request("https://marcoou.netlify.app/api/health?deep=true", {
        headers: { authorization: "Bearer super-secret-health-token" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: "degraded",
      version: APP_VERSION,
      commit: "unknown",
      checks: { database: "error" },
    });
    expect(JSON.stringify(body)).not.toContain("postgres://");
    expect(JSON.stringify(body)).not.toContain("password");
  });

  it("returns 503 unconfigured in authorized deep mode when Supabase env is missing", async () => {
    vi.stubEnv("HEALTH_CHECK_SECRET", "super-secret-health-token");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    const response = await GET(
      new Request("https://marcoou.netlify.app/api/health?deep=1", {
        headers: { authorization: "Bearer super-secret-health-token" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks).toEqual({ database: "unconfigured" });
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("compares bearer secrets strictly by exact content and length", () => {
    const okReq = new Request("https://marcoou.netlify.app/api/health?deep=1", {
      headers: { authorization: "Bearer exact-secret" },
    });
    const shortReq = new Request("https://marcoou.netlify.app/api/health?deep=1", {
      headers: { authorization: "Bearer exact" },
    });
    expect(isHealthDeepAuthorized(okReq, "exact-secret")).toBe(true);
    expect(isHealthDeepAuthorized(shortReq, "exact-secret")).toBe(false);
    expect(isHealthDeepAuthorized(okReq, "")).toBe(false);
  });
});
