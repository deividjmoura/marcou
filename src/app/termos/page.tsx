import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";

export const metadata: Metadata = {
  title: "Termos de Uso — Marcou",
  description: "Minuta versionada dos Termos de Uso do Marcou.",
};

export default function TermsPage() {
  return <LegalDocumentPage documentKey="terms" />;
}
