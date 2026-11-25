/**
 * Verificação da matriz canônica de privilégios de tabelas/views do schema public.
 *
 * Roda duas fases em clusters PostgreSQL embutidos independentes:
 *   before — todas as migrations, exceto a matriz de privilégios e a do
 *            Google Calendar (#29), que é posterior à matriz;
 *   after  — todas as migrations, inclusive a matriz e o Calendar.
 *
 * Fluxos: 2 papéis de API (anon e authenticated) por objeto da matriz — 21
 * objetos na fase before e 24 na after (as 3 tabelas do Calendar) — mais o
 * fluxo de escrita direta em notifications. A comparação exige que as únicas
 * diferenças sejam a perda do UPDATE direto de authenticated em notifications
 * e o surgimento das tabelas do Calendar sem nenhum privilégio para
 * anon/authenticated, preservando bookings e booking_events.
 *
 * Uso:
 *   node scripts/privileges-check.mjs             # fases before e after
 *   node scripts/privileges-check.mjs --phase after
 *   node scripts/privileges-check.mjs --dump      # imprime a matriz observada
 */
import os from "node:os";
import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const { Client } = pg;
const SECURITY_MIGRATION = "20261125130000_table_privileges_matrix.sql";
const MULTI_MIGRATION = "20261125120000_booking_multiple_services.sql";
const CALENDAR_MIGRATION = "20261125153000_google_calendar_sync.sql";
/** Tabelas criadas pela migration do Calendar: só existem na fase after. */
const CALENDAR_OBJECTS = ["calendar_connections", "calendar_sync_outbox", "booking_calendar_events"];
const PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
];

/**
 * Matriz tabela/operação/papel. Qualquer tabela ou view de `public` fora desta
 * matriz reprova o check — é o mecanismo que impede privilégios padrão do
 * Supabase em tabelas novas sem decisão explícita.
 *
 * As tabelas do Calendar (#29) são exclusivas do servidor: nenhum privilégio
 * para anon/authenticated e ALL para service_role. A migration do Calendar é
 * posterior à matriz e faz o próprio REVOKE/GRANT; o bloco condicional da
 * matriz (`to_regclass('public.calendar_connections')`) roda antes dela e não
 * tem efeito.
 */
const MATRIX = {
  account_preferences: { anon: [], authenticated: ["SELECT"], service_role: ["ALL"] },
  app_runtime_config: { anon: [], authenticated: [], service_role: ["ALL"] },
  availability_exceptions: {
    anon: ["SELECT"],
    authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    service_role: ["ALL"],
  },
  availability_rules: {
    anon: ["SELECT"],
    authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    service_role: ["ALL"],
  },
  booking_events: { anon: ["SELECT"], authenticated: ["SELECT"], service_role: ["ALL"] },
  booking_services: { anon: [], authenticated: ["SELECT"], service_role: ["ALL"] },
  bookings: { anon: ["SELECT"], authenticated: ["SELECT"], service_role: ["ALL"] },
  feature_flag_overrides: { anon: [], authenticated: [], service_role: ["ALL"] },
  feature_flags: { anon: [], authenticated: [], service_role: ["ALL"] },
  legal_acceptances: { anon: [], authenticated: ["SELECT"], service_role: ["ALL"] },
  legal_documents: { anon: ["SELECT"], authenticated: ["SELECT"], service_role: ["ALL"] },
  notifications: { anon: [], authenticated: ["SELECT"], service_role: ["ALL"] },
  profiles: {
    anon: [],
    authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    service_role: ["ALL"],
  },
  provider_service_areas: {
    anon: [],
    authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    service_role: ["ALL"],
  },
  providers: {
    anon: ["SELECT"],
    authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    service_role: ["ALL"],
  },
  service_categories: { anon: ["SELECT"], authenticated: ["SELECT"], service_role: ["ALL"] },
  service_category_aliases: {
    anon: ["SELECT"],
    authenticated: ["SELECT"],
    service_role: ["ALL"],
  },
  service_category_catalog: {
    anon: ["SELECT"],
    authenticated: ["SELECT"],
    service_role: ["SELECT"],
  },
  service_category_suggestions: {
    anon: [],
    authenticated: ["SELECT", "INSERT"],
    service_role: ["ALL"],
  },
  service_category_versions: {
    anon: ["SELECT"],
    authenticated: ["SELECT"],
    service_role: ["ALL"],
  },
  services: {
    anon: ["SELECT"],
    authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    service_role: ["ALL"],
  },
  // Google Calendar (#29): tokens cifrados, outbox e vínculos — só servidor.
  calendar_connections: { anon: [], authenticated: [], service_role: ["ALL"] },
  calendar_sync_outbox: { anon: [], authenticated: [], service_role: ["ALL"] },
  booking_calendar_events: { anon: [], authenticated: [], service_role: ["ALL"] },
};

const OBJECTS = Object.keys(MATRIX);
const DIRECT_UPDATE_FLOW = "notifications: UPDATE direto de authenticated";

function expectedFor(object, role, phase) {
  const expected = MATRIX[object][role];
  // Antes da migration o UPDATE direto ainda era concedido; as RPCs são a
  // única origem real de escrita na aplicação.
  if (phase === "before" && object === "notifications" && role === "authenticated") {
    return [...expected, "UPDATE"];
  }
  return expected;
}

const argv = process.argv.slice(2);
const phaseArg = argv.includes("--phase") ? argv[argv.indexOf("--phase") + 1] : null;
const dumpOnly = argv.includes("--dump");
const phases = phaseArg ? [phaseArg] : ["before", "after"];

if (phases.some((phase) => !["before", "after"].includes(phase))) {
  console.error("FAIL --phase deve ser 'before' ou 'after'");
  process.exit(1);
}

let failures = 0;

function reportFlow(phase, name, ok, detail = "") {
  if (ok) {
    console.log(`  ok   [${phase}] ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL [${phase}] ${name} ${detail}`);
  }
}

/** Verificações estruturais (matriz completa, service_role) não contam fluxos. */
function reportStructural(phase, name, ok, detail = "") {
  if (ok) {
    console.log(`  ok   [${phase}/estrutura] ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL [${phase}/estrutura] ${name} ${detail}`);
  }
}

async function observedPrivileges(db, object, role) {
  const result = await db.query(
    `select p.privilege_type as privilege
       from unnest($1::text[]) as p(privilege_type)
      where has_table_privilege($2, ('public.' || $3)::regclass, p.privilege_type)
      order by p.privilege_type`,
    [PRIVILEGES, role, object],
  );
  return result.rows.map((row) => row.privilege);
}

async function runPhase(phase) {
  const port = phase === "before" ? 55435 : 55436;
  const password = `marcou-privileges-${phase}`;
  const database = `marcou_privileges_${phase}`;
  const databaseDir = path.join(os.tmpdir(), `marcou-privileges-${phase}-pg-data`);
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password,
    port,
    persistent: false,
    autoRehydrateSymlinks: true,
  });
  const clients = new Set();
  let admin;
  let db;
  const flows = new Map();
  let unmapped = [];

  try {
    await rm(databaseDir, { recursive: true, force: true });
    await postgres.initialise();
    await postgres.start();

    admin = new Client({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password,
      database: "postgres",
    });
    await admin.connect();
    await admin.query(`create database ${database}`);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await admin.query(`create role ${role} login password '${password}'`);
    }

    db = new Client({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password,
      database,
    });
    await db.connect();
    await db.query(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
    `);

    const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
    let names = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const required of [SECURITY_MIGRATION, CALENDAR_MIGRATION]) {
      if (!names.includes(required)) throw new Error(`migration não encontrada: ${required}`);
    }
    reportStructural(
      phase,
      "migration do Calendar é posterior à matriz de privilégios",
      names.indexOf(CALENDAR_MIGRATION) > names.indexOf(SECURITY_MIGRATION),
    );
    if (phase === "before") {
      names = names.filter((name) => name !== SECURITY_MIGRATION && name !== CALENDAR_MIGRATION);
    }

    for (const name of names) {
      if (name === MULTI_MIGRATION) {
        // Emula os default privileges do Supabase para a tabela nova, como no
        // harness de booking: a migration precisa revogá-los explicitamente.
        await db.query(
          `alter default privileges in schema public grant all on tables to anon, authenticated`,
        );
      }
      if (name === CALENDAR_MIGRATION) {
        // Reforça a emulação dos defaults do Supabase (tabelas, sequences e
        // funções) para os objetos novos do Calendar.
        await db.query(`
          alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
          alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
          alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
        `);
      }
      const sql = await readFile(path.join(migrationDirectory, name), "utf8");
      await db.query(sql);
    }

    const objects = (
      await db.query(`
        select table_name as name from information_schema.tables
         where table_schema = 'public' and table_type in ('BASE TABLE', 'VIEW')
        union
        select table_name as name from information_schema.views
         where table_schema = 'public'
         order by name
      `)
    ).rows.map((row) => row.name);
    unmapped = objects.filter((name) => !(name in MATRIX));
    for (const name of unmapped) {
      reportStructural(
        phase,
        `tabela/view nova sem matriz: public.${name}`,
        false,
        "adicione a entrada em scripts/privileges-check.mjs e no handoff",
      );
    }

    if (dumpOnly) {
      const snapshot = {};
      for (const name of objects) {
        snapshot[name] = {
          anon: await observedPrivileges(db, name, "anon"),
          authenticated: await observedPrivileges(db, name, "authenticated"),
          service_role: await observedPrivileges(db, name, "service_role"),
        };
      }
      console.log(JSON.stringify(snapshot, null, 2));
      return { phase, flows, unmapped, snapshot };
    }

    for (const object of OBJECTS) {
      if (phase === "before" && CALENDAR_OBJECTS.includes(object)) {
        reportStructural(
          phase,
          `public.${object} ainda não existe antes da migration do Calendar`,
          !objects.includes(object),
        );
        continue;
      }
      if (!objects.includes(object)) {
        reportStructural(phase, `objeto da matriz ausente: public.${object}`, false);
        continue;
      }
      for (const role of ["anon", "authenticated"]) {
        const observed = await observedPrivileges(db, object, role);
        const expected = expectedFor(object, role, phase);
        flows.set(`${object}:${role}`, observed.join(","));
        reportFlow(
          phase,
          `${object}: privilégios de ${role} = [${expected.join(", ") || "nenhum"}]`,
          JSON.stringify(observed) === JSON.stringify([...expected].sort()),
          `observado=[${observed.join(", ")}]`,
        );
      }
      const serviceObserved = await observedPrivileges(db, object, "service_role");
      const serviceExpected = MATRIX[object].service_role.includes("ALL")
        ? [...PRIVILEGES]
        : MATRIX[object].service_role;
      reportStructural(
        phase,
        `${object}: service_role mantém acesso operacional`,
        JSON.stringify(serviceObserved) === JSON.stringify([...serviceExpected].sort()),
        `observado=[${serviceObserved.join(", ")}]`,
      );
    }

    // Fluxo 43: escrita direta em notifications pelo papel da aplicação.
    const recipient = crypto.randomUUID();
    await db.query(`insert into auth.users (id) values ($1)`, [recipient]);
    await db.query(`
      insert into public.notifications
        (recipient_id, kind, title, body, event_key)
      values ($1, 'booking_created', 'Teste', 'Fluxo de privilégios', 'privileges-flow-${phase}')
    `, [recipient]);
    const client = new Client({
      host: "127.0.0.1",
      port,
      user: "authenticated",
      password,
      database,
    });
    await client.connect();
    clients.add(client);
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [recipient]);
    let updateDenied = false;
    let updateError = "";
    try {
      await client.query(
        `update public.notifications set is_read = true
          where event_key = $1`,
        [`privileges-flow-${phase}`],
      );
    } catch (error) {
      updateDenied = true;
      updateError = String(error?.message ?? error);
    }
    const shouldDeny = phase === "after";
    flows.set(DIRECT_UPDATE_FLOW, updateDenied ? "denied" : "allowed");
    reportFlow(
      phase,
      DIRECT_UPDATE_FLOW,
      updateDenied === shouldDeny,
      shouldDeny
        ? `esperava permission denied, obteve ${updateDenied ? "permissão" : updateError}`
        : `esperava sucesso antes da migration, obteve ${updateError}`,
    );
  } finally {
    await Promise.allSettled([...clients].map((client) => client.end()));
    if (db) await db.end().catch(() => undefined);
    if (admin) await admin.end().catch(() => undefined);
    await postgres.stop().catch(() => undefined);
  }

  return { phase, flows, unmapped };
}

console.log("[matriz de privilégios — tabelas e views]");
const results = [];
for (const phase of phases) {
  console.log(`\n[fase ${phase}]`);
  results.push(await runPhase(phase));
}

if (!dumpOnly && phases.length === 2) {
  console.log("\n[comparação before/after]");
  const [before, after] = results;
  const allKeys = new Set([...before.flows.keys(), ...after.flows.keys()]);
  const differences = [...allKeys].filter(
    (key) => before.flows.get(key) !== after.flows.get(key),
  );
  const calendarFlows = CALENDAR_OBJECTS.flatMap((object) => [`${object}:anon`, `${object}:authenticated`]);
  const expectedDifferences = [
    "notifications:anon",
    "notifications:authenticated",
    DIRECT_UPDATE_FLOW,
    ...calendarFlows,
  ];
  const unexpected = differences.filter((key) => !expectedDifferences.includes(key));
  reportFlow(
    "diff",
    "mudanças são só o UPDATE direto em notifications e as tabelas novas do Calendar",
    differences.length > 0 && unexpected.length === 0,
    `diferenças inesperadas=${unexpected.join(", ") || "nenhuma"}`,
  );
  const bookingsChanged = ["bookings:anon", "bookings:authenticated", "booking_events:anon",
    "booking_events:authenticated"].some((key) => differences.includes(key));
  reportFlow("diff", "bookings e booking_events permanecem intactos", !bookingsChanged);
  const calendarLeaks = calendarFlows.filter(
    (key) => before.flows.has(key) || after.flows.get(key) !== "",
  );
  reportFlow(
    "diff",
    "tabelas do Calendar (#29) surgem só na fase after, sem privilégio para anon/authenticated",
    calendarLeaks.length === 0,
    `divergências=${calendarLeaks.map((key) => `${key}=[${after.flows.get(key) ?? "ausente"}]`).join(", ")}`,
  );
}

if (failures > 0) {
  console.error(`\nresultado: ${failures} falha(s)`);
  process.exitCode = 1;
} else {
  console.log("\nresultado: matriz de privilégios conforme o contrato");
}
