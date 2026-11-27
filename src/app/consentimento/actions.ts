"use server";

import { redirect } from "next/navigation";
import { findLegalDocumentVersion } from "@/lib/legal/documents";
import {
  isExactLegalAcceptanceSelection,
  parseLegalAcceptanceValues,
  type LegalAcceptanceInput,
} from "@/lib/legal/acceptance";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/identity";
import {
  listPendingLegalDocuments,
  recordLegalAcceptances,
} from "@/server/legal";

export type LegalConsentState = {
  error?: string;
};

function safeNext(value: FormDataEntryValue | null): string {
  return safeNextPath(
    typeof value === "string" && value.length > 0 ? value : "/minha-conta",
  );
}

export async function acceptLegalDocumentsAction(
  _previousState: LegalConsentState,
  formData: FormData,
): Promise<LegalConsentState> {
  const selected = parseLegalAcceptanceValues(formData.getAll("documents"));
  let pending;
  try {
    pending = await listPendingLegalDocuments();
  } catch {
    return {
      error: "Não foi possível confirmar os documentos agora. Tente novamente em instantes.",
    };
  }

  if (pending.length === 0) redirect(safeNext(formData.get("next")));

  const expected: LegalAcceptanceInput[] = pending.map((document) => ({
    documentKey: document.key,
    version: document.version,
    contentHash: document.contentHash,
  }));

  if (!isExactLegalAcceptanceSelection(expected, selected)) {
    return {
      error: "Marque cada documento individualmente depois de abrir e revisar o texto.",
    };
  }

  // Defesa em profundidade: o texto embarcado precisa continuar correspondendo
  // à versão/hash pendente carregada do banco antes de enviarmos o recibo.
  for (const item of selected) {
    const local = findLegalDocumentVersion({
      key: item.documentKey,
      version: item.version,
      contentHash: item.contentHash,
    });
    if (!local) {
      return {
        error: "Um documento mudou enquanto você o revisava. Recarregue a página antes de continuar.",
      };
    }
  }

  try {
    await recordLegalAcceptances(selected);
  } catch {
    return {
      error: "O aceite não foi salvo. Nenhuma confirmação parcial foi aplicada; tente novamente.",
    };
  }

  redirect(safeNext(formData.get("next")));
}

export async function declineLegalDocumentsAction(): Promise<never> {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?consentimento=recusado");
}
