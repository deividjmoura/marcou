import { describe, expect, it } from "vitest";
import {
  evaluatePullRequestChangelog,
  extractAddedLinesFromDiff,
  isRelevantChangePath,
  validateChangelogContent,
} from "../../scripts/changelog-check.mjs";

const VALID_CHANGELOG = [
  "# Changelog",
  "",
  "Todas as mudanças relevantes deste projeto são documentadas neste arquivo.",
  "",
  "## [Unreleased]",
  "",
  "### Adicionado",
  "",
  "- Estrutura inicial do changelog obrigatório e verificação automatizada no CI.",
  "",
  "## [0.1.0] - 2026-11-15",
  "",
  "### Adicionado",
  "",
  "- Versão base de agendamentos.",
].join("\n");

describe("changelog policy check", () => {
  it("aceita um CHANGELOG.md bem formado com seção [Unreleased] e categorias padrão", () => {
    const result = validateChangelogContent(VALID_CHANGELOG);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejeita CHANGELOG.md sem [Unreleased], com subseção inválida ou item solto fora de categoria", () => {
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

    const floatingBullet = validateChangelogContent(
      "# Changelog\n\n## [Unreleased]\n\n- Item sem categoria\n",
    );
    expect(floatingBullet.valid).toBe(false);
    expect(floatingBullet.errors.join(" ")).toContain("fora de subseção");
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

  it("extrai números de linha corretos de hunks unificados do Git", () => {
    const diff = [
      "--- a/CHANGELOG.md",
      "+++ b/CHANGELOG.md",
      "@@ -7,3 +7,4 @@",
      " ### Adicionado",
      " ",
      "+- Nova entrada em Unreleased.",
      " - Estrutura inicial.",
    ].join("\n");

    expect(extractAddedLinesFromDiff(diff)).toEqual([
      { lineNumber: 9, text: "- Nova entrada em Unreleased." },
    ]);
  });

  it("bloqueia PR com mudanças relevantes quando CHANGELOG.md não foi atualizado", () => {
    const result = evaluatePullRequestChangelog({
      changedFiles: ["src/app/(auth)/actions.ts", "src/server/identity.ts"],
      changelogDiff: "",
      changelogContent: VALID_CHANGELOG,
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("CHANGELOG.md");
  });

  it("bloqueia edição cosmética em CHANGELOG.md sem nova entrada '- ...'", () => {
    const updatedContent = `# Changelog\n\n\n## [Unreleased]\n\n### Adicionado\n\n- Item existente.\n`;
    const result = evaluatePullRequestChangelog({
      changedFiles: ["src/app/(auth)/actions.ts", "CHANGELOG.md"],
      changelogDiff: [
        "--- a/CHANGELOG.md",
        "+++ b/CHANGELOG.md",
        "@@ -2,0 +3,1 @@",
        "+",
      ].join("\n"),
      changelogContent: updatedContent,
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("nenhuma entrada");
  });

  it("bloqueia entrada adicionada abaixo de uma versão já lançada (fora de ## [Unreleased])", () => {
    const contentWithOldReleaseEdit = [
      "# Changelog", // 1
      "", // 2
      "## [Unreleased]", // 3
      "", // 4
      "## [0.1.0] - 2026-11-15", // 5
      "", // 6
      "### Corrigido", // 7
      "", // 8
      "- Correção inserida na seção errada.", // 9
    ].join("\n");

    const diffOnlyInOldRelease = [
      "--- a/CHANGELOG.md",
      "+++ b/CHANGELOG.md",
      "@@ -8,0 +9,1 @@",
      "+- Correção inserida na seção errada.",
    ].join("\n");

    const result = evaluatePullRequestChangelog({
      changedFiles: ["src/app/(auth)/actions.ts", "CHANGELOG.md"],
      changelogDiff: diffOnlyInOldRelease,
      changelogContent: contentWithOldReleaseEdit,
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("## [Unreleased]");
  });

  it("bloqueia entrada adicionada no cabeçalho antes de ## [Unreleased]", () => {
    const contentWithHeaderBullet = [
      "# Changelog", // 1
      "- Entrada fora de seção no topo.", // 2
      "", // 3
      "## [Unreleased]", // 4
      "", // 5
      "### Adicionado", // 6
      "", // 7
      "- Item anterior.", // 8
    ].join("\n");

    const diffBeforeUnreleased = [
      "--- a/CHANGELOG.md",
      "+++ b/CHANGELOG.md",
      "@@ -1,0 +2,1 @@",
      "+- Entrada fora de seção no topo.",
    ].join("\n");

    const result = evaluatePullRequestChangelog({
      changedFiles: ["src/app/(auth)/actions.ts", "CHANGELOG.md"],
      changelogDiff: diffBeforeUnreleased,
      changelogContent: contentWithHeaderBullet,
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("## [Unreleased]");
  });

  it("bloqueia entrada adicionada dentro de ## [Unreleased] sem subseção ### válida", () => {
    const contentWithoutSubsection = [
      "# Changelog", // 1
      "", // 2
      "## [Unreleased]", // 3
      "", // 4
      "- Entrada solta sem ### Alterado.", // 5
      "", // 6
      "## [0.1.0] - 2026-11-15", // 7
      "", // 8
      "### Adicionado", // 9
      "", // 10
      "- Base.", // 11
    ].join("\n");

    const diffWithoutSubsection = [
      "--- a/CHANGELOG.md",
      "+++ b/CHANGELOG.md",
      "@@ -4,0 +5,1 @@",
      "+- Entrada solta sem ### Alterado.",
    ].join("\n");

    const result = evaluatePullRequestChangelog({
      changedFiles: ["src/app/(auth)/actions.ts", "CHANGELOG.md"],
      changelogDiff: diffWithoutSubsection,
      changelogContent: contentWithoutSubsection,
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("subseção válida");
  });

  it("aprova PR quando a entrada adicionada está dentro de ## [Unreleased] sob subseção válida", () => {
    const updatedChangelog = [
      "# Changelog", // 1
      "", // 2
      "## [Unreleased]", // 3
      "", // 4
      "### Alterado", // 5
      "", // 6
      "- Reduz consultas redundantes no fluxo de login.", // 7
      "", // 8
      "## [0.1.0] - 2026-11-15", // 9
      "", // 10
      "### Adicionado", // 11
      "", // 12
      "- Base inicial.", // 13
    ].join("\n");

    const diffInUnreleased = [
      "--- a/CHANGELOG.md",
      "+++ b/CHANGELOG.md",
      "@@ -4,0 +5,3 @@",
      "+### Alterado",
      "+",
      "+- Reduz consultas redundantes no fluxo de login.",
    ].join("\n");

    const result = evaluatePullRequestChangelog({
      changedFiles: ["src/app/(auth)/actions.ts", "CHANGELOG.md"],
      changelogDiff: diffInUnreleased,
      changelogContent: updatedChangelog,
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("aprova criação inicial de CHANGELOG.md (@@ -0,0 +1,N @@) com entradas em ## [Unreleased]", () => {
    const lines = VALID_CHANGELOG.split("\n");
    const fullCreateDiff = [
      "--- /dev/null",
      "+++ b/CHANGELOG.md",
      `@@ -0,0 +1,${lines.length} @@`,
      ...lines.map((line) => `+${line}`),
    ].join("\n");

    const result = evaluatePullRequestChangelog({
      changedFiles: ["scripts/changelog-check.mjs", "CHANGELOG.md"],
      changelogDiff: fullCreateDiff,
      changelogContent: VALID_CHANGELOG,
    });

    expect(result.required).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("dispensa atualização de CHANGELOG.md em PR exclusivamente documental ou de testes", () => {
    const result = evaluatePullRequestChangelog({
      changedFiles: ["docs/ROADMAP-MARCOU-SOCIAL.md", "src/lib/identity.test.ts"],
      changelogDiff: "",
      changelogContent: VALID_CHANGELOG,
    });

    expect(result.required).toBe(false);
    expect(result.valid).toBe(true);
  });
});
