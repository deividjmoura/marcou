import { beforeEach, describe, expect, it, vi } from "vitest";
import { createService, updateService } from "@/server/services";
import { saveServiceAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/service-images", () => ({
  uploadServiceImage: vi.fn(async () => ({ cleanupWarning: false })),
  removeServiceImage: vi.fn(async () => ({ cleanupWarning: false })),
}));
vi.mock("@/server/feature-flags", () => ({
  isSocialFeatureEnabled: vi.fn(async () => false),
}));
vi.mock("@/server/discovery", () => ({
  createCategorySuggestion: vi.fn(),
  createProviderServiceArea: vi.fn(),
  deleteProviderServiceArea: vi.fn(),
}));
vi.mock("@/server/bookings", () => ({
  BookingOperationError: class BookingOperationError extends Error {},
  getOwnedProvider: vi.fn(async () => ({ id: "provider-1", slug: "studio-ana" })),
  requireUser: vi.fn(async () => ({ id: "user-1" })),
  transitionBooking: vi.fn(),
}));
vi.mock("@/server/services", () => ({
  createException: vi.fn(),
  createProvider: vi.fn(),
  createRule: vi.fn(),
  createService: vi.fn(),
  deleteException: vi.fn(),
  deleteRule: vi.fn(),
  setServiceActive: vi.fn(),
  updateProviderSettings: vi.fn(),
  updateRule: vi.fn(),
  updateService: vi.fn(),
}));

const mockedCreateService = vi.mocked(createService);
const mockedUpdateService = vi.mocked(updateService);

function serviceForm(price: string, deposit: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("name", "Corte");
  form.set("description", "");
  form.set("durationMinutes", "30");
  form.set("bufferMinutes", "0");
  form.set("price", price);
  form.set("deposit", deposit);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

describe("saveServiceAction: preço e sinal em reais", () => {
  beforeEach(() => {
    mockedCreateService.mockReset();
    mockedUpdateService.mockReset();
  });

  const savedCents = () => mockedCreateService.mock.calls[0]?.[1];

  it("converte milhar com ponto e vírgula decimal", async () => {
    const result = await saveServiceAction({}, serviceForm("1.234,56", "100,00"));

    expect(result).toEqual({ success: "Serviço criado." });
    expect(savedCents()).toMatchObject({ priceCents: 123456, depositCents: 10000 });
  });

  it("aceita o formato gerado pelo formulário de edição (toFixed(2))", async () => {
    const result = await saveServiceAction(
      {},
      serviceForm("1234.56", "0.00", {
        intent: "update",
        serviceId: "123e4567-e89b-12d3-a456-426614174000",
      }),
    );

    expect(result).toEqual({ success: "Serviço atualizado." });
    expect(mockedUpdateService).toHaveBeenCalledWith(
      "provider-1",
      "123e4567-e89b-12d3-a456-426614174000",
      expect.objectContaining({ priceCents: 123456, depositCents: 0 }),
      undefined,
    );
  });

  it.each([[""], ["   "], ["0"], ["0,00"]])(
    "sinal %j significa sem sinal (0)",
    async (deposit) => {
      const result = await saveServiceAction({}, serviceForm("50", deposit));

      expect(result).toEqual({ success: "Serviço criado." });
      expect(savedCents()).toMatchObject({ priceCents: 5000, depositCents: 0 });
    },
  );

  it("sinal ausente do formulário também vira 0", async () => {
    const form = serviceForm("50", "");
    form.delete("deposit");

    await saveServiceAction({}, form);

    expect(savedCents()).toMatchObject({ depositCents: 0 });
  });

  it.each([[""], ["abc"], ["0.500"]])(
    "recusa preço %j (obrigatório/ambíguo) sem salvar",
    async (price) => {
      const result = await saveServiceAction({}, serviceForm(price, "0"));

      expect(result.error).toMatch(/Informe o preço em reais/);
      expect(mockedCreateService).not.toHaveBeenCalled();
    },
  );

  it("recusa sinal preenchido inválido", async () => {
    const result = await saveServiceAction({}, serviceForm("50", "-5"));

    expect(result.error).toMatch(/Informe o sinal em reais/);
    expect(mockedCreateService).not.toHaveBeenCalled();
  });

  it("rejeita SVG antes de salvar o serviço", async () => {
    const form = serviceForm("50", "0");
    form.set("image", new File(["<svg/>"], "imagem.svg", { type: "image/svg+xml" }));

    const result = await saveServiceAction({}, form);

    expect(result.error).toMatch(/JPEG, PNG ou WebP/);
    expect(mockedCreateService).not.toHaveBeenCalled();
  });

  it("mantém a regra de sinal maior que o preço", async () => {
    const result = await saveServiceAction({}, serviceForm("1.234,56", "1.234,57"));

    expect(result.error).toBe("O sinal não pode ser maior que o preço.");
    expect(mockedCreateService).not.toHaveBeenCalled();
  });
});
