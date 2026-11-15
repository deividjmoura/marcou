import type { Metadata } from "next";
import "./globals.css";

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
