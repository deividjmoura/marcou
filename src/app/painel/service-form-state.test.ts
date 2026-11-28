import { describe, expect, it } from "vitest";
import { shouldCloseServiceModal } from "./service-form-state";

describe("shouldCloseServiceModal", () => {
  it("fecha apenas com sucesso sem erro", () => {
    expect(shouldCloseServiceModal({ success: "Serviço criado." })).toBe(true);
  });

  it("permanece aberto em erro de validação ou salvamento", () => {
    expect(shouldCloseServiceModal({ error: "Informe o preço em reais." })).toBe(false);
    expect(shouldCloseServiceModal({ error: "Não foi possível salvar." })).toBe(false);
  });

  it("permanece aberto no estado inicial ou misto", () => {
    expect(shouldCloseServiceModal({})).toBe(false);
    expect(shouldCloseServiceModal({ success: "ok", error: "falha" })).toBe(false);
  });
});
