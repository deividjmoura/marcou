import { createClient } from "@/lib/supabase/server";
import {
  findLegalDocumentVersion,
  type LegalDocumentWithHash,
} from "@/lib/legal/documents";

interface PendingLegalDocumentRow {
  document_id: string;
  document_key: string;
  document_version: string;
  title: string;
  public_path: string;
  content_sha256: string;
  material_change_summary: string;
  effective_at: string;
}

export interface PendingLegalDocument extends LegalDocumentWithHash {
  documentId: string;
  effectiveAt: string;
}

export interface LegalAcceptanceInput {
  documentKey: string;
  version: string;
  contentHash: string;
}

/**
 * Falha fechada quando o banco e o manifesto local divergem: um usuário nunca
 * deve aceitar texto diferente daquele que a interface consegue apresentar.
 */
export async function listPendingLegalDocuments(): Promise<PendingLegalDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_pending_legal_documents");
  if (error) throw new Error("Não foi possível verificar os documentos pendentes.");

  return ((data ?? []) as PendingLegalDocumentRow[]).map((row) => {
    const document = findLegalDocumentVersion({
      key: row.document_key,
      version: row.document_version,
      contentHash: row.content_sha256,
    });

    if (
      !document ||
      document.status !== "published" ||
      !document.requiresAcceptance ||
      document.route !== row.public_path ||
      document.title !== row.title
    ) {
      throw new Error("A versão publicada não corresponde ao manifesto da aplicação.");
    }

    return {
      ...document,
      documentId: row.document_id,
      effectiveAt: row.effective_at,
    };
  });
}

export async function recordLegalAcceptances(
  documents: LegalAcceptanceInput[],
): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_legal_acceptances", {
    p_documents: documents.map((document) => ({
      documentKey: document.documentKey,
      version: document.version,
      contentHash: document.contentHash,
    })),
  });

  if (error) throw new Error("Não foi possível registrar o aceite dos documentos.");
  return typeof data === "number" ? data : Number(data ?? 0);
}
