import type { Metadata } from "next";
import { LegalDocumentPage } from "@/components/legal-document-page";

export const metadata: Metadata = {
  title: "Diretrizes da Comunidade — Marcou",
  description: "Minuta versionada das Diretrizes da Comunidade do Marcou Social.",
};

export default function CommunityGuidelinesPage() {
  return <LegalDocumentPage documentKey="community_guidelines" />;
}
