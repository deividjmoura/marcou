import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";
import { updateSession } from "@/lib/supabase/proxy";
import {
  PRIVATE_NO_STORE_HEADER,
  PUBLIC_DYNAMIC_CACHE_HEADER,
  PUBLIC_STATIC_CACHE_HEADER,
} from "@/lib/cache-policy";

vi.mock("@/lib/supabase/proxy", () => ({
  updateSession: vi.fn(),
}));

describe("proxy auth fallback redirects", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

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

describe("proxy cache headers policy", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("marks authenticated pages as private no-store", async () => {
    vi.mocked(updateSession).mockResolvedValue(NextResponse.next());

    for (const path of ["/painel", "/minha-conta", "/reserva/abc", "/notificacoes"]) {
      const response = await proxy(
        new NextRequest(`https://marcoou.netlify.app${path}`),
      );
      expect(response.headers.get("cache-control")).toBe(PRIVATE_NO_STORE_HEADER);
      expect(response.headers.get("pragma")).toBe("no-cache");
      expect(response.headers.get("expires")).toBe("0");
    }
  });

  it("sets explicit public cache headers on anonymous public pages", async () => {
    vi.mocked(updateSession).mockResolvedValue(NextResponse.next());

    const home = await proxy(new NextRequest("https://marcoou.netlify.app/"));
    expect(home.headers.get("cache-control")).toBe(PUBLIC_STATIC_CACHE_HEADER);
    expect(home.headers.get("vary")).toBe("Cookie");

    const provider = await proxy(
      new NextRequest("https://marcoou.netlify.app/p/studio-teste"),
    );
    expect(provider.headers.get("cache-control")).toBe(PUBLIC_DYNAMIC_CACHE_HEADER);
    expect(provider.headers.get("vary")).toBe("Cookie");
  });

  it("downgrades public pages to private no-store when Supabase auth cookie is present", async () => {
    vi.mocked(updateSession).mockResolvedValue(NextResponse.next());

    const request = new NextRequest("https://marcoou.netlify.app/", {
      headers: { cookie: "sb-peornypgltuueubmsucm-auth-token=opaque" },
    });
    const response = await proxy(request);

    expect(response.headers.get("cache-control")).toBe(PRIVATE_NO_STORE_HEADER);
  });
});
