import { beforeEach, describe, expect, it, vi } from "vitest";
import { createService, updateService } from "@/server/services";
import { uploadServiceImage, removeServiceImage } from "@/server/service-images";
import { uploadProviderAvatar, removeProviderAvatar } from "@/server/provider-avatar";
import { getOwnedProvider } from "@/server/bookings";
import { saveProviderAvatarAction, saveServiceAction } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/server/service-images", () => ({
  uploadServiceImage: vi.fn(async () => ({ cleanupWarning: false })),
  removeServiceImage: vi.fn(async () => ({ cleanupWarning: false })),
}));
vi.mock("@/server/provider-avatar", () => ({
  uploadProviderAvatar: vi.fn(async () => ({ cleanupWarning: false })),
  removeProviderAvatar: vi.fn(async () => ({ cleanupWarning: false })),
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
const mockedUploadServiceImage = vi.mocked(uploadServiceImage);
const mockedRemoveServiceImage = vi.mocked(removeServiceImage);
const mockedUploadProviderAvatar = vi.mocked(uploadProviderAvatar);
const mockedRemoveProviderAvatar = vi.mocked(removeProviderAvatar);
const mockedGetOwnedProvider = vi.mocked(getOwnedProvider);

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
    mockedUploadServiceImage.mockReset().mockResolvedValue({ cleanupWarning: false });
    mockedRemoveServiceImage.mockReset().mockResolvedValue({ cleanupWarning: false });
    mockedUploadProviderAvatar.mockReset().mockResolvedValue({ cleanupWarning: false });
    mockedRemoveProviderAvatar.mockReset().mockResolvedValue({ cleanupWarning: false });
    mockedGetOwnedProvider.mockResolvedValue({ id: "provider-1", slug: "studio-ana" } as never);
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

  it("envia imagem validada após criar o serviço", async () => {
    const bytes = new Uint8Array(45);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    new DataView(bytes.buffer).setUint32(8, 13, false);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(bytes.buffer).setUint32(16, 20, false);
    new DataView(bytes.buffer).setUint32(20, 10, false);
    bytes.set([8, 6, 0, 0, 0], 24);
    bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
    const form = serviceForm("50", "0");
    form.set("image", new File([bytes], "servico.png", { type: "image/png" }));
    mockedCreateService.mockResolvedValue({ id: "service-1" } as never);
    mockedUploadServiceImage.mockResolvedValue({ cleanupWarning: false });

    const result = await saveServiceAction({}, form);

    expect(result).toEqual({ success: "Serviço criado." });
    expect(mockedUploadServiceImage).toHaveBeenCalledWith(
      "provider-1", "service-1", expect.any(File),
    );
  });

  it("remove a referência da imagem quando solicitado na edição", async () => {
    const form = serviceForm("50", "0", {
      intent: "update",
      serviceId: "123e4567-e89b-12d3-a456-426614174000",
      removeImage: "true",
    });
    mockedUpdateService.mockResolvedValue({ id: "service-1" } as never);
    mockedRemoveServiceImage.mockResolvedValue({ cleanupWarning: false });

    const result = await saveServiceAction({}, form);

    expect(result).toEqual({ success: "Serviço atualizado." });
    expect(mockedRemoveServiceImage).toHaveBeenCalledWith("provider-1", "service-1");
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


describe("saveProviderAvatarAction: foto do profissional", () => {
  beforeEach(() => {
    mockedUploadProviderAvatar.mockReset().mockResolvedValue({ cleanupWarning: false });
    mockedRemoveProviderAvatar.mockReset().mockResolvedValue({ cleanupWarning: false });
    mockedGetOwnedProvider.mockResolvedValue({ id: "provider-1", slug: "studio-ana" } as never);
  });

  function validPngFile() {
    const bytes = new Uint8Array(45);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    new DataView(bytes.buffer).setUint32(8, 13, false);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(bytes.buffer).setUint32(16, 20, false);
    new DataView(bytes.buffer).setUint32(20, 10, false);
    bytes.set([8, 6, 0, 0, 0], 24);
    bytes.set([0x49, 0x45, 0x4e, 0x44], 37);
    return new File([bytes], "avatar.png", { type: "image/png" });
  }

  it("deriva o prestador da sessão e envia somente arquivo validado", async () => {
    const form = new FormData();
    const file = validPngFile();
    form.set("avatar", file);

    const result = await saveProviderAvatarAction({}, form);

    expect(result).toEqual({ success: "Foto do perfil atualizada." });
    expect(mockedGetOwnedProvider).toHaveBeenCalledWith("user-1");
    expect(mockedUploadProviderAvatar).toHaveBeenCalledWith("provider-1", file);
  });

  it("não aceita providerId do cliente para remover foto de outro perfil", async () => {
    const form = new FormData();
    form.set("intent", "remove");
    form.set("providerId", "provider-victim");

    const result = await saveProviderAvatarAction({}, form);

    expect(result).toEqual({ success: "Foto do perfil removida." });
    expect(mockedRemoveProviderAvatar).toHaveBeenCalledWith("provider-1");
    expect(mockedRemoveProviderAvatar).not.toHaveBeenCalledWith("provider-victim");
  });

  it("rejeita SVG no servidor sem chamar Storage", async () => {
    const form = new FormData();
    form.set("avatar", new File(["<svg/>"], "avatar.svg", { type: "image/svg+xml" }));

    const result = await saveProviderAvatarAction({}, form);

    expect(result.error).toMatch(/JPEG, PNG ou WebP/);
    expect(mockedUploadProviderAvatar).not.toHaveBeenCalled();
  });

  it("não permite upload sem negócio pertencente à sessão", async () => {
    mockedGetOwnedProvider.mockResolvedValueOnce(null);
    const form = new FormData();
    form.set("avatar", validPngFile());

    const result = await saveProviderAvatarAction({}, form);

    expect(result.error).toMatch(/não configurou seu negócio/i);
    expect(mockedUploadProviderAvatar).not.toHaveBeenCalled();
  });
});
