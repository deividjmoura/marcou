import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Auditoria de contraste das cores realmente publicadas.
 *
 * Lê os arquivos CSS do projeto, resolve os tokens e mede a razão de contraste
 * WCAG dos pares texto/fundo usados na interface. Falha abaixo de 4.5:1 (AA
 * para texto normal). As medições são impressas para constar no relatório.
 */

const tokensPath = fileURLToPath(new URL("./design-tokens.css", import.meta.url));
const globalsPath = fileURLToPath(
  new URL("../app/globals.css", import.meta.url),
);

function parseCustomProperties(css: string, dark = false): Record<string, string> {
  const tokens: Record<string, string> = {};
  const block = dark ? css.match(/\[data-theme="dark"\]\s*\{([\s\S]*?)\}/) : css.match(/:root\s*\{([\s\S]*?)\}/);
  if (!block) return tokens;
  for (const match of block[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function resolve(value: string, tokens: Record<string, string>, depth = 0): string {
  if (depth > 5) return value;
  const reference = value.match(/var\(--([\w-]+)\)/);
  if (!reference) return value;
  const resolved = tokens[reference[1]];
  return resolved ? resolve(resolved, tokens, depth + 1) : value;
}

function toHex(value: string): string | null {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  return hex ? `#${hex[1].toLowerCase()}` : null;
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((part) => {
      const channel = Number.parseInt(part, 16) / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const [higher, lower] = first > second ? [first, second] : [second, first];
  return (higher + 0.05) / (lower + 0.05);
}

function readRuleColor(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!rule) return null;
  const color = rule[1].match(/color\s*:\s*([^;]+);/);
  return color ? color[1].trim() : null;
}

interface Pair {
  name: string;
  foreground: string;
  background: string;
}

const tokenCss = readFileSync(tokensPath, "utf8");
const tokens = parseCustomProperties(tokenCss);
const darkTokens = parseCustomProperties(tokenCss, true);
const globals = readFileSync(globalsPath, "utf8");
const globalsTokens = parseCustomProperties(globals);
const allTokens = { ...tokens, ...globalsTokens };

const pairs: Pair[] = [
  { name: "texto principal no papel", foreground: "var(--ink)", background: "var(--paper)" },
  { name: "texto principal no cartão", foreground: "var(--ink)", background: "var(--surface)" },
  { name: "texto auxiliar no cartão", foreground: "var(--muted)", background: "var(--surface)" },
  { name: "texto auxiliar no papel", foreground: "var(--muted)", background: "var(--paper)" },
  {
    name: "texto auxiliar no fundo rosé (agenda)",
    foreground: "var(--muted)",
    background: "var(--ds-color-brand-soft)",
  },
  {
    name: "texto auxiliar no fundo neutro (tags)",
    foreground: "var(--muted)",
    background: "#f0f0ea",
  },
  {
    name: "cor de marca no fundo rosé",
    foreground: "var(--ds-color-brand-strong)",
    background: "var(--ds-color-brand-soft)",
  },
  {
    name: "cor de marca no cartão",
    foreground: "var(--ds-color-brand-strong)",
    background: "var(--surface)",
  },
  {
    name: "erro no fundo de erro",
    foreground: "var(--ds-color-danger-text)",
    background: "var(--ds-color-danger-bg)",
  },
  {
    name: "aviso no fundo de aviso",
    foreground: "var(--ds-color-warning-text)",
    background: "var(--ds-color-warning-bg)",
  },
  {
    name: "sucesso no fundo de sucesso",
    foreground: "var(--ds-color-success-text)",
    background: "var(--ds-color-success-bg)",
  },
  {
    name: "informação no fundo de informação",
    foreground: "var(--ds-color-info-text)",
    background: "var(--ds-color-info-bg)",
  },
  { name: "botão primário", foreground: "var(--paper)", background: "var(--ink)" },
];

describe("contraste dos tokens publicados", () => {
  it("mede e registra a razão de contraste de cada par", () => {
    const measured = pairs.map((pair) => {
      const foreground = toHex(resolve(pair.foreground, allTokens));
      const background = toHex(resolve(pair.background, allTokens));
      if (!foreground || !background) {
        throw new Error(
          `não foi possível resolver ${pair.name}: ${pair.foreground} / ${pair.background}`,
        );
      }
      return {
        name: pair.name,
        foreground,
        background,
        ratio: contrast(foreground, background),
      };
    });

    for (const item of measured) {
      // Relatório real: os valores ficam visíveis na saída do teste.
      console.log(
        `  contraste ${item.name}: ${item.ratio.toFixed(2)} (${item.foreground} sobre ${item.background})`,
      );
    }

    expect(measured.length).toBeGreaterThan(0);
  });

  it("mede o contraste de .card-footnote (texto 10px na página inicial)", () => {
    const footnoteColor = readRuleColor(globals, ".card-footnote");
    expect(footnoteColor).not.toBeNull();
    const foreground = toHex(resolve(footnoteColor as string, allTokens));
    expect(foreground).not.toBeNull();
    const onSurface = contrast(foreground as string, toHex(resolve("var(--surface)", allTokens)) as string);
    const onPaper = contrast(foreground as string, toHex(resolve("var(--paper)", allTokens)) as string);
    console.log(
      `  contraste .card-footnote: ${onSurface.toFixed(2)} no cartão, ${onPaper.toFixed(2)} no papel (${foreground})`,
    );
    expect(onSurface).toBeGreaterThanOrEqual(4.5);
    expect(onPaper).toBeGreaterThanOrEqual(4.5);
  });

  it("atinge AA (4.5:1) em todos os pares de texto", () => {
    const violations = pairs
      .map((pair) => {
        const foreground = toHex(resolve(pair.foreground, allTokens));
        const background = toHex(resolve(pair.background, allTokens));
        if (!foreground || !background) return null;
        const ratio = contrast(foreground, background);
        return ratio >= 4.5 ? null : `${pair.name} ${ratio.toFixed(2)}:1`;
      })
      .filter((item): item is string => item !== null);

    expect(violations).toEqual([]);
  });

  it("semantic token contract", () => {
    expect(tokens["ds-color-background"]).toBe("var(--ds-color-paper)");
    expect(tokens["ds-color-text-primary"]).toBe("var(--ds-color-ink)");
    expect(tokens["ds-color-text-secondary"]).toBe("var(--ds-color-muted)");
    expect(tokens["ds-color-border"]).toBe("var(--ds-color-line)");
    expect(tokens["ds-color-link"]).toBe("var(--ds-color-brand-strong)");
  });

  it("dark semantic text and feedback pairs meet AA", () => {
    const pairs = [
      ["ds-color-text-primary", "ds-color-background"],
      ["ds-color-text-secondary", "ds-color-background"],
      ["ds-color-link", "ds-color-surface-default"],
      ["ds-color-accent", "ds-color-surface-default"],
      ["ds-color-success", "ds-color-success-bg"],
      ["ds-color-warning", "ds-color-warning-bg"],
      ["ds-color-danger", "ds-color-danger-bg"],
      ["ds-color-info", "ds-color-info-bg"],
    ];
    const issues = pairs.map(([fgKey, bgKey]) => {
      const fg = toHex(resolve(darkTokens[fgKey], darkTokens));
      const bg = toHex(resolve(darkTokens[bgKey], darkTokens));
      if (!fg || !bg) return "unresolved " + fgKey + "/" + bgKey;
      const value = contrast(fg, bg);
      return value >= 4.5 ? null : fgKey + "/" + bgKey + ": " + value.toFixed(2);
    }).filter((value): value is string => value !== null);
    expect(darkTokens["color-scheme"]).toBe("dark");
    expect(issues).toEqual([]);
  });

  it("usa a dupla tipográfica e uma escala de espaçamento mais compacta", () => {
    expect(tokens["ds-font-sans"]).toContain("Manrope Variable");
    expect(tokens["ds-font-display"]).toContain("Lora");
    expect(tokens["ds-space-8"]).toBe("1.75rem");
    expect(tokens["ds-space-10"]).toBe("2rem");
    expect(tokens["ds-space-12"]).toBe("2.5rem");
    expect(tokens["ds-space-16"]).toBe("3rem");
    expect(tokens["ds-control-min-height"]).toBe("44px");
    expect(globals).toContain("font-family: var(--ds-font-sans)");
    expect(globals).toContain("font-family: var(--ds-font-display)");
  });
});
