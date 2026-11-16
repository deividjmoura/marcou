import { afterEach, describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalSecret;
  }
});

describe("isCronAuthorized", () => {
  it("accepts the configured bearer token", () => {
    process.env.CRON_SECRET = "a-long-test-secret";

    expect(
      isCronAuthorized(
        new Request("https://example.test/api/cron", {
          headers: { authorization: "Bearer a-long-test-secret" },
        }),
      ),
    ).toBe(true);
  });

  it("rejects a wrong token", () => {
    process.env.CRON_SECRET = "a-long-test-secret";

    expect(
      isCronAuthorized(
        new Request("https://example.test/api/cron", {
          headers: { authorization: "Bearer wrong-secret" },
        }),
      ),
    ).toBe(false);
  });

  it("rejects missing or malformed authorization", () => {
    process.env.CRON_SECRET = "a-long-test-secret";

    expect(
      isCronAuthorized(new Request("https://example.test/api/cron")),
    ).toBe(false);
    expect(
      isCronAuthorized(
        new Request("https://example.test/api/cron", {
          headers: { authorization: "Basic a-long-test-secret" },
        }),
      ),
    ).toBe(false);
  });

  it("fails closed when CRON_SECRET is not configured", () => {
    delete process.env.CRON_SECRET;

    expect(
      isCronAuthorized(
        new Request("https://example.test/api/cron", {
          headers: { authorization: "Bearer a-long-test-secret" },
        }),
      ),
    ).toBe(false);
  });
});
