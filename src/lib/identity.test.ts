import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isValidPhone,
  loginRedirectUrl,
  normalizePhone,
  oauthErrorMessage,
  PKCE_VERIFIER_MISSING_MESSAGE,
  passwordLoginErrorMessage,
  safeLoginErrorMessage,
  stripFormatCharacters,
  trustedAppOrigin,
  safeNextPath,
  safeNextPathFromUrl,
  signupErrorMessage,
} from "./identity";

describe("identity helpers", () => {
  it("exports a safe message for missing PKCE verifier", () => {
    expect(PKCE_VERIFIER_MISSING_MESSAGE).toBe(
      "Abra o link no mesmo navegador em que solicitou a recuperação.",
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses a configured public origin and never reflects an untrusted host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(trustedAppOrigin("https://attacker.example")).toBe("http://localhost:3000");
    expect(trustedAppOrigin("http://localhost:3100")).toBe("http://localhost:3100");

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcou.example/path");
    expect(trustedAppOrigin("https://attacker.example")).toBe("https://marcou.example");

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://attacker.example");
    expect(trustedAppOrigin("https://attacker.example")).toBe("http://localhost:3000");
  });

  it("allows only the production Netlify host and numbered PR previews as request origins", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcoou.netlify.app");

    expect(trustedAppOrigin("https://marcoou.netlify.app")).toBe(
      "https://marcoou.netlify.app",
    );
    expect(trustedAppOrigin("https://deploy-preview-127--marcoou.netlify.app")).toBe(
      "https://deploy-preview-127--marcoou.netlify.app",
    );
    expect(trustedAppOrigin("https://deploy-preview-abc--marcoou.netlify.app")).toBe(
      "https://marcoou.netlify.app",
    );
    expect(trustedAppOrigin("https://marcoou--attacker.netlify.app")).toBe(
      "https://marcoou.netlify.app",
    );
    expect(trustedAppOrigin("https://attacker.example")).toBe(
      "https://marcoou.netlify.app",
    );
  });

  it("remove caracteres de formato invisíveis da origem configurada", () => {
    // U+2060 (WORD JOINER) no final do domínio, como observado em produção.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcou.example\u2060");
    expect(trustedAppOrigin("https://attacker.example")).toBe("https://marcou.example");

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcou.example\u200B/path");
    expect(trustedAppOrigin("https://attacker.example")).toBe("https://marcou.example");

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://marcou.example\uFEFF");
    expect(trustedAppOrigin("https://attacker.example")).toBe("https://marcou.example");
  });

  it("stripFormatCharacters remove caracteres de formato invisíveis", () => {
    expect(stripFormatCharacters("https://marcou.example\u2060")).toBe(
      "https://marcou.example",
    );
    expect(stripFormatCharacters("https://marcou.example\u200B/path")).toBe(
      "https://marcou.example/path",
    );
    expect(stripFormatCharacters("https://marcou.example\uFEFF")).toBe(
      "https://marcou.example",
    );
    expect(stripFormatCharacters("https://marcou.example")).toBe(
      "https://marcou.example",
    );
    expect(stripFormatCharacters("")).toBe("");
  });

  it("accepts only normalized local post-authentication paths", () => {
    expect(safeNextPath("/painel")).toBe("/painel");
    expect(safeNextPath("/meus-agendamentos?tab=upcoming")).toBe(
      "/meus-agendamentos?tab=upcoming",
    );
    expect(safeNextPath("/one/../painel")).toBe("/painel");
    expect(safeNextPath("//evil.example")).toBe("/inicio");
    expect(safeNextPath("///evil.example")).toBe("/inicio");
    expect(safeNextPath("https://evil.example")).toBe("/inicio");
    expect(safeNextPath("/\\evil.example")).toBe("/inicio");
    expect(safeNextPath("/%5c%5cevil.example")).toBe("/inicio");
    expect(safeNextPath("/%2f%2fevil.example")).toBe("/inicio");
    expect(safeNextPath("/%252f%252fevil.example")).toBe("/inicio");
    expect(safeNextPath("/%2e%2e//evil.example")).toBe("/inicio");
    expect(safeNextPath("/a/%252e%252e/%252f%252fevil.example")).toBe(
      "/inicio",
    );
    expect(safeNextPath("/bad%escape")).toBe("/inicio");
    expect(safeNextPath("/path\nheader")).toBe("/inicio");
    expect(safeNextPath(null)).toBe("/inicio");
    expect(safeNextPath(undefined)).toBe("/inicio");
  });

  it("accepts absolute same-origin return URLs and unwraps legacy callbacks", () => {
    const origin = "https://marcou.example";
    expect(safeNextPathFromUrl("https://marcou.example/minha-conta", origin)).toBe(
      "/minha-conta",
    );
    expect(
      safeNextPathFromUrl(
        "https://marcou.example/auth/callback?next=%2Fp%2Fstudio-ana%3Fservice%3Dabc",
        origin,
      ),
    ).toBe("/p/studio-ana?service=abc");
    expect(
      safeNextPathFromUrl("https://evil.example/steal", origin),
    ).toBe("/inicio");
    expect(safeNextPathFromUrl("//evil.example/steal", origin)).toBe("/inicio");
    expect(
      safeNextPathFromUrl("https://marcou.example/%2e%2e//evil", origin),
    ).toBe("/inicio");
  });

  it("keeps only application-authored login errors from a URL", () => {
    expect(safeLoginErrorMessage(oauthErrorMessage("access_denied"))).toBe(
      "O login com Google foi cancelado. Tente novamente quando quiser.",
    );
    expect(safeLoginErrorMessage("<img src=x onerror=alert(1)>")).toBeUndefined();
    expect(safeLoginErrorMessage("arbitrary error_description")).toBeUndefined();
    expect(safeLoginErrorMessage(null)).toBeUndefined();
  });

  it("keeps the original destination when authentication falls back to login", () => {
    expect(
      loginRedirectUrl(
        "https://app.exemplo.com",
        "/p/studio-ana?service=123e4567-e89b-12d3-a456-426614174000",
        "O login com Google foi cancelado. Tente novamente quando quiser.",
      ),
    ).toBe(
      "https://app.exemplo.com/login?error=O+login+com+Google+foi+cancelado.+Tente+novamente+quando+quiser.&next=%2Fp%2Fstudio-ana%3Fservice%3D123e4567-e89b-12d3-a456-426614174000",
    );

    expect(loginRedirectUrl("http://localhost:3000", "/painel")).toBe(
      "http://localhost:3000/login?next=%2Fpainel",
    );
    expect(loginRedirectUrl("https://app.exemplo.com", "//evil.example")).toBe(
      "https://app.exemplo.com/login?next=%2Finicio",
    );
  });

  it("translates provider OAuth failures without exposing raw descriptions", () => {
    expect(oauthErrorMessage("access_denied")).toBe(
      "O login com Google foi cancelado. Tente novamente quando quiser.",
    );
    expect(oauthErrorMessage("server_error")).toBe(
      "Não foi possível concluir a autenticação. Tente novamente.",
    );
    expect(oauthErrorMessage(null)).toBe(
      "Não foi possível concluir a autenticação. Tente novamente.",
    );
  });

  it("explains confirmation-email and login rate-limit errors safely", () => {
    expect(signupErrorMessage("email_address_not_authorized")).toContain(
      "configurar o serviço de e-mail",
    );
    expect(signupErrorMessage("over_email_send_rate_limit")).toContain(
      "limite de e-mails",
    );
    expect(signupErrorMessage("email_exists")).toBe(
      "Não foi possível criar a conta com esses dados.",
    );
    expect(passwordLoginErrorMessage("email_not_confirmed")).toContain(
      "ainda não foi confirmado",
    );
    expect(passwordLoginErrorMessage("over_request_rate_limit")).toContain(
      "Muitas tentativas",
    );
    expect(passwordLoginErrorMessage("invalid_credentials")).toBe(
      "E-mail ou senha incorretos.",
    );
  });

  it("normalizes and validates telephone numbers without assuming a country code", () => {
    expect(normalizePhone("(47) 99999-1234")).toBe("47999991234");
    expect(isValidPhone("(47) 99999-1234")).toBe(true);
    expect(isValidPhone("+55 47 99999-1234")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});
