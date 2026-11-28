/**
 * Verificação da matriz canônica de privilégios de tabelas/views do schema public.
 *
 * Os default privileges do Supabase (ALL em tabelas, sequences e funções novas
 * de `public` para anon/authenticated/service_role) são emulados ANTES da
 * primeira migration — sem isso um Postgres puro não concede nada e a matriz
 * não prova nada (#125).
 *
 * Duas fases em clusters PostgreSQL embutidos independentes:
 *   before — todas as migrations, exceto a matriz (#123), o hardening (#125) e
 *            o Google Calendar (#29). É a linha de base vulnerável;
 *   after  — todas as migrations.
 *
 * Fase after:
 *   - matriz exata por objeto/papel (anon e authenticated) e service_role;
 *   - regras globais: RLS em toda tabela, nenhum TRUNCATE/REFERENCES/TRIGGER
 *     para clientes, anon sem escrita, escrita de authenticated e leitura de
 *     anon só com política correspondente;
 *   - fluxos reais como anon/authenticated (TRUNCATE negado, escritas diretas
 *     negadas, escritas legítimas da aplicação e RPCs funcionando).
 * Comparação: as mudanças só reduzem privilégios, só nas tabelas legadas, e as
 * tabelas do Calendar surgem sem privilégio para clientes.
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
import { bootstrapStorageHarness } from "./storage-harness.mjs";

const { Client } = pg;
const MULTI_MIGRATION = "20261125120000_booking_multiple_services.sql";
const SECURITY_MIGRATION = "20261125130000_table_privileges_matrix.sql";
const HARDEN_MIGRATION = "20261125140000_harden_public_table_privileges.sql";
const CALENDAR_MIGRATION = "20261125153000_google_calendar_sync.sql";
const CALENDAR_FENCING_MIGRATION = "20261128000000_calendar_worker_fencing.sql";
const CALENDAR_REVOCATION_MIGRATION = "20261128000100_calendar_disconnect_revocation_retry.sql";
const MEDIA_MIGRATION = "20261128000400_service_images_storage.sql";
/** Tabelas criadas pela migration do Calendar: só existem na fase after. */
const CALENDAR_OBJECTS = ["calendar_connections", "calendar_sync_outbox", "booking_calendar_events"];
/** Tabelas anteriores à convenção `revoke all … grant …`, endurecidas pela #125. */
const LEGACY_OBJECTS = [
  "profiles",
  "providers",
  "services",
  "availability_rules",
  "availability_exceptions",
  "bookings",
  "booking_events",
  "notifications",
];
const EXCLUDED_BEFORE = [SECURITY_MIGRATION, HARDEN_MIGRATION, CALENDAR_MIGRATION, CALENDAR_FENCING_MIGRATION, CALENDAR_REVOCATION_MIGRATION, MEDIA_MIGRATION];
const PRIVILEGE_LETTER = {
  SELECT: "S",
  INSERT: "I",
  UPDATE: "U",
  DELETE: "D",
  TRUNCATE: "T",
  REFERENCES: "R",
  TRIGGER: "G",
};
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
  booking_events: { anon: [], authenticated: ["SELECT"], service_role: ["ALL"] },
  booking_services: { anon: [], authenticated: ["SELECT"], service_role: ["ALL"] },
  bookings: { anon: [], authenticated: ["SELECT"], service_role: ["ALL"] },
  feature_flag_overrides: { anon: [], authenticated: [], service_role: ["ALL"] },
  feature_flags: { anon: [], authenticated: [], service_role: ["ALL"] },
  legal_acceptances: { anon: [], authenticated: ["SELECT"], service_role: ["ALL"] },
  legal_documents: { anon: ["SELECT"], authenticated: ["SELECT"], service_role: ["ALL"] },
  notification_preferences: {
    anon: [],
    authenticated: ["SELECT", "INSERT", "UPDATE"],
    service_role: ["ALL"],
  },
  notifications: { anon: [], authenticated: ["SELECT"], service_role: ["ALL"] },
  profiles: {
    anon: [],
    authenticated: ["SELECT", "INSERT", "UPDATE"],
    service_role: ["ALL"],
  },
  provider_service_areas: {
    anon: [],
    authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    service_role: ["ALL"],
  },
  providers: {
    anon: ["SELECT"],
    authenticated: ["SELECT", "INSERT", "UPDATE"],
    service_role: ["ALL"],
  },
  service_categories: { anon: ["SELECT"], authenticated: ["SELECT"], service_role: ["ALL"] },
  service_category_aliases: {
    anon: ["SELECT"],
    authenticated: ["SELECT"],
    service_role: ["ALL"],
  },
  // Visão: com os defaults do Supabase o service_role recebe ALL também em
  // visões (e já ignora RLS); clientes só leem.
  service_category_catalog: {
    anon: ["SELECT"],
    authenticated: ["SELECT"],
    service_role: ["ALL"],
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
  const port = phase === "before" ? 55438 : 55439;
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
      grant usage on schema auth to anon, authenticated, service_role;
      alter role service_role bypassrls;
      -- Default privileges do Supabase para tudo que as migrations criarem em
      -- public, desde a primeira (#125).
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    `);
    await bootstrapStorageHarness(db);

    const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
    let names = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const required of EXCLUDED_BEFORE) {
      if (!names.includes(required)) throw new Error(`migration não encontrada: ${required}`);
    }
    reportStructural(
      phase,
      "ordem: matriz (#123) < hardening (#125) < Calendar (#29) < Storage de mídia",
      names.indexOf(SECURITY_MIGRATION) < names.indexOf(HARDEN_MIGRATION) &&
        names.indexOf(HARDEN_MIGRATION) < names.indexOf(CALENDAR_MIGRATION) &&
        names.indexOf(CALENDAR_MIGRATION) < names.indexOf(CALENDAR_FENCING_MIGRATION) &&
        names.indexOf(CALENDAR_FENCING_MIGRATION) < names.indexOf(CALENDAR_REVOCATION_MIGRATION) &&
        names.indexOf(CALENDAR_REVOCATION_MIGRATION) < names.indexOf(MEDIA_MIGRATION),
    );
    reportStructural(
      phase,
      "hardening é a última migration que toca as tabelas legadas antes do Calendar",
      names.indexOf(HARDEN_MIGRATION) === names.indexOf(CALENDAR_MIGRATION) - 1,
      "uma migration nova entre as duas precisa ser revisada contra a matriz",
    );
    if (phase === "before") {
      names = names.filter((name) => !EXCLUDED_BEFORE.includes(name));
    }

    for (const name of names) {
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

    const snapshot = {};
    for (const name of objects) {
      snapshot[name] = {
        anon: await observedPrivileges(db, name, "anon"),
        authenticated: await observedPrivileges(db, name, "authenticated"),
        service_role: await observedPrivileges(db, name, "service_role"),
      };
      for (const role of ["anon", "authenticated"]) {
        flows.set(`${name}:${role}`, snapshot[name][role].join(","));
      }
    }
    if (dumpOnly) {
      console.log(JSON.stringify(snapshot, null, 2));
      return { phase, flows, unmapped, snapshot };
    }

    if (phase === "before") {
      // Autoteste do harness: sem os defaults emulados a fase after passaria
      // por vacuidade. A linha de base precisa reproduzir o problema da #125.
      const vulnerable = LEGACY_OBJECTS.filter((name) =>
        snapshot[name]?.authenticated.includes("TRUNCATE"),
      );
      reportStructural(
        phase,
        "linha de base reproduz o GRANT ALL do Supabase nas tabelas legadas",
        vulnerable.length === LEGACY_OBJECTS.length,
        `com TRUNCATE para authenticated: ${vulnerable.join(", ") || "nenhuma"}`,
      );
      for (const object of CALENDAR_OBJECTS) {
        reportStructural(
          phase,
          `public.${object} ainda não existe antes da migration do Calendar`,
          !objects.includes(object),
        );
      }
      return { phase, flows, unmapped };
    }

    // ------------------------------------------------------------ matriz exata
    for (const object of OBJECTS) {
      if (!objects.includes(object)) {
        reportStructural(phase, `objeto da matriz ausente: public.${object}`, false);
        continue;
      }
      for (const role of ["anon", "authenticated"]) {
        const observed = snapshot[object][role];
        const expected = [...MATRIX[object][role]].sort();
        reportFlow(
          phase,
          `${object}: privilégios de ${role} = [${expected.join(", ") || "nenhum"}]`,
          JSON.stringify(observed) === JSON.stringify(expected),
          `observado=[${observed.join(", ")}]`,
        );
      }
      const serviceExpected = MATRIX[object].service_role.includes("ALL")
        ? [...PRIVILEGES].sort()
        : [...MATRIX[object].service_role].sort();
      reportStructural(
        phase,
        `${object}: service_role mantém acesso operacional`,
        JSON.stringify(snapshot[object].service_role) === JSON.stringify(serviceExpected),
        `observado=[${snapshot[object].service_role.join(", ")}]`,
      );
    }

    // --------------------------------------------------------- regras globais
    const tables = (
      await db.query(`
        select c.relname as name, c.relrowsecurity as rls
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'p')
         order by 1
      `)
    ).rows;
    const withoutRls = tables.filter((table) => !table.rls).map((table) => table.name);
    reportStructural(phase, "toda tabela de public tem RLS ativo", withoutRls.length === 0, withoutRls.join(", "));

    const forbidden = [];
    const anonWrites = [];
    for (const name of objects) {
      for (const role of ["anon", "authenticated"]) {
        for (const privilege of ["TRUNCATE", "REFERENCES", "TRIGGER"]) {
          if (snapshot[name][role].includes(privilege)) forbidden.push(`${name}:${role}:${PRIVILEGE_LETTER[privilege]}`);
        }
      }
      for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
        if (snapshot[name].anon.includes(privilege)) anonWrites.push(`${name}:${PRIVILEGE_LETTER[privilege]}`);
      }
    }
    reportStructural(
      phase,
      "nenhum TRUNCATE/REFERENCES/TRIGGER para anon/authenticated em public",
      forbidden.length === 0,
      forbidden.join(", "),
    );
    reportStructural(phase, "anon não tem INSERT/UPDATE/DELETE em public", anonWrites.length === 0, anonWrites.join(", "));

    const policies = (
      await db.query(`select tablename, cmd, roles::text[] as roles from pg_policies where schemaname = 'public'`)
    ).rows;
    const hasPolicy = (table, command, role) =>
      policies.some(
        (policy) =>
          policy.tablename === table &&
          (policy.cmd === command || policy.cmd === "ALL") &&
          (policy.roles.includes(role) || policy.roles.includes("public")),
      );
    const tableNames = new Set(tables.map((table) => table.name));
    const writesWithoutPolicy = [];
    const anonReadsWithoutPolicy = [];
    for (const name of objects.filter((object) => tableNames.has(object))) {
      for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
        if (snapshot[name].authenticated.includes(privilege) && !hasPolicy(name, privilege, "authenticated")) {
          writesWithoutPolicy.push(`${name}:${PRIVILEGE_LETTER[privilege]}`);
        }
      }
      if (snapshot[name].anon.includes("SELECT") && !hasPolicy(name, "SELECT", "anon")) {
        anonReadsWithoutPolicy.push(name);
      }
    }
    reportStructural(
      phase,
      "escrita de authenticated só onde há política do mesmo comando",
      writesWithoutPolicy.length === 0,
      writesWithoutPolicy.join(", "),
    );
    reportStructural(
      phase,
      "SELECT de anon só onde há política de leitura que vale para anon",
      anonReadsWithoutPolicy.length === 0,
      anonReadsWithoutPolicy.join(", "),
    );

    // ----------------------------------------------------------- fluxos reais
    const connectAs = async (role) => {
      const client = new Client({ host: "127.0.0.1", port, user: role, password, database });
      await client.connect();
      clients.add(client);
      return client;
    };
    const asUser = async (userId) => {
      const client = await connectAs("authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
      return client;
    };
    const attempt = async (client, sql, params = []) => {
      try {
        const result = await client.query(sql, params);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, error: String(error?.message ?? error) };
      }
    };
    const expectDenied = async (name, client, sql, params = []) => {
      const outcome = await attempt(client, sql, params);
      reportFlow(
        phase,
        name,
        !outcome.ok && outcome.error.includes("permission denied"),
        outcome.ok ? "esperava permission denied, foi permitido" : outcome.error,
      );
    };
    const expectAllowed = async (name, client, sql, params = [], check = () => true) => {
      const outcome = await attempt(client, sql, params);
      reportFlow(phase, name, outcome.ok && check(outcome.result), outcome.ok ? "resultado inesperado" : outcome.error);
      return outcome.result;
    };

    const owner = crypto.randomUUID();
    const customer = crypto.randomUUID();
    await db.query(`insert into auth.users (id) values ($1), ($2)`, [owner, customer]);
    const ownerClient = await asUser(owner);
    const customerClient = await asUser(customer);
    const anonClient = await connectAs("anon");
    const slug = `privileges-${phase}`;

    // Escritas legítimas da aplicação (mesmos caminhos de src/).
    await expectAllowed(
      "authenticated: upsert do próprio perfil (insert + update)",
      ownerClient,
      `insert into public.profiles (id, display_name) values ($1, 'Dono')
       on conflict (id) do update set display_name = excluded.display_name returning id`,
      [owner],
      (result) => result.rowCount === 1,
    );
    await expectAllowed(
      "authenticated: cliente também cria o próprio perfil",
      customerClient,
      `insert into public.profiles (id, display_name) values ($1, 'Cliente') returning id`,
      [customer],
      (result) => result.rowCount === 1,
    );
    const providerRow = await expectAllowed(
      "authenticated: cria o próprio estabelecimento",
      ownerClient,
      `insert into public.providers (owner_id, slug, display_name, is_published) values ($1, $2, 'Estúdio', true) returning id`,
      [owner, slug],
      (result) => result.rowCount === 1,
    );
    const providerId = providerRow?.rows[0]?.id;
    await expectAllowed(
      "authenticated: edita o próprio estabelecimento",
      ownerClient,
      `update public.providers set display_name = 'Estúdio Novo' where id = $1`,
      [providerId],
      (result) => result.rowCount === 1,
    );
    const serviceRow = await expectAllowed(
      "authenticated: cria serviço",
      ownerClient,
      `insert into public.services (provider_id, name, duration_minutes, price_cents, deposit_cents)
       values ($1, 'Corte', 30, 5000, 1000) returning id`,
      [providerId],
      (result) => result.rowCount === 1,
    );
    const serviceId = serviceRow?.rows[0]?.id;
    await expectAllowed(
      "authenticated: edita serviço",
      ownerClient,
      `update public.services set price_cents = 5500 where id = $1`,
      [serviceId],
      (result) => result.rowCount === 1,
    );
    // Statements separados: um CTE não enxerga as linhas inseridas no mesmo
    // comando, e o update/delete afetaria 0 linhas.
    const tempService = await ownerClient.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents) values ($1, 'Temp', 15, 100) returning id`,
      [providerId],
    );
    await expectAllowed(
      "authenticated: remove serviço",
      ownerClient,
      `delete from public.services where id = $1`,
      [tempService.rows[0].id],
      (result) => result.rowCount === 1,
    );
    await expectAllowed(
      "authenticated: cria regras de disponibilidade",
      ownerClient,
      `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at)
       select $1, day, '08:00', '20:00' from generate_series(0, 6) as day`,
      [providerId],
      (result) => result.rowCount === 7,
    );
    await expectAllowed(
      "authenticated: edita e remove regra de disponibilidade",
      ownerClient,
      `with edited as (
         update public.availability_rules set ends_at = '21:00' where provider_id = $1 returning id
       ) select count(*)::int as n from edited`,
      [providerId],
      (result) => result.rows[0]?.n === 7,
    );
    const tempRule = await ownerClient.query(
      `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at) values ($1, 0, '21:00', '22:00') returning id`,
      [providerId],
    );
    await expectAllowed(
      "authenticated: remove regra de disponibilidade",
      ownerClient,
      `delete from public.availability_rules where id = $1`,
      [tempRule.rows[0].id],
      (result) => result.rowCount === 1,
    );
    const exception = await expectAllowed(
      "authenticated: cria exceção de disponibilidade",
      ownerClient,
      `insert into public.availability_exceptions (provider_id, exception_date, kind)
       values ($1, current_date + 60, 'blocked') returning id`,
      [providerId],
      (result) => result.rowCount === 1,
    );
    await expectAllowed(
      "authenticated: remove exceção de disponibilidade",
      ownerClient,
      `delete from public.availability_exceptions where id = $1`,
      [exception?.rows[0]?.id],
      (result) => result.rowCount === 1,
    );
    await expectAllowed(
      "anon: lê serviços do estabelecimento publicado",
      anonClient,
      `select id from public.services where provider_id = $1`,
      [providerId],
      (result) => result.rowCount === 1,
    );

    const startsAt = (
      await db.query(
        `select (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '7 days 10 hours')
                  at time zone 'America/Sao_Paulo' as at`,
      )
    ).rows[0].at;
    const bookingRow = await expectAllowed(
      "authenticated: create_booking (SECURITY DEFINER) sem privilégio de tabela",
      customerClient,
      `select * from public.create_booking($1, $2::uuid[], $3, 'Cliente', '11999999999', $4)`,
      [slug, [serviceId], startsAt, `privileges-${phase}-${crypto.randomUUID()}`],
      (result) => result.rowCount === 1,
    );
    const bookingId = bookingRow?.rows[0]?.id;
    await expectAllowed(
      "authenticated: transition_booking proof_received e payment_approved pelo dono",
      ownerClient,
      `select (select status from public.transition_booking($1, 'proof_received')) as first,
              (select status from public.transition_booking($1, 'payment_approved')) as second`,
      [bookingId],
      (result) => result.rows[0]?.second === "confirmed",
    );
    await expectAllowed(
      "authenticated: participante lê a própria reserva",
      customerClient,
      `select id from public.bookings where id = $1`,
      [bookingId],
      (result) => result.rowCount === 1,
    );
    const notificationRow = await expectAllowed(
      "trigger SECURITY DEFINER gera notificação para o cliente",
      customerClient,
      `select id from public.notifications where recipient_id = $1 order by created_at limit 1`,
      [customer],
      (result) => result.rowCount === 1,
    );
    await expectAllowed(
      "authenticated: mark_notification_read e mark_all_notifications_read",
      customerClient,
      `select (select is_read from public.mark_notification_read($1)) as one,
              public.mark_all_notifications_read() as all_count`,
      [notificationRow?.rows[0]?.id],
      (result) => result.rows[0]?.one === true,
    );
    await expectAllowed(
      "authenticated: grava e atualiza própria preferência de notificação",
      customerClient,
      `insert into public.notification_preferences (user_id, event_type, channel, enabled)
       values ($1, 'booking.reminder', 'in_app', false)
       on conflict (user_id, event_type, channel) do update set enabled = excluded.enabled
       returning enabled`,
      [customer],
      (result) => result.rows[0]?.enabled === false,
    );

    // Escritas diretas e leituras sem política: negadas por privilégio.
    await expectDenied(
      "authenticated: DELETE em notification_preferences",
      customerClient,
      `delete from public.notification_preferences where user_id = $1`,
      [customer],
    );
    await expectDenied(
      "anon: SELECT em notification_preferences",
      anonClient,
      `select user_id from public.notification_preferences`,
    );
    await expectDenied(
      "authenticated: INSERT direto em bookings",
      customerClient,
      `insert into public.bookings (provider_id) values ($1)`,
      [providerId],
    );
    await expectDenied("authenticated: UPDATE direto em bookings", ownerClient, `update public.bookings set status = 'confirmed'`);
    await expectDenied(
      "authenticated: INSERT direto em booking_events",
      ownerClient,
      `insert into public.booking_events (booking_id, event_type, source) values ($1, 'booking.confirmed', 'system')`,
      [bookingId],
    );
    await expectDenied(
      "authenticated: UPDATE direto em notifications (só via RPC)",
      customerClient,
      `update public.notifications set title = 'x'`,
    );
    await expectDenied("authenticated: DELETE do próprio perfil", customerClient, `delete from public.profiles where id = $1`, [customer]);
    await expectDenied("authenticated: DELETE do estabelecimento", ownerClient, `delete from public.providers where id = $1`, [providerId]);
    await expectDenied(
      "anon: INSERT em services",
      anonClient,
      `insert into public.services (provider_id, name, duration_minutes, price_cents) values ($1, 'x', 10, 0)`,
      [providerId],
    );
    await expectDenied("anon: SELECT em bookings", anonClient, `select id from public.bookings`);
    await expectDenied("anon: SELECT em profiles", anonClient, `select id from public.profiles`);

    // TRUNCATE ignora RLS: precisa ser negado por privilégio. Sempre em
    // transação revertida, para não apagar dados mesmo se o check falhar.
    const countBefore = (await db.query(`select count(*)::int as n from public.bookings`)).rows[0].n;
    for (const object of [...LEGACY_OBJECTS, "booking_services"]) {
      for (const [role, client] of [["anon", anonClient], ["authenticated", ownerClient]]) {
        await client.query("begin");
        await expectDenied(`${role}: TRUNCATE em ${object}`, client, `truncate table public.${object}`);
        await client.query("rollback");
      }
    }
    const countAfter = (await db.query(`select count(*)::int as n from public.bookings`)).rows[0].n;
    reportFlow(phase, "dados intactos depois das tentativas de TRUNCATE", countBefore === countAfter && countAfter > 0);
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
  const differences = [...allKeys].filter((key) => before.flows.get(key) !== after.flows.get(key));
  const calendarFlows = CALENDAR_OBJECTS.flatMap((object) => [`${object}:anon`, `${object}:authenticated`]);
  const legacyFlows = LEGACY_OBJECTS.flatMap((object) => [`${object}:anon`, `${object}:authenticated`]);
  const unexpected = differences.filter((key) => !legacyFlows.includes(key) && !calendarFlows.includes(key));
  reportFlow(
    "diff",
    "mudanças só nas tabelas legadas (#125) e nas tabelas novas do Calendar (#29)",
    differences.length > 0 && unexpected.length === 0,
    `diferenças inesperadas=${unexpected.join(", ") || "nenhuma"}`,
  );
  const split = (value) => (value ? value.split(",") : []);
  const gained = differences
    .filter((key) => before.flows.has(key))
    .flatMap((key) => {
      const previous = split(before.flows.get(key));
      return split(after.flows.get(key))
        .filter((privilege) => !previous.includes(privilege))
        .map((privilege) => `${key}+${privilege}`);
    });
  reportFlow("diff", "as migrations só reduzem privilégios de anon/authenticated", gained.length === 0, gained.join(", "));
  const calendarLeaks = calendarFlows.filter((key) => before.flows.has(key) || after.flows.get(key) !== "");
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
