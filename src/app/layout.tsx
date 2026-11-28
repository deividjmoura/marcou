import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/lora/400.css";
import "@fontsource/lora/500.css";
import "@fontsource/lora/600.css";
import "@fontsource/lora/400-italic.css";
import "./globals.css";
import "../styles/design-tokens.css";

export const metadata: Metadata = {
  title: "Marcou — Agendamentos sem complicação",
  description:
    "Uma forma simples de organizar horários, serviços e agendamentos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
