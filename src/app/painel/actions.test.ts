import { beforeEach, describe, expect, it, vi } from "vitest";
import { createService, updateService } from "@/server/services";
import { saveServiceAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
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

  it.each([
    ["50", "0", 5000, 0],
    ["50,5", "10", 5050, 1000],
    ["50,50", "0,00", 5050, 0],
    ["1.234,56", "100,00", 123456, 10000],
    ["1234,56", "1.000", 123456, 100000],
  ])(
    "salva preço %j e sinal %j como %i/%i centavos",
    async (price, deposit, priceCents, depositCents) => {
      const result = await saveServiceAction({}, serviceForm(price, deposit));

      expect(result).toEqual({ success: "Serviço criado." });
      expect(mockedCreateService).toHaveBeenCalledWith(
        "provider-1",
        expect.objectContaining({ priceCents, depositCents }),
        undefined,
      );
    },
  );

  it("aceita o formato de edição gerado pelo formulário (toFixed(2))", async () => {
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

  it.each([["abc"], ["-50"], ["50,555"], ["1.23,45"], [""]])(
    "rejeita preço inválido %j com mensagem clara e não salva",
    async (price) => {
      const result = await saveServiceAction({}, serviceForm(price, "0"));

      expect(result.error).toMatch(/Informe o preço em reais/);
      expect(mockedCreateService).not.toHaveBeenCalled();
    },
  );

  it("rejeita sinal inválido com mensagem própria", async () => {
    const result = await saveServiceAction({}, serviceForm("50", "1,2,3"));

    expect(result.error).toMatch(/Informe o sinal em reais/);
    expect(mockedCreateService).not.toHaveBeenCalled();
  });

  it("mantém a regra de sinal maior que o preço", async () => {
    const result = await saveServiceAction({}, serviceForm("1.234,56", "1.234,57"));

    expect(result.error).toBe("O sinal não pode ser maior que o preço.");
    expect(mockedCreateService).not.toHaveBeenCalled();
  });
});
