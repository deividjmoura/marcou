import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";

export const metadata: Metadata = {
  title: "Política de Conteúdo e Avaliações — Marcou",
  description: "Minuta versionada da política de conteúdo e avaliações do Marcou Social.",
};

export default function ContentReviewsPolicyPage() {
  return <LegalDocumentPage documentKey="content_reviews_policy" />;
}
