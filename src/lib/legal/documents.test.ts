import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canonicalLegalContent,
  findLegalDocumentVersion,
  getLegalDocument,
  hashLegalDocument,
  legalDocuments,
} from "./documents";

const EXPECTED_HASHES = {
  terms: "e62a25cdcd88ce7dd71752693875b8bbae446ee0fa4b06479f44b929eb68838d",
  privacy: "eab1f9f338729df0fd29e4b43cb54a55c0550bb4f824fd11e1f21d5a7cdec951",
  community_guidelines: "cfe6e756920f59c19f4e11463ff9ad8a91e8df16baa7b0d92bd125124ad6cf88",
  content_reviews_policy: "2167957b650b6b9598ae3a73303e0a20add062c694117e1a9a42e85e4a62ca1b",
} as const;

describe("manifesto de documentos legais", () => {
  it("mantém chaves e rotas únicas", () => {
    expect(legalDocuments).toHaveLength(4);
    expect(new Set(legalDocuments.map((document) => document.key)).size).toBe(4);
    expect(new Set(legalDocuments.map((document) => document.route)).size).toBe(4);
  });

  it("não transforma minutas em documentos obrigatórios", () => {
    for (const document of legalDocuments) {
      expect(document.status).toBe("draft");
      expect(document.requiresAcceptance).toBe(false);
      expect(document.version).toContain("draft");
      expect(document.reviewNotice).toContain("MINUTA INTERNA");
      expect(document.reviewNotice).toContain("NÃO VIGENTE");
    }
  });

  it("produz hashes estáveis que correspondem à migration", () => {
    const migration = readFileSync(
      "supabase/migrations/202611230001_legal_documents_and_acceptances.sql",
      "utf8",
    );

    for (const document of legalDocuments) {
      expect(document.contentHash).toBe(EXPECTED_HASHES[document.key]);
      expect(hashLegalDocument(document)).toBe(document.contentHash);
      expect(document.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(migration).toContain(document.contentHash);
    }
  });

  it("inclui no conteúdo canônico o texto e não metadados de ativação", () => {
    const terms = getLegalDocument("terms");
    const canonical = canonicalLegalContent(terms);

    expect(canonical).toContain("O Marcou é uma plataforma digital");
    expect(canonical).not.toContain('"status"');
    expect(canonical).not.toContain('"requiresAcceptance"');
    expect(canonical).not.toContain('"route"');
  });

  it("só encontra a combinação exata de chave, versão e hash", () => {
    const privacy = getLegalDocument("privacy");

    expect(findLegalDocumentVersion({
      key: privacy.key,
      version: privacy.version,
      contentHash: privacy.contentHash,
    })?.title).toBe("Política de Privacidade");

    expect(findLegalDocumentVersion({
      key: privacy.key,
      version: privacy.version,
      contentHash: "0".repeat(64),
    })).toBeNull();
  });

  it("diferencia recursos atuais dos módulos sociais planejados", () => {
    const terms = canonicalLegalContent(getLegalDocument("terms"));
    const privacy = canonicalLegalContent(getLegalDocument("privacy"));
    const reviewPolicy = canonicalLegalContent(
      getLegalDocument("content_reviews_policy"),
    );

    expect(terms).toContain("Hoje, a aplicação oferece");
    expect(terms).toContain("somente estarão sujeitos");
    expect(privacy).toContain("ainda não ativos");
    expect(reviewPolicy).toContain("ainda não fazem parte da main");
  });
});
