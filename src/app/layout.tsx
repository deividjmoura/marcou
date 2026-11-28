import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import "@fontsource-variable/manrope";
import "@fontsource/lora/400.css";
import "@fontsource/lora/500.css";
import "@fontsource/lora/600.css";
import "@fontsource/lora/400-italic.css";
import "./globals.css";
import "../styles/design-tokens.css";
import { parseThemeMode, resolveTheme } from "@/lib/theme";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeSwitcher } from "@/components/theme-switcher";

export const metadata: Metadata = {
  title: "Marcou — Agendamentos sem complicação",
  description:
    "Uma forma simples de organizar horários, serviços e agendamentos.",
};

const themeInitScript = `(() => {
  const root = document.documentElement;
  const mode = root.dataset.themeMode || "system";
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const mode = parseThemeMode(cookieStore.get("marcou-theme")?.value);
  const initialTheme = resolveTheme(mode, "light");

  return (
    <html lang="pt-BR" data-theme={mode === "system" ? "system" : initialTheme} data-theme-mode={mode}>
      <head>
        <Script id="marcou-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body>
        <ThemeProvider initialMode={mode}>
          {children}
          <ThemeSwitcher />
        </ThemeProvider>
      </body>
    </html>
  );
}
