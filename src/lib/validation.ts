import { z } from "zod";
import { DateTime } from "luxon";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato yyyy-mm-dd.")
  .refine((value) => DateTime.fromISO(value, { zone: "utc" }).isValid, {
    message: "Data inválida.",
  });

const isoTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.")
  .refine((value) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes < 24 * 60;
  });

export const serviceInputSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do serviço.").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  depositCents: z.coerce.number().int().min(0).max(100_000_000),
  bufferMinutes: z.coerce.number().int().min(0).max(480),
}).refine((data) => data.depositCents <= data.priceCents, {
  message: "O sinal não pode ser maior que o preço.",
  path: ["depositCents"],
});

export const availabilityRuleInputSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startsAt: isoTime,
  endsAt: isoTime,
  validFrom: isoDate.optional().or(z.literal("")),
  validUntil: isoDate.optional().or(z.literal("")),
}).refine((data) => data.startsAt < data.endsAt, {
  message: "O início deve ser antes do fim.",
  path: ["endsAt"],
}).refine(
  (data) =>
    !data.validFrom ||
    !data.validUntil ||
    data.validFrom <= data.validUntil,
  {
    message: "A vigência está invertida.",
    path: ["validUntil"],
  },
);

export const availabilityExceptionInputSchema = z
  .object({
    date: isoDate,
    kind: z.enum(["blocked", "custom_hours"]),
    startsAt: isoTime.optional().or(z.literal("")),
    endsAt: isoTime.optional().or(z.literal("")),
    note: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .refine(
    (data) =>
      data.kind !== "custom_hours" ||
      (Boolean(data.startsAt) && Boolean(data.endsAt)),
    {
      message: "Horário especial precisa de início e fim.",
      path: ["startsAt"],
    },
  )
  .refine(
    (data) =>
      data.kind !== "custom_hours" ||
      (data.startsAt && data.endsAt && data.startsAt < data.endsAt),
    {
      message: "O início deve ser antes do fim.",
      path: ["endsAt"],
    },
  );

export const providerInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(48)
    .regex(
      /^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$/,
      "Use minúsculas, números e hífens.",
    ),
  displayName: z.string().trim().min(1, "Informe o nome do negócio.").max(80),
  timezone: z
    .string()
    .trim()
    .min(1)
    .refine((value) => DateTime.now().setZone(value).isValid, {
      message: "Fuso horário inválido.",
    }),
  isPublished: z.coerce.boolean(),
  bookingHoldMinutes: z.coerce.number().int().min(5).max(1440),
});

export const providerSettingsSchema = providerInputSchema;

export const bookingInputSchema = z.object({
  slug: z.string().trim().min(1),
  serviceId: z.string().uuid(),
  startsAt: z
    .string()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Horário inválido.",
    }),
  customerName: z.string().trim().min(1, "Informe seu nome.").max(80),
  customerPhone: z.string().trim().max(32).optional().or(z.literal("")),
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleInputSchema>;
export type AvailabilityExceptionInput = z.infer<
  typeof availabilityExceptionInputSchema
>;
export type ProviderInput = z.infer<typeof providerInputSchema>;
export type ProviderSettingsInput = z.infer<typeof providerSettingsSchema>;
