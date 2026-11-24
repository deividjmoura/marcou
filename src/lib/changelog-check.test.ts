import { describe, expect, it } from "vitest";
import {
  evaluatePullRequestChangelog,
  isRelevantChangePath,
  validateChangelogContent,
} from "../../scripts/changelog-check.mjs";

const VALID_CHANGELOG = `# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

## [Unreleased]

### Adicionado

- Estrutura inicial do changelog obrigatório e verificação automatizada no CI.
`;

describe("changelog policy check", () => {
  it("aceita um CHANGELOG.md bem formado com seção [Unreleased] e categorias padrão", () => {
    const result = validateChangelogContent(VALID_CHANGELOG);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejeita CHANGELOG.md sem [Unreleased] ou com subseção fora do padrão", () => {
    const missingUnreleased = validateChangelogContent(
      "# Changelog\n\n### Adicionado\n\n- Item\n",
    );
    expect(missingUnreleased.valid).toBe(false);
    expect(missingUnreleased.errors.join(" ")).toContain("[Unreleased]");

    const invalidHeading = validateChangelogContent(
      "# Changelog\n\n## [Unreleased]\n\n### Outros\n\n- Item\n",
    );
    expect(invalidHeading.valid).toBe(false);
    expect(invalidHeading.errors.join(" ")).toContain("### Outros");
  });

  it("classifica corretamente mudanças funcionais, visuais, estruturais e de banco", () => {
    expect(isRelevantChangePath("src/app/(auth)/actions.ts")).toBe(true);
    expect(isRelevantChangePath("src/styles/design-tokens.css")).toBe(true);
    expect(isRelevantChangePath("public/branding/marcou-logo.svg")).toBe(true);
    expect(
      isRelevantChangePath("supabase/migrations/202611240001_example.sql"),
    ).toBe(true);
    expect(isRelevantChangePath(".github/workflows/ci.yml")).toBe(true);
    expect(isRelevantChangePath("package.json")).toBe(true);

    // Documentação pura e arquivos exclusivos de teste não bloqueiam PR documental
    expect(isRelevantChangePath("docs/IDENTITY.md")).toBe(false);
    expect(isRelevantChangePath("README.md")).toBe(false);
    expect(isRelevantChangePath("CONTRIBUTING.md")).toBe(false);
    expect(isRelevantChangePath("src/app/(auth)/actions.test.ts")).toBe(false);
    expect(isRelevantChangePath("CHANGELOG.md")).toBe(false);
  });

  it("bloqueia PR com mudanças relevantes quando CHANGELOG.md não foi atualizado", () => {
    const result = evaluatePullRequestChangelog({
      changedFiles: ["src/app/(auth)/actions.ts", "src/server/identity.ts"],
      changelogDiff: "",
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("CHANGELOG.md");
  });

  it("bloqueia edição cosmética em CHANGELOG.md sem nova entrada '- ...'", () => {
    const result = evaluatePullRequestChangelog({
      changedFiles: ["src/app/(auth)/actions.ts", "CHANGELOG.md"],
      changelogDiff: `--- a/CHANGELOG.md\n+++ b/CHANGELOG.md\n@@ -1,3 +1,4 @@\n # Changelog\n+\n`,
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("aprova PR com mudanças relevantes e entrada real em CHANGELOG.md", () => {
    const result = evaluatePullRequestChangelog({
      changedFiles: ["src/app/(auth)/actions.ts", "CHANGELOG.md"],
      changelogDiff: `--- a/CHANGELOG.md\n+++ b/CHANGELOG.md\n@@ -5,2 +5,3 @@\n ### Alterado\n+- Reduz consultas redundantes no fluxo de login.\n`,
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("dispensa atualização de CHANGELOG.md em PR exclusivamente documental ou de testes", () => {
    const result = evaluatePullRequestChangelog({
      changedFiles: ["docs/ROADMAP-MARCOU-SOCIAL.md", "src/lib/identity.test.ts"],
      changelogDiff: "",
    });

    expect(result.required).toBe(false);
    expect(result.valid).toBe(true);
  });
});
