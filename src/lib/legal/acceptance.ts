import { z } from "zod";

export const legalAcceptanceInputSchema = z.object({
  documentKey: z.string().trim().min(1).max(64),
  version: z.string().trim().min(1).max(40),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
});

export type LegalAcceptanceInput = z.infer<typeof legalAcceptanceInputSchema>;

export function parseLegalAcceptanceValues(
  values: FormDataEntryValue[],
): LegalAcceptanceInput[] {
  return values.flatMap((value) => {
    if (typeof value !== "string") return [];
    try {
      const parsed = legalAcceptanceInputSchema.safeParse(JSON.parse(value));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}

function acceptanceKey(document: LegalAcceptanceInput): string {
  return `${document.documentKey}:${document.version}:${document.contentHash}`;
}

/** Exige exatamente uma seleção válida para cada documento pendente. */
export function isExactLegalAcceptanceSelection(
  expected: LegalAcceptanceInput[],
  selected: LegalAcceptanceInput[],
): boolean {
  const expectedTokens = new Set(expected.map(acceptanceKey));
  const selectedTokens = new Set(selected.map(acceptanceKey));

  return selected.length === selectedTokens.size &&
    selectedTokens.size === expectedTokens.size &&
    [...expectedTokens].every((token) => selectedTokens.has(token));
}
