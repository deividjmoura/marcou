/**
 * Auditoria de qualidade de repositório (sem banco).
 *
 * 1. Segredos: procura padrões de credencial em arquivos rastreados pelo Git.
 * 2. Guarda de configuração: páginas que consultam Supabase precisam tratar a
 *    ausência de variáveis de ambiente (isSupabaseConfigured).
 *
 * Uso: node scripts/quality-audit.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let failures = 0;
let warnings = 0;

function fail(message) {
  failures += 1;
  console.error(`  FAIL ${message}`);
}

function warn(message) {
  warnings += 1;
  console.warn(`  WARN ${message}`);
}

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const IGNORED_PREFIXES = [
  "supabase/migrations/",
  "docs/",
  "scripts/quality-audit.mjs",
];
const IGNORED_SUFFIXES = [".md", ".example", ".lock", ".sql"];

const SECRET_PATTERNS = [
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "service_role JWT", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "supabase service role", regex: /SUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*\S+/i },
  { name: "client secret", regex: /CLIENT_SECRET\s*[=:]\s*\S+/i },
  { name: "smtp password", regex: /(?:SMTP|MAIL)_PASSWORD\s*[=:]\s*\S+/i },
  { name: "google oauth secret", regex: /GOOGLE_CLIENT_SECRET\s*[=:]\s*\S+/i },
];

console.log("[segredos]");
{
  const files = trackedFiles().filter(
    (file) =>
      !IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix)) &&
      !IGNORED_SUFFIXES.some((suffix) => file.endsWith(suffix)),
  );

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.regex.test(content)) {
        fail(`${file} parece conter ${pattern.name}`);
      }
    }
  }

  if (failures === 0) console.log("  ok   nenhum padrão de segredo encontrado");
}

console.log("\n[guarda de configuração]");
{
  const supabasePages = trackedFiles().filter(
    (file) =>
      file.startsWith("src/app/") &&
      file.endsWith("page.tsx") &&
      /\/(?:painel|perfil|meus-agendamentos|notificacoes|reserva|redefinir-senha|esqueci-senha|cadastro|login)\b/.test(
        file,
      ),
  );

  for (const file of supabasePages) {
    const content = readFileSync(file, "utf8");
    const usesSupabase =
      /@\/server\/(?:bookings|services|notifications)/.test(content) ||
      /@\/lib\/supabase\/(?:server|client)/.test(content) ||
      /requireUser\(/.test(content);
    if (!usesSupabase) continue;

    const hasGuard = /isSupabaseConfigured/.test(content);
    if (hasGuard) {
      console.log(`  ok   ${file}`);
    } else {
      warn(
        `${file} consulta Supabase sem verificar isSupabaseConfigured (quebra sem env)`,
      );
    }
  }
}

console.log(
  `\nresultado: ${failures} falha(s), ${warnings} aviso(s)`,
);
process.exit(failures === 0 ? 0 : 1);
