import { describe, expect, it } from "vitest";
import { buildWhatsAppLink, normalizePhoneToE164Digits } from "./whatsapp";

describe("normalizePhoneToE164Digits", () => {
  it.each([
    ["11912345678", "5511912345678"],
    ["(11) 91234-5678", "5511912345678"],
    ["+55 11 91234-5678", "5511912345678"],
    ["55 11 91234-5678", "5511912345678"],
    ["1133334444", "551133334444"], // fixo 8 dígitos
    ["+55 (11) 3333-4444", "551133334444"],
  ])("%j → %s", (input, expected) => {
    expect(normalizePhoneToE164Digits(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "123",
    "abc",
    "00000000000",
    "+1 415 555 2671", // não-BR sem suporte nesta etapa
    null,
    11912345678,
  ])("recusa %j", (input) => {
    expect(normalizePhoneToE164Digits(input as never)).toBeNull();
  });
});

describe("buildWhatsAppLink", () => {
  it("monta wa.me sem mensagem", () => {
    expect(buildWhatsAppLink("(11) 91234-5678")).toBe(
      "https://wa.me/5511912345678",
    );
  });

  it("inclui texto codificado", () => {
    const link = buildWhatsAppLink("11912345678", "Olá sobre Corte amanhã");
    expect(link).toBe(
      "https://wa.me/5511912345678?text=" +
        encodeURIComponent("Olá sobre Corte amanhã"),
    );
  });

  it("retorna null para telefone inválido", () => {
    expect(buildWhatsAppLink("")).toBeNull();
    expect(buildWhatsAppLink("12")).toBeNull();
  });
});
