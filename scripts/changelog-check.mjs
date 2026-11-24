/**
 * Verificação de integridade e atualização obrigatória do CHANGELOG.md.
 *
 * 1. Valida sempre a existência e a estrutura mínima do `CHANGELOG.md`.
 * 2. Em Pull Requests (`GITHUB_EVENT_NAME=pull_request`) ou quando `--base <ref>`
 *    é informado, exige entrada real no `CHANGELOG.md` sempre que houver
 *    mudanças funcionais, visuais, estruturais ou de banco de dados.
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
 * Valida a estrutura mínima do `CHANGELOG.md`.
 */
export function validateChangelogContent(markdown) {
  const errors = [];
  if (typeof markdown !== "string" || !markdown.trim()) {
    errors.push("CHANGELOG.md está vazio.");
    return { valid: false, errors };
  }

  const lines = markdown.split(/\r?\n/);
  const hasTitle = lines.some((line) => /^#\s+Changelog\b/i.test(line.trim()));
  if (!hasTitle) {
    errors.push("CHANGELOG.md precisa conter o título principal '# Changelog'.");
  }

  const unreleasedIndex = lines.findIndex((line) =>
    /^##\s+\[Unreleased\]\s*$/i.test(line.trim()),
  );
  if (unreleasedIndex === -1) {
    errors.push("CHANGELOG.md precisa conter a seção '## [Unreleased]'.");
  }

  for (const rawLine of lines) {
    const match = rawLine.trim().match(/^###\s+(.+)$/);
    if (!match) continue;
    const heading = match[1].trim();
    if (!ALLOWED_SECTIONS.has(heading)) {
      errors.push(
        `Subseção inválida '### ${heading}' em CHANGELOG.md. Use: ${Array.from(ALLOWED_SECTIONS).join(", ")}.`,
      );
    }
  }

  const hasAnyBullet = lines.some((line) => /^-\s+\S+/.test(line.trim()));
  if (!hasAnyBullet) {
    errors.push("CHANGELOG.md precisa conter ao menos um item documentado ('- ...').");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verifica se o diff de uma PR contém atualização real em `CHANGELOG.md`
 * quando há arquivos relevantes modificados.
 */
export function evaluatePullRequestChangelog({
  changedFiles,
  changelogDiff,
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

  const hasAddedEntry = String(changelogDiff ?? "")
    .split(/\r?\n/)
    .some((line) => /^\+\s*-\s+\S+/.test(line) && !line.startsWith("+++"));

  if (!hasAddedEntry) {
    return {
      required: true,
      valid: false,
      relevantFiles,
      errors: [
        "CHANGELOG.md foi tocado, mas nenhuma entrada ('- ...') foi adicionada para descrever as mudanças da PR.",
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
    ["diff", diffRange, "--", "CHANGELOG.md"],
    { encoding: "utf8" },
  );

  const prResult = evaluatePullRequestChangelog({
    changedFiles,
    changelogDiff,
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
      `  ok   CHANGELOG.md atualizado para ${prResult.relevantFiles.length} arquivo(s) relevante(s) em ${diffRange}`,
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
