import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePhone, safeNextPath } from "./identity";

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

  it("normalizes and validates telephone numbers without assuming a country code", () => {
    expect(normalizePhone("(47) 99999-1234")).toBe("47999991234");
    expect(isValidPhone("(47) 99999-1234")).toBe(true);
    expect(isValidPhone("+55 47 99999-1234")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});
