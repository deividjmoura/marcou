import { describe, expect, it } from "vitest";
import {
  isValidPhone,
  loginRedirectUrl,
  normalizePhone,
  oauthErrorMessage,
  safeNextPath,
} from "./identity";

describe("identity helpers", () => {
  it("accepts only local post-authentication paths", () => {
    expect(safeNextPath("/painel")).toBe("/painel");
    expect(safeNextPath("/meus-agendamentos?tab=upcoming")).toBe(
      "/meus-agendamentos?tab=upcoming",
    );
    expect(safeNextPath("//evil.example")).toBe("/painel");
    expect(safeNextPath("https://evil.example")).toBe("/painel");
    expect(safeNextPath("/\\evil.example")).toBe("/painel");
    expect(safeNextPath(null)).toBe("/painel");
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

  it("normalizes and validates telephone numbers without assuming a country code", () => {
    expect(normalizePhone("(47) 99999-1234")).toBe("47999991234");
    expect(isValidPhone("(47) 99999-1234")).toBe(true);
    expect(isValidPhone("+55 47 99999-1234")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});
