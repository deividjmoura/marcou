import { describe, expect, it } from "vitest";
import { buildWhatsAppLink, normalizePhoneToE164Digits } from "./whatsapp";

describe("normalizePhoneToE164Digits", () => {
  it.each([
    // DDD 11 (SP capital)
    ["11912345678", "5511912345678"],
    ["(11) 91234-5678", "5511912345678"],
    ["+55 11 91234-5678", "5511912345678"],
    ["55 11 91234-5678", "5511912345678"],
    ["1133334444", "551133334444"],
    ["+55 (11) 3333-4444", "551133334444"],
    // Regressão P0: DDDs 12–19 (antes rejeitados pela heurística NANP)
    ["(12) 98123-4567", "5512981234567"],
    ["(13) 99123-4567", "5513991234567"],
    ["(14) 99123-4567", "5514991234567"],
    ["(15) 99123-4567", "5515991234567"],
    ["(16) 99123-4567", "5516991234567"],
    ["(17) 99123-4567", "5517991234567"],
    ["(18) 99123-4567", "5518991234567"],
    ["(19) 91234-5678", "5519912345678"],
    ["19912345678", "5519912345678"],
    // Outros DDDs comuns
    ["21987654321", "5521987654321"],
    ["(31) 98888-7777", "5531988887777"],
    ["41999998888", "5541999998888"],
    ["(51) 3333-4444", "555133334444"],
    ["61912345678", "5561912345678"],
    ["71988887777", "5571988887777"],
    ["81977776666", "5581977776666"],
    ["85966665555", "5585966665555"],
    ["91955554444", "5591955554444"],
  ])("%j → %s", (input, expected) => {
    expect(normalizePhoneToE164Digits(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "123",
    "abc",
    "00000000000",
    "+1 415 555 2671", // + explícito não-55
    "+44 20 7946 0958",
    "10 91234-5678", // DDD 10 inválido
    "09 91234-5678",
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

  it("DDD 19 gera link válido", () => {
    expect(buildWhatsAppLink("(19) 91234-5678")).toBe(
      "https://wa.me/5519912345678",
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
    expect(buildWhatsAppLink("+1 415 555 2671")).toBeNull();
  });
});
