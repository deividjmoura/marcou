import { describe, expect, it } from "vitest";
import { shouldCloseServiceModal } from "./service-form-state";

describe("shouldCloseServiceModal", () => {
  it("closes after a successful create or update", () => {
    expect(shouldCloseServiceModal({ success: "Serviço criado." })).toBe(true);
    expect(shouldCloseServiceModal({ success: "Serviço atualizado." })).toBe(true);
  });

  it("keeps the dialog open for validation and persistence errors", () => {
    expect(shouldCloseServiceModal({ error: "Informe o preço em reais." })).toBe(false);
    expect(shouldCloseServiceModal({ error: "Não foi possível salvar." })).toBe(false);
  });

  it("keeps the dialog open before submission and for mixed outcomes", () => {
    expect(shouldCloseServiceModal({})).toBe(false);
    expect(shouldCloseServiceModal({ success: " ", })).toBe(false);
    expect(shouldCloseServiceModal({ success: "Salvo.", error: "Falha na imagem." })).toBe(false);
  });
});
