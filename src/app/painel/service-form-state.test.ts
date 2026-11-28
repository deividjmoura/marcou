import { describe, expect, it } from "vitest";
import { serviceFormTarget, shouldCloseServiceModal } from "./service-form-state";

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

describe("serviceFormTarget", () => {
  it("creates when there is no existing or partially saved service", () => {
    expect(serviceFormTarget()).toEqual({ intent: "create", serviceId: null });
  });

  it("updates the selected service when editing", () => {
    expect(serviceFormTarget("existing-id")).toEqual({
      intent: "update",
      serviceId: "existing-id",
    });
  });

  it("retries a failed image upload against the service already created", () => {
    expect(serviceFormTarget(null, "created-id")).toEqual({
      intent: "update",
      serviceId: "created-id",
    });
  });

  it("prefers the explicitly selected service", () => {
    expect(serviceFormTarget("selected-id", "partial-id")).toEqual({
      intent: "update",
      serviceId: "selected-id",
    });
  });
});
