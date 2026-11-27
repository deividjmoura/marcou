import { createHash } from "node:crypto";
import { z } from "zod";
import rawDocuments from "@/content/legal-documents.json";

export const legalDocumentKeySchema = z.enum([
  "terms",
  "privacy",
  "community_guidelines",
  "content_reviews_policy",
]);

const legalSectionSchema = z.object({
  heading: z.string().trim().min(1),
  paragraphs: z.array(z.string().trim().min(1)).optional(),
  bullets: z.array(z.string().trim().min(1)).optional(),
}).refine(
  (section) => (section.paragraphs?.length ?? 0) + (section.bullets?.length ?? 0) > 0,
  "Cada seção legal precisa de ao menos um parágrafo ou item.",
);

const legalDocumentSchema = z.object({
  key: legalDocumentKeySchema,
  title: z.string().trim().min(1).max(120),
  version: z.string().trim().min(1).max(40),
  status: z.enum(["draft", "published", "retired"]),
  updatedAt: z.iso.date(),
  route: z.string().startsWith("/"),
  requiresAcceptance: z.boolean(),
  materialChangeSummary: z.string().trim().min(1),
  reviewNotice: z.string().trim().min(1),
  sections: z.array(legalSectionSchema).min(1),
});

export type LegalDocumentKey = z.infer<typeof legalDocumentKeySchema>;
export type LegalDocument = z.infer<typeof legalDocumentSchema>;
export type LegalDocumentWithHash = LegalDocument & { contentHash: string };

/**
 * Conteúdo canônico coberto pelo hash persistido no aceite. Campos puramente de
 * roteamento/ativação ficam fora; qualquer alteração textual exige nova versão.
 */
export function canonicalLegalContent(document: LegalDocument): string {
  return JSON.stringify({
    key: document.key,
    title: document.title,
    version: document.version,
    updatedAt: document.updatedAt,
    materialChangeSummary: document.materialChangeSummary,
    reviewNotice: document.reviewNotice,
    sections: document.sections.map((section) => ({
      heading: section.heading,
      paragraphs: section.paragraphs ?? [],
      bullets: section.bullets ?? [],
    })),
  });
}

export function hashLegalDocument(document: LegalDocument): string {
  return createHash("sha256").update(canonicalLegalContent(document), "utf8").digest("hex");
}

const parsedDocuments = z.array(legalDocumentSchema).min(1).parse(rawDocuments);
const keys = new Set<string>();
const routes = new Set<string>();

for (const document of parsedDocuments) {
  if (keys.has(document.key)) throw new Error(`Documento legal duplicado: ${document.key}`);
  if (routes.has(document.route)) throw new Error(`Rota legal duplicada: ${document.route}`);
  if (document.status !== "published" && document.requiresAcceptance) {
    throw new Error(`Documento não publicado não pode exigir aceite: ${document.key}`);
  }
  keys.add(document.key);
  routes.add(document.route);
}

export const legalDocuments: readonly LegalDocumentWithHash[] = parsedDocuments.map(
  (document) => ({ ...document, contentHash: hashLegalDocument(document) }),
);

export function getLegalDocument(key: LegalDocumentKey): LegalDocumentWithHash {
  const document = legalDocuments.find((item) => item.key === key);
  if (!document) throw new Error(`Documento legal não encontrado: ${key}`);
  return document;
}

export function findLegalDocumentVersion(input: {
  key: string;
  version: string;
  contentHash: string;
}): LegalDocumentWithHash | null {
  return legalDocuments.find(
    (document) =>
      document.key === input.key &&
      document.version === input.version &&
      document.contentHash === input.contentHash,
  ) ?? null;
}
