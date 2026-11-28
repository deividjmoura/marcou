import { describe, expect, it } from "vitest";
import {
  parseThemeMode,
  resolveTheme,
  serializeThemeCookie,
  THEME_COOKIE,
} from "./theme";

describe("theme preference", () => {
  it("accepts the three supported modes and defaults invalid values to system", () => {
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("system")).toBe("system");
    expect(parseThemeMode(undefined)).toBe("system");
    expect(parseThemeMode("unknown")).toBe("system");
    expect(parseThemeMode("dark; injected")).toBe("system");
  });

  it("resolves system preference without overriding explicit choices", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
  });

  it("serializes a scoped, long-lived SameSite cookie and Secure in HTTPS", () => {
    const cookie = serializeThemeCookie("dark", true);
    expect(cookie).toContain(`${THEME_COOKIE}=dark`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=");
    expect(serializeThemeCookie("system")).not.toContain("Secure");
  });
});
