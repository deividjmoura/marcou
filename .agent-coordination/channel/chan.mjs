#!/usr/bin/env node
// Canal de comunicação entre agentes (JSON Lines na branch coordination/agents).
// Uso: node chan.mjs help | read --me agent_N | post --from agent_N --to agent_M[,all] --type T --body "..." [opções]
// Cada agente escreve SOMENTE no próprio arquivo channel/<from>.jsonl. Sem dependências além de git e node.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BRANCH = "coordination/agents";
const DIR = ".agent-coordination/channel";
const TYPES = ["claim", "release", "heads_up", "merged", "request", "answer", "blocker", "ack", "handoff"];
const SECRET = /(github_pat_|ghp_[A-Za-z0-9]|gho_[A-Za-z0-9]|sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|service_role|BEGIN [A-Z ]*PRIVATE KEY)/i;
const DAY = 24 * 3600 * 1000;

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const k = t.slice(2);
      const nx = argv[i + 1];
      if (nx === undefined || nx.startsWith("--")) o[k] = true;
      else { o[k] = nx; i++; }
    } else o._.push(t);
  }
  return o;
}
const csv = (v) => (v ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : []);

function workdir() {
  // Um clone raso e descartável por execução: permite vários agentes na mesma máquina em paralelo.
  const origin = git(process.cwd(), "remote", "get-url", "origin");
  const dir = mkdtempSync(join(tmpdir(), "marcou-channel-"));
  process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });
  execFileSync("git", ["clone", "-q", "--single-branch", "--branch", BRANCH, "--depth", "30", origin, dir], { stdio: "pipe" });
  return dir;
}
function sync(dir) {
  git(dir, "fetch", "-q", "origin", BRANCH);
  git(dir, "checkout", "-q", "-B", BRANCH, "FETCH_HEAD");
  git(dir, "reset", "-q", "--hard", "FETCH_HEAD");
}
function loadAll(dir) {
  const base = join(dir, DIR);
  const msgs = [], bad = [];
  if (!existsSync(base)) return { msgs, bad };
  for (const f of readdirSync(base).filter((x) => x.endsWith(".jsonl"))) {
    readFileSync(join(base, f), "utf8").split("\n").filter(Boolean).forEach((l, i) => {
      try { msgs.push(JSON.parse(l)); } catch { bad.push(`${f}:${i + 1}`); }
    });
  }
  msgs.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return { msgs, bad };
}
const expired = (m, now) => m.ttl_min && now > Date.parse(m.ts) + m.ttl_min * 60000;

function cmdRead(o) {
  const dir = workdir(); sync(dir);
  const { msgs, bad } = loadAll(dir);
  const now = Date.now(), me = o.me || null;
  const released = new Set(msgs.filter((m) => m.type === "release" && m.reply_to).map((m) => m.reply_to));
  const answered = new Set(msgs.filter((m) => m.reply_to).map((m) => m.reply_to));
  const claims = msgs.filter((m) => m.type === "claim" && !released.has(m.id) && !expired(m, now));
  const inbox = msgs.filter((m) => m.from !== me && (m.to || []).some((t) => t === me || t === "all") && m.needs_reply && !answered.has(m.id));
  const since = o.since ? Date.parse(o.since) : now - 3 * 3600 * 1000;
  const recent = msgs.filter((m) => Date.parse(m.ts) >= since && m.from !== me).slice(-(Number(o.limit) || 25));
  const out = { now: new Date(now).toISOString(), me, claims_ativos: claims, inbox_sem_resposta: inbox, recentes: recent };
  if (bad.length) out.linhas_invalidas = bad;
  console.log(JSON.stringify(out, null, 2));
}

function cmdPost(o) {
  const from = o.from;
  if (!/^agent_[1-6]$|^coordinator$/.test(from || "")) throw new Error("--from deve ser agent_1..agent_6 ou coordinator");
  if (!TYPES.includes(o.type)) throw new Error("--type deve ser um de: " + TYPES.join(", "));
  const body = String(o.body || "");
  if (!body && o.type !== "release") throw new Error("--body obrigatório");
  if (body.length > 400) throw new Error("--body deve ter no máximo 400 caracteres");
  if (SECRET.test(body) || SECRET.test(JSON.stringify(o))) throw new Error("conteúdo parece conter segredo/token; mensagem recusada");
  const to = csv(o.to).length ? csv(o.to) : ["all"];
  const refs = {};
  for (const [k, f] of [["pr", "pr"], ["issue", "issue"], ["files", "files"], ["branch", "branch"], ["migration", "migration"]]) {
    if (o[f]) refs[k] = csv(o[f]);
  }
  const msg = {
    id: `${from.replace("agent_", "a")}-${Date.now().toString(36)}`,
    ts: new Date().toISOString(), from, to, type: o.type, refs, body,
    ...(o["needs-reply"] ? { needs_reply: true } : {}),
    ...(o["reply-to"] ? { reply_to: o["reply-to"] } : {}),
    ...(o.ttl ? { ttl_min: Number(o.ttl) } : o.type === "claim" ? { ttl_min: 180 } : {}),
    ...(o["rebase-needed"] ? { rebase_needed: true } : {}),
  };
  const dir = workdir();
  for (let t = 1; t <= 5; t++) {
    sync(dir);
    const file = join(dir, DIR, `${from}.jsonl`);
    mkdirSync(join(dir, DIR), { recursive: true });
    const keep = existsSync(file)
      ? readFileSync(file, "utf8").split("\n").filter(Boolean).filter((l) => {
          try { return Date.now() - Date.parse(JSON.parse(l).ts) < DAY; } catch { return false; }
        })
      : [];
    writeFileSync(file, [...keep, JSON.stringify(msg)].join("\n") + "\n");
    git(dir, "add", "-A", DIR);
    try {
      git(dir, "-c", `user.name=${from}`, "-c", "user.email=noreply@anthropic.com", "commit", "-q", "-m", `chan(${from}): ${o.type}`);
      git(dir, "push", "-q", "origin", `HEAD:${BRANCH}`);
      console.log(JSON.stringify({ ok: true, id: msg.id }));
      return;
    } catch (e) {
      if (t === 5) throw new Error("falha ao publicar após 5 tentativas: " + String(e.stderr || e.message).slice(0, 300));
    }
  }
}

function cmdHelp() {
  const dir = workdir(); sync(dir);
  const f = join(dir, DIR, "PROTOCOL.json");
  console.log(existsSync(f) ? readFileSync(f, "utf8") : JSON.stringify({ tipos: TYPES }));
}

const o = parse(process.argv.slice(2));
try {
  const c = o._[0];
  if (c === "read") cmdRead(o);
  else if (c === "post") cmdPost(o);
  else cmdHelp();
} catch (e) {
  console.error(JSON.stringify({ ok: false, erro: String(e.message || e) }));
  process.exit(1);
}
