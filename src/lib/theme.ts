export const THEME_COOKIE = "marcou-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function parseThemeMode(value: string | undefined | null): ThemeMode {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export function resolveTheme(
  mode: ThemeMode,
  systemPreference: ResolvedTheme,
): ResolvedTheme {
  return mode === "system" ? systemPreference : mode;
}

export function serializeThemeCookie(mode: ThemeMode, secure = false): string {
  return [
    `${THEME_COOKIE}=${mode}`,
    "Path=/",
    `Max-Age=${THEME_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
