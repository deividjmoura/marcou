import { describe, expect, it } from "vitest";
import { authFallbackRedirect, isSafeAuthCode } from "./auth-url";

describe("isSafeAuthCode", () => {
  it("aceita code PKCE e token hash", () => {
    expect(isSafeAuthCode("34e770dd-9ff9-416c-87fa-43b31d7ef225")).toBe(true);
    expect(isSafeAuthCode("abcDEF123._~-")).toBe(true);
  });

  it("rejeita valores vazios e caracteres que poderiam redirecionar", () => {
    expect(isSafeAuthCode(null)).toBe(false);
    expect(isSafeAuthCode("")).toBe(false);
    expect(isSafeAuthCode("abc?next=https://evil.example")).toBe(false);
    expect(isSafeAuthCode("abc/../../etc")).toBe(false);
    expect(isSafeAuthCode("a".repeat(513))).toBe(false);
  });
});

describe("authFallbackRedirect", () => {
  it("encaminha o code recebido na landing page para o callback", () => {
    const target = authFallbackRedirect(
      "/",
      new URLSearchParams("code=abc-123"),
    );
    expect(target).toBe("/auth/callback?code=abc-123");
  });

  it("encaminha o code recebido em qualquer caminho comum", () => {
    const target = authFallbackRedirect(
      "/login",
      new URLSearchParams("code=abc-123"),
    );
    expect(target).toBe("/auth/callback?code=abc-123");
  });

  it("não cria loop no callback nem no confirm", () => {
    expect(
      authFallbackRedirect("/auth/callback", new URLSearchParams("code=abc")),
    ).toBeNull();
    expect(
      authFallbackRedirect("/auth/confirm", new URLSearchParams("code=abc")),
    ).toBeNull();
  });

  it("ignora requisição sem code ou com code inseguro", () => {
    expect(authFallbackRedirect("/", new URLSearchParams())).toBeNull();
    expect(
      authFallbackRedirect(
        "/",
        new URLSearchParams("code=abc%3Fnext%3Dhttps%3A%2F%2Fevil.example"),
      ),
    ).toBeNull();
  });
});
