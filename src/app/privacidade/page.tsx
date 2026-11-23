import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";

export const metadata: Metadata = {
  title: "Política de Privacidade — Marcou",
  description: "Minuta versionada da Política de Privacidade do Marcou.",
};

export default function PrivacyPage() {
  return <LegalDocumentPage documentKey="privacy" />;
}
