import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: vi.fn(),
}));

describe("proxy auth fallback redirects", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not reflect a malicious Host/origin when forwarding an auth code", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcoou.netlify.app");

    const request = new NextRequest("https://attacker.example/?code=secret-code");
    const response = await proxy(request);

    expect(response.headers.get("location")).toBe(
      "https://marcoou.netlify.app/auth/callback?code=secret-code",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("preserves the numbered Netlify deploy-preview origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcoou.netlify.app");

    const request = new NextRequest(
      "https://deploy-preview-127--marcoou.netlify.app/?token_hash=opaque&type=recovery",
    );
    const response = await proxy(request);

    expect(response.headers.get("location")).toBe(
      "https://deploy-preview-127--marcoou.netlify.app/auth/confirm?token_hash=opaque&type=recovery",
    );
  });

  it("preserves localhost in local development", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    const request = new NextRequest("http://localhost:3100/?code=local-code");
    const response = await proxy(request);

    expect(response.headers.get("location")).toBe(
      "http://localhost:3100/auth/callback?code=local-code",
    );
  });
});
