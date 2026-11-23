import { z } from "zod";

export const DEFAULT_SERVICE_CATEGORY_ID =
  "10000000-0000-4000-8000-000000000001";

export const DELIVERY_MODES = [
  "provider_location",
  "customer_location",
  "remote",
] as const;

export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  provider_location: "No espaço do profissional",
  customer_location: "No local do cliente",
  remote: "Online ou remoto",
};

export const BRAZIL_STATE_CODES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const deliveryModeSchema = z.enum(DELIVERY_MODES);
const stateCodeSchema = z.enum(BRAZIL_STATE_CODES, {
  message: "Selecione uma UF válida.",
});
const areaPrecisionSchema = z.enum(["city", "neighborhood", "radius"]);
const placeNameSchema = z
  .string()
  .trim()
  .min(2, "Informe ao menos 2 caracteres.")
  .max(80, "Use no máximo 80 caracteres.")
  .regex(
    /^[\p{L}\p{M}][\p{L}\p{M}\d .'-]*$/u,
    "Use somente letras, números, espaços, ponto, apóstrofo ou hífen.",
  )
  .refine(
    (value) =>
      !/(^|-)(rua|avenida|av|travessa|rodovia|estrada|alameda|logradouro)(-|$)/.test(
        normalizeDiscoveryKey(value),
      ),
    "Informe apenas cidade ou bairro, nunca rua ou endereço exato.",
  );

function optionalNumber(value: unknown): unknown {
  return value === "" || value == null ? undefined : value;
}

export const serviceDiscoveryInputSchema = z.object({
  categoryId: z.string().uuid("Selecione uma categoria válida."),
  deliveryModes: z
    .array(deliveryModeSchema)
    .min(1, "Selecione ao menos uma modalidade de atendimento.")
    .max(DELIVERY_MODES.length)
    .refine((modes) => new Set(modes).size === modes.length, {
      message: "Não repita modalidades de atendimento.",
    }),
});

export const serviceAreaInputSchema = z
  .object({
    stateCode: stateCodeSchema,
    city: placeNameSchema,
    ibgeCityCode: z
      .string()
      .trim()
      .regex(/^\d{7}$/, "O código IBGE deve ter 7 dígitos.")
      .optional()
      .or(z.literal("")),
    precision: areaPrecisionSchema,
    neighborhood: placeNameSchema.optional().or(z.literal("")),
    radiusKm: z.preprocess(
      optionalNumber,
      z.coerce
        .number()
        .min(1, "O raio mínimo é 1 km.")
        .max(200, "O raio máximo é 200 km.")
        .optional(),
    ),
  })
  .superRefine((area, context) => {
    if (area.precision === "city") {
      if (area.neighborhood) {
        context.addIssue({
          code: "custom",
          path: ["neighborhood"],
          message: "Uma área por cidade não deve informar bairro.",
        });
      }
      if (area.radiusKm != null) {
        context.addIssue({
          code: "custom",
          path: ["radiusKm"],
          message: "Uma área por cidade não deve informar raio.",
        });
      }
    }

    if (area.precision === "neighborhood") {
      if (!area.neighborhood) {
        context.addIssue({
          code: "custom",
          path: ["neighborhood"],
          message: "Informe o bairro atendido.",
        });
      }
      if (area.radiusKm != null) {
        context.addIssue({
          code: "custom",
          path: ["radiusKm"],
          message: "Uma área por bairro não deve informar raio.",
        });
      }
    }

    if (area.precision === "radius" && area.radiusKm == null) {
      context.addIssue({
        code: "custom",
        path: ["radiusKm"],
        message: "Informe o raio aproximado de atendimento.",
      });
    }
  });

export const categorySuggestionInputSchema = z.object({
  proposedName: z
    .string()
    .trim()
    .min(2, "Informe o nome sugerido.")
    .max(80, "Use no máximo 80 caracteres."),
  proposedParentId: z
    .string()
    .uuid("Selecione uma categoria principal válida.")
    .optional()
    .or(z.literal("")),
  rationale: z
    .string()
    .trim()
    .min(8, "Explique brevemente quando esta categoria é usada.")
    .max(500, "Use no máximo 500 caracteres."),
});

const publicServiceAreaSchema = z.object({
  stateCode: stateCodeSchema,
  city: z.string().min(1).max(80),
  neighborhood: z.string().min(1).max(80).nullable(),
  precision: areaPrecisionSchema,
  radiusKm: z.coerce.number().min(1).max(200).nullable(),
});

const publicServiceDiscoverySchema = z.object({
  serviceId: z.string().uuid(),
  category: z.object({
    id: z.string().uuid(),
    slug: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    version: z.coerce.number().int().positive(),
  }),
  deliveryModes: z.array(deliveryModeSchema).min(1).max(DELIVERY_MODES.length),
});

export const publicProviderDiscoverySchema = z.object({
  serviceAreas: z.array(publicServiceAreaSchema),
  services: z.array(publicServiceDiscoverySchema),
});

export type ServiceDiscoveryInput = z.infer<
  typeof serviceDiscoveryInputSchema
>;
export type ServiceAreaInput = z.infer<typeof serviceAreaInputSchema>;
export type CategorySuggestionInput = z.infer<
  typeof categorySuggestionInputSchema
>;
export type PublicProviderDiscovery = z.infer<
  typeof publicProviderDiscoverySchema
>;

export interface ServiceCategory {
  id: string;
  parent_id: string | null;
  stable_key: string;
  version: number;
  name: string;
  description: string | null;
}

export interface ProviderServiceArea {
  id: string;
  provider_id: string;
  country_code: string;
  state_code: (typeof BRAZIL_STATE_CODES)[number];
  city_name: string;
  city_key: string;
  ibge_city_code: string | null;
  neighborhood_name: string | null;
  neighborhood_key: string | null;
  precision: "city" | "neighborhood" | "radius";
  radius_km: number | null;
  source: "provider_declared" | "ibge_catalog" | "geocoded_approximate";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategorySuggestion {
  id: string;
  provider_id: string;
  proposed_parent_id: string | null;
  proposed_name: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export function serviceCategoryLabels(
  categories: ServiceCategory[],
): Map<string, string> {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return new Map(
    categories.map((category) => [
      category.id,
      category.parent_id && names.has(category.parent_id)
        ? `${names.get(category.parent_id)} › ${category.name}`
        : category.name,
    ]),
  );
}

export function normalizeDiscoveryKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatServiceArea(
  area: Pick<
    ProviderServiceArea,
    "city_name" | "state_code" | "neighborhood_name" | "precision" | "radius_km"
  >,
): string {
  const place = area.neighborhood_name
    ? `${area.neighborhood_name}, ${area.city_name}`
    : area.city_name;
  const radius =
    area.precision === "radius" && area.radius_km != null
      ? ` · raio aproximado de ${Number(area.radius_km).toLocaleString("pt-BR")} km`
      : "";
  return `${place} — ${area.state_code}${radius}`;
}
