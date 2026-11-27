import { describe, expect, it } from "vitest";
import {
  authFallbackRedirect,
  isSafeAuthCode,
  isSafeTokenHash,
} from "./auth-url";

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

describe("isSafeTokenHash", () => {
  it("aceita token hash opaco e rejeita valores inseguros", () => {
    expect(isSafeTokenHash("token-123_ABC")).toBe(true);
    expect(isSafeTokenHash(null)).toBe(false);
    expect(isSafeTokenHash("abc?token_hash=evil")).toBe(false);
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

  it("encaminha o code que chega em /auth/confirm para o callback", () => {
    const target = authFallbackRedirect(
      "/auth/confirm",
      new URLSearchParams("code=abc-123&next=%2Fredefinir-senha"),
    );
    expect(target).toBe("/auth/callback?code=abc-123");
  });

  it("encaminha o token_hash recebido na landing page para o confirm", () => {
    const target = authFallbackRedirect(
      "/",
      new URLSearchParams("token_hash=hash-123&type=recovery"),
    );
    expect(target).toBe("/auth/confirm?token_hash=hash-123&type=recovery");
  });

  it("encaminha o token_hash que chega em /auth/callback para o confirm", () => {
    const target = authFallbackRedirect(
      "/auth/callback",
      new URLSearchParams("token_hash=hash-123&type=email"),
    );
    expect(target).toBe("/auth/confirm?token_hash=hash-123&type=email");
  });

  it("prioriza o token_hash quando code e token_hash estão presentes", () => {
    const target = authFallbackRedirect(
      "/",
      new URLSearchParams("code=abc-123&token_hash=hash-123&type=recovery"),
    );
    expect(target).toBe("/auth/confirm?token_hash=hash-123&type=recovery");
  });

  it("não cria loop no handler correto", () => {
    expect(
      authFallbackRedirect(
        "/auth/callback",
        new URLSearchParams("code=abc-123"),
      ),
    ).toBeNull();
    expect(
      authFallbackRedirect(
        "/auth/confirm",
        new URLSearchParams("token_hash=hash-123&type=recovery"),
      ),
    ).toBeNull();
  });

  it("ignora requisição sem code/token_hash, com tipo inválido ou code inseguro", () => {
    expect(authFallbackRedirect("/", new URLSearchParams())).toBeNull();
    expect(
      authFallbackRedirect(
        "/",
        new URLSearchParams("token_hash=hash-123&type=magiclink"),
      ),
    ).toBeNull();
    expect(
      authFallbackRedirect("/", new URLSearchParams("token_hash=hash-123")),
    ).toBeNull();
    expect(
      authFallbackRedirect(
        "/",
        new URLSearchParams("code=abc%3Fnext%3Dhttps%3A%2F%2Fevil.example"),
      ),
    ).toBeNull();
  });
});
