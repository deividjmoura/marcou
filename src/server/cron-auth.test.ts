import { afterEach, describe, expect, it, vi } from "vitest";
import { isCronAuthorized } from "@/server/cron-auth";

function makeRequest(authorization?: string) {
  return new Request("https://marcou.test/api/cron", {
    headers: authorization !== undefined ? { authorization } : {},
  });
}

describe("isCronAuthorized", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies by default when CRON_SECRET is unset or empty", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronAuthorized(makeRequest("Bearer any-token"))).toBe(false);
  });

  it("denies when authorization header is absent", () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");
    expect(isCronAuthorized(makeRequest())).toBe(false);
  });

  it("denies non-Bearer schemes and malformed headers", () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");
    expect(isCronAuthorized(makeRequest("Basic expected-secret"))).toBe(false);
    expect(isCronAuthorized(makeRequest("expected-secret"))).toBe(false);
    expect(isCronAuthorized(makeRequest("Bearer "))).toBe(false);
  });

  it("denies tokens that differ in value or length", () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");
    expect(isCronAuthorized(makeRequest("Bearer expected-secreX"))).toBe(false);
    expect(isCronAuthorized(makeRequest("Bearer short"))).toBe(false);
    expect(isCronAuthorized(makeRequest("Bearer expected-secret-extra"))).toBe(false);
  });

  it("accepts the exact bearer token regardless of scheme casing", () => {
    vi.stubEnv("CRON_SECRET", "expected-secret");
    expect(isCronAuthorized(makeRequest("Bearer expected-secret"))).toBe(true);
    expect(isCronAuthorized(makeRequest("bearer expected-secret"))).toBe(true);
  });
});
