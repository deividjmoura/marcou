/**
 * Verificação de integridade e atualização obrigatória do CHANGELOG.md.
 *
 * 1. Valida sempre a existência e a estrutura mínima do `CHANGELOG.md`.
 * 2. Em Pull Requests (`GITHUB_EVENT_NAME=pull_request`) ou quando `--base <ref>`
 *    é informado, exige entrada real adicionada dentro de `## [Unreleased]`
 *    (sob subseção válida) sempre que houver mudanças funcionais, visuais,
 *    estruturais ou de banco de dados.
 *
 * Uso:
 *   node scripts/changelog-check.mjs
 *   node scripts/changelog-check.mjs --base origin/main
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ALLOWED_SECTIONS = new Set([
  "Adicionado",
  "Alterado",
  "Corrigido",
  "Segurança",
  "Removido",
  "Depreciado",
]);

const ROOT_STRUCTURAL_FILES = new Set([
  "package.json",
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "tsconfig.json",
  "eslint.config.mjs",
  "vitest.config.ts",
  ".env.example",
]);

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * Determina se um caminho alterado representa mudança funcional, visual,
 * estrutural ou de banco que exige registro no `CHANGELOG.md`.
 */
export function isRelevantChangePath(filePath) {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized === "CHANGELOG.md") return false;

  if (normalized.startsWith("src/")) {
    return !TEST_FILE_PATTERN.test(normalized);
  }
  if (normalized.startsWith("public/")) return true;
  if (normalized.startsWith("supabase/")) return true;
  if (normalized.startsWith("scripts/")) {
    return !TEST_FILE_PATTERN.test(normalized);
  }
  if (normalized.startsWith(".github/workflows/")) return true;

  return ROOT_STRUCTURAL_FILES.has(normalized);
}

/**
 * Analisa as linhas 1-indexadas do `CHANGELOG.md`, ignorando blocos de código
 * cercados (```), e identifica os limites exatos da seção `## [Unreleased]`
 * e a subseção `### <Categoria>` ativa em cada linha.
 */
export function inspectChangelogStructure(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  let inCodeFence = false;
  let hasTitle = false;
  let firstVersionHeadingLine = null;
  let unreleasedStartLine = null;
  let unreleasedEndLine = null;
  let activeSubsection = null;
  let bulletCount = 0;

  const invalidSubsections = [];
  const misplacedBullets = [];
  const subsectionByLine = new Map();
  const codeFenceLines = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const trimmed = lines[i].trim();

    if (/^```/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      codeFenceLines.add(lineNumber);
      continue;
    }
    if (inCodeFence) {
      codeFenceLines.add(lineNumber);
      continue;
    }

    if (/^#\s+Changelog\b/i.test(trimmed)) {
      hasTitle = true;
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      if (firstVersionHeadingLine === null) {
        firstVersionHeadingLine = lineNumber;
      }
      if (unreleasedStartLine !== null && unreleasedEndLine === null) {
        unreleasedEndLine = lineNumber;
      }
      if (/^##\s+\[Unreleased\]\s*$/i.test(trimmed) && unreleasedStartLine === null) {
        unreleasedStartLine = lineNumber;
      }
      activeSubsection = null;
      continue;
    }

    const subMatch = trimmed.match(/^###\s+(.+)$/);
    if (subMatch) {
      const heading = subMatch[1].trim();
      activeSubsection = heading;
      if (!ALLOWED_SECTIONS.has(heading)) {
        invalidSubsections.push(heading);
      }
      subsectionByLine.set(lineNumber, activeSubsection);
      continue;
    }

    subsectionByLine.set(lineNumber, activeSubsection);

    if (/^-\s+\S+/.test(trimmed)) {
      bulletCount += 1;
      const beforeAnySection =
        firstVersionHeadingLine === null || lineNumber < firstVersionHeadingLine;
      const inUnreleasedWithoutSubsection =
        unreleasedStartLine !== null &&
        lineNumber > unreleasedStartLine &&
        (unreleasedEndLine === null || lineNumber < unreleasedEndLine) &&
        !activeSubsection;

      if (beforeAnySection || inUnreleasedWithoutSubsection) {
        misplacedBullets.push(lineNumber);
      }
    }
  }

  if (unreleasedStartLine !== null && unreleasedEndLine === null) {
    unreleasedEndLine = lines.length + 1;
  }

  return {
    lines,
    hasTitle,
    unreleasedStartLine,
    unreleasedEndLine,
    bulletCount,
    invalidSubsections,
    misplacedBullets,
    subsectionByLine,
    codeFenceLines,
  };
}

/**
 * Extrai cada linha adicionada (`+`) de um diff unificado do Git mapeando seu
 * número de linha 1-indexado no arquivo resultante (`+newStart[,newCount]`).
 */
export function extractAddedLinesFromDiff(changelogDiff) {
  const diffLines = String(changelogDiff ?? "").split(/\r?\n/);
  const added = [];
  let currentNewLine = null;

  for (const rawLine of diffLines) {
    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      currentNewLine = Number.parseInt(hunkMatch[1], 10);
      continue;
    }

    if (currentNewLine === null) continue;
    if (rawLine.startsWith("+++") || rawLine.startsWith("---")) continue;
    if (rawLine.startsWith("\\")) continue;

    if (rawLine.startsWith("+")) {
      added.push({
        lineNumber: currentNewLine,
        text: rawLine.slice(1),
      });
      currentNewLine += 1;
    } else if (rawLine.startsWith(" ")) {
      currentNewLine += 1;
    }
  }

  return added;
}

/**
 * Valida a estrutura mínima do `CHANGELOG.md`.
 */
export function validateChangelogContent(markdown) {
  const errors = [];
  if (typeof markdown !== "string" || !markdown.trim()) {
    errors.push("CHANGELOG.md está vazio.");
    return { valid: false, errors };
  }

  const info = inspectChangelogStructure(markdown);

  if (!info.hasTitle) {
    errors.push("CHANGELOG.md precisa conter o título principal '# Changelog'.");
  }

  if (info.unreleasedStartLine === null) {
    errors.push("CHANGELOG.md precisa conter a seção '## [Unreleased]'.");
  }

  for (const heading of info.invalidSubsections) {
    errors.push(
      `Subseção inválida '### ${heading}' em CHANGELOG.md. Use: ${Array.from(ALLOWED_SECTIONS).join(", ")}.`,
    );
  }

  if (info.misplacedBullets.length > 0) {
    errors.push(
      `Entradas fora de subseção válida em CHANGELOG.md nas linhas: ${info.misplacedBullets.join(", ")}.`,
    );
  }

  if (info.bulletCount === 0) {
    errors.push("CHANGELOG.md precisa conter ao menos um item documentado ('- ...').");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verifica se o diff de uma PR contém atualização real dentro de `## [Unreleased]`
 * em `CHANGELOG.md` quando há arquivos relevantes modificados.
 */
export function evaluatePullRequestChangelog({
  changedFiles,
  changelogDiff,
  changelogContent,
}) {
  const relevantFiles = changedFiles.filter(isRelevantChangePath);
  if (relevantFiles.length === 0) {
    return {
      required: false,
      valid: true,
      relevantFiles,
      errors: [],
    };
  }

  const touchedChangelog = changedFiles.some(
    (file) => file.replace(/\\/g, "/") === "CHANGELOG.md",
  );
  if (!touchedChangelog) {
    return {
      required: true,
      valid: false,
      relevantFiles,
      errors: [
        `Mudanças relevantes detectadas (${relevantFiles.slice(0, 5).join(", ")}${relevantFiles.length > 5 ? ", ..." : ""}) sem atualização em CHANGELOG.md.`,
      ],
    };
  }

  if (typeof changelogContent !== "string" || !changelogContent.trim()) {
    return {
      required: true,
      valid: false,
      relevantFiles,
      errors: [
        "Conteúdo atual de CHANGELOG.md ausente para validar a seção '## [Unreleased]'.",
      ],
    };
  }

  const structure = inspectChangelogStructure(changelogContent);
  if (structure.unreleasedStartLine === null || structure.unreleasedEndLine === null) {
    return {
      required: true,
      valid: false,
      relevantFiles,
      errors: ["CHANGELOG.md precisa conter a seção '## [Unreleased]'."],
    };
  }

  const addedBullets = extractAddedLinesFromDiff(changelogDiff).filter(
    ({ lineNumber, text }) =>
      !structure.codeFenceLines.has(lineNumber) && /^-\s+\S+/.test(text.trim()),
  );

  if (addedBullets.length === 0) {
    return {
      required: true,
      valid: false,
      relevantFiles,
      errors: [
        "CHANGELOG.md foi tocado, mas nenhuma entrada ('- ...') foi adicionada para descrever as mudanças da PR.",
      ],
    };
  }

  const bulletsInUnreleased = addedBullets.filter(
    ({ lineNumber }) =>
      lineNumber > structure.unreleasedStartLine &&
      lineNumber < structure.unreleasedEndLine,
  );

  if (bulletsInUnreleased.length === 0) {
    return {
      required: true,
      valid: false,
      relevantFiles,
      errors: [
        "As entradas adicionadas pela PR em CHANGELOG.md devem estar dentro da seção '## [Unreleased]', e não fora dela ou em versões já lançadas.",
      ],
    };
  }

  const bulletsInValidSubsection = bulletsInUnreleased.filter(({ lineNumber }) => {
    const subsection = structure.subsectionByLine.get(lineNumber);
    return Boolean(subsection && ALLOWED_SECTIONS.has(subsection));
  });

  if (bulletsInValidSubsection.length === 0) {
    return {
      required: true,
      valid: false,
      relevantFiles,
      errors: [
        `A entrada adicionada em '## [Unreleased]' deve estar sob uma subseção válida (${Array.from(ALLOWED_SECTIONS).map((s) => `'### ${s}'`).join(", ")}).`,
      ],
    };
  }

  return {
    required: true,
    valid: true,
    relevantFiles,
    errors: [],
  };
}

function parseBaseArg(argv) {
  const index = argv.indexOf("--base");
  if (index !== -1 && argv[index + 1]) {
    return argv[index + 1];
  }
  return null;
}

function resolveDiffRange(explicitBase) {
  if (explicitBase) {
    return `${explicitBase}...HEAD`;
  }

  if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
    return null;
  }

  const baseRef = process.env.GITHUB_BASE_REF || "main";
  try {
    execFileSync("git", ["rev-parse", "--verify", `origin/${baseRef}`], {
      stdio: "ignore",
    });
    return `origin/${baseRef}...HEAD`;
  } catch {
    // Em checkout de merge commit raso, HEAD^1 é a base e HEAD^2 é o head da PR.
    execFileSync("git", ["rev-parse", "--verify", "HEAD^2"], {
      stdio: "ignore",
    });
    return "HEAD^1...HEAD^2";
  }
}

function runCli() {
  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    console.error("FAIL CHANGELOG.md não encontrado na raiz do repositório.");
    process.exitCode = 1;
    return;
  }

  const content = readFileSync(changelogPath, "utf8");
  const contentValidation = validateChangelogContent(content);
  if (!contentValidation.valid) {
    for (const err of contentValidation.errors) {
      console.error(`FAIL ${err}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("  ok   estrutura de CHANGELOG.md válida");

  const explicitBase = parseBaseArg(process.argv.slice(2));
  let diffRange = null;
  try {
    diffRange = resolveDiffRange(explicitBase);
  } catch (error) {
    console.error(
      "FAIL não foi possível determinar a referência base para comparar o CHANGELOG.md:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
    return;
  }

  if (!diffRange) {
    console.log(
      "  ok   execução fora de Pull Request (use --base origin/main para validar o diff localmente)",
    );
    return;
  }

  const changedFiles = execFileSync(
    "git",
    ["diff", "--name-only", diffRange],
    { encoding: "utf8" },
  )
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const changelogDiff = execFileSync(
    "git",
    ["diff", "--no-ext-diff", "--unified=0", diffRange, "--", "CHANGELOG.md"],
    { encoding: "utf8" },
  );

  const prResult = evaluatePullRequestChangelog({
    changedFiles,
    changelogDiff,
    changelogContent: content,
  });

  if (!prResult.valid) {
    for (const err of prResult.errors) {
      console.error(`FAIL ${err}`);
    }
    process.exitCode = 1;
    return;
  }

  if (prResult.required) {
    console.log(
      `  ok   CHANGELOG.md atualizado em [Unreleased] para ${prResult.relevantFiles.length} arquivo(s) relevante(s) em ${diffRange}`,
    );
  } else {
    console.log(
      `  ok   nenhuma mudança funcional/visual/estrutural/banco em ${diffRange} exigiu atualização de CHANGELOG.md`,
    );
  }
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  runCli();
}
