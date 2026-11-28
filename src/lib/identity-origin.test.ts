import { afterEach, describe, expect, it, vi } from "vitest";
import { trustedAppOrigin } from "./identity";

describe("trustedAppOrigin deployment binding", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses canonical production origin, ignoring a manipulated request origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_CONTEXT", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcoou.netlify.app");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_PRIME_URL", "https://deploy-preview-42--marcoou.netlify.app");

    expect(trustedAppOrigin("https://attacker.example")).toBe(
      "https://marcoou.netlify.app",
    );
  });

  it("uses build-injected Netlify metadata and ignores forged request origins", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_CONTEXT", "deploy-preview");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_PRIME_URL", "https://deploy-preview-42--marcoou.netlify.app/");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcoou.netlify.app");

    expect(trustedAppOrigin("https://attacker.example")).toBe(
      "https://deploy-preview-42--marcoou.netlify.app",
    );
    expect(trustedAppOrigin("https://forged-forwarded-host.example")).toBe(
      "https://deploy-preview-42--marcoou.netlify.app",
    );
  });

  it("rejects preview domains not belonging to this Netlify site", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_CONTEXT", "deploy-preview");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_PRIME_URL", "https://deploy-preview-42--other-site.netlify.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://attacker.example");

    expect(trustedAppOrigin("https://attacker.example")).toBe(
      "https://marcoou.netlify.app",
    );
  });

  it("rejects URL manipulation in the configured preview URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_CONTEXT", "deploy-preview");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_PRIME_URL", "https://deploy-preview-42--marcoou.netlify.app.evil.example");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://attacker.example");

    expect(trustedAppOrigin("https://deploy-preview-42--marcoou.netlify.app")).toBe(
      "https://marcoou.netlify.app",
    );
  });

  it("rejects production config outside the canonical allowlist", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MARCOU_AUTH_DEPLOY_CONTEXT", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://attacker.example");

    expect(trustedAppOrigin("https://marcoou.netlify.app")).toBe(
      "https://marcoou.netlify.app",
    );
  });
});
