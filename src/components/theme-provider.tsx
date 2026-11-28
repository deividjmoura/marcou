"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  parseThemeMode,
  resolveTheme,
  serializeThemeCookie,
  type ThemeMode,
  type ResolvedTheme,
} from "@/lib/theme";

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  initialMode,
  children,
}: {
  initialMode: ThemeMode;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => parseThemeMode(initialMode));
  const [systemPreference, setSystemPreference] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemPreference(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const resolved = resolveTheme(mode, systemPreference);
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    root.style.colorScheme = resolved;
    document.cookie = serializeThemeCookie(
      mode,
      window.location.protocol === "https:",
    );
  }, [mode, systemPreference]);

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useThemePreference must be used inside ThemeProvider");
  return context;
}
