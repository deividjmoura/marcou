import { describe, expect, it } from "vitest";
import {
  categorySuggestionInputSchema,
  formatServiceArea,
  normalizeDiscoveryKey,
  serviceAreaInputSchema,
  serviceDiscoveryInputSchema,
} from "./discovery";

describe("normalizeDiscoveryKey", () => {
  it("normaliza acentos, espaços e pontuação para filtros estáveis", () => {
    expect(normalizeDiscoveryKey("  São João d'Ávila  ")).toBe(
      "sao-joao-d-avila",
    );
    expect(normalizeDiscoveryKey("Florianópolis / SC")).toBe(
      "florianopolis-sc",
    );
  });
});

describe("serviceDiscoveryInputSchema", () => {
  it("aceita categoria UUID e modalidades combináveis", () => {
    const result = serviceDiscoveryInputSchema.safeParse({
      categoryId: "10000000-0000-4000-8000-000000000010",
      deliveryModes: ["provider_location", "remote"],
    });

    expect(result.success).toBe(true);
  });

  it("rejeita modalidade vazia, duplicada ou inventada", () => {
    const categoryId = "10000000-0000-4000-8000-000000000010";

    expect(
      serviceDiscoveryInputSchema.safeParse({ categoryId, deliveryModes: [] })
        .success,
    ).toBe(false);
    expect(
      serviceDiscoveryInputSchema.safeParse({
        categoryId,
        deliveryModes: ["remote", "remote"],
      }).success,
    ).toBe(false);
    expect(
      serviceDiscoveryInputSchema.safeParse({
        categoryId,
        deliveryModes: ["at_customer_exact_address"],
      }).success,
    ).toBe(false);
  });
});

describe("serviceAreaInputSchema", () => {
  it("aceita cidade, bairro e raio somente com os campos compatíveis", () => {
    expect(
      serviceAreaInputSchema.safeParse({
        stateCode: "SC",
        city: "Itajaí",
        precision: "city",
        neighborhood: "",
        radiusKm: "",
        ibgeCityCode: "4208203",
      }).success,
    ).toBe(true);

    expect(
      serviceAreaInputSchema.safeParse({
        stateCode: "SC",
        city: "Itajaí",
        precision: "neighborhood",
        neighborhood: "Centro",
        radiusKm: "",
        ibgeCityCode: "",
      }).success,
    ).toBe(true);

    expect(
      serviceAreaInputSchema.safeParse({
        stateCode: "SC",
        city: "Itajaí",
        precision: "radius",
        neighborhood: "Centro",
        radiusKm: "25.5",
        ibgeCityCode: "",
      }).success,
    ).toBe(true);
  });

  it("rejeita combinações que poderiam confundir a precisão pública", () => {
    expect(
      serviceAreaInputSchema.safeParse({
        stateCode: "SC",
        city: "Itajaí",
        precision: "city",
        neighborhood: "Centro",
        radiusKm: "",
      }).success,
    ).toBe(false);
    expect(
      serviceAreaInputSchema.safeParse({
        stateCode: "SC",
        city: "Itajaí",
        precision: "neighborhood",
        neighborhood: "",
        radiusKm: "",
      }).success,
    ).toBe(false);
    expect(
      serviceAreaInputSchema.safeParse({
        stateCode: "SC",
        city: "Itajaí",
        precision: "radius",
        neighborhood: "",
        radiusKm: "0",
      }).success,
    ).toBe(false);
  });

  it("não aceita texto com formato de endereço completo no campo cidade", () => {
    const result = serviceAreaInputSchema.safeParse({
      stateCode: "SC",
      city: "Rua Exemplo 123",
      precision: "city",
      neighborhood: "",
      radiusKm: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("categorySuggestionInputSchema", () => {
  it("exige justificativa moderável e não aceita status do navegador", () => {
    const result = categorySuggestionInputSchema.safeParse({
      proposedName: "Fotografia de eventos",
      proposedParentId: "",
      rationale: "Serviços profissionais para festas e cerimônias.",
      status: "approved",
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("status");
    expect(
      categorySuggestionInputSchema.safeParse({
        proposedName: "X",
        proposedParentId: "",
        rationale: "curta",
      }).success,
    ).toBe(false);
  });
});

describe("formatServiceArea", () => {
  it("formata somente localização aproximada", () => {
    expect(
      formatServiceArea({
        city_name: "Itajaí",
        state_code: "SC",
        neighborhood_name: "Centro",
        precision: "radius",
        radius_km: 20,
      }),
    ).toBe("Centro, Itajaí — SC · raio aproximado de 20 km");
  });
});
