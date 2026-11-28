"use client";

import { useThemePreference } from "./theme-provider";

export function ThemeSwitcher() {
  const { mode, setMode } = useThemePreference();

  return (
    <label className="theme-switcher">
      <span aria-hidden="true">◐</span>
      <span className="theme-switcher-label">Tema</span>
      <select
        aria-label="Tema da interface"
        value={mode}
        onChange={(event) => setMode(event.currentTarget.value as typeof mode)}
      >
        <option value="system">Automático</option>
        <option value="light">Claro</option>
        <option value="dark">Escuro</option>
      </select>
    </label>
  );
}
