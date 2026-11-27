/**
 * Harness PostgreSQL isolado da integração Google Calendar (Issue #29).
 *
 * Aplica todas as migrations em um cluster efêmero, emulando ANTES da
 * migration do Calendar os default privileges que o Supabase concede a
 * anon/authenticated em objetos novos de `public`, e verifica:
 *  - nomes/colunas (`calendar_connections`), RLS e privilégios das 3 tabelas;
 *  - funções SECURITY DEFINER com search_path fixo e EXECUTE mínimo;
 *  - trigger booking_events -> outbox;
 *  - claim com no máximo um job por reserva, em ordem, sem paralelismo;
 *  - estado terminal `dead`;
 *  - consumo atômico e preso ao usuário do state OAuth;
 *  - finalização da desconexão.
 * Uso: node scripts/calendar-check.mjs
 */
import os from "node:os";
import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const { Client } = pg;
const PORT = 55437;
const PASSWORD = "marcou-calendar-test";
const DATABASE = "marcou_calendar";
const CALENDAR_MIGRATION = "20261125153000_google_calendar_sync.sql";
const TABLES = ["calendar_connections", "calendar_sync_outbox", "booking_calendar_events"];
const TABLE_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const databaseDir = path.join(os.tmpdir(), "marcou-calendar-pg-data");

let passed = 0;
let failed = 0;
let admin;
let db;
const extraClients = [];
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: PASSWORD,
  port: PORT,
  persistent: false,
  autoRehydrateSymlinks: true,
});

function check(name, condition, extra = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

async function expectError(name, operation, messagePart) {
  try {
    await operation();
    check(name, false, "(não lançou erro)");
  } catch (error) {
    const text = String(error?.message ?? error);
    check(name, text.includes(messagePart), `esperava "${messagePart}", obteve "${text}"`);
  }
}

async function connect(user = "postgres") {
  const client = new Client({ host: "127.0.0.1", port: PORT, database: DATABASE, user, password: PASSWORD });
  await client.connect();
  extraClients.push(client);
  return client;
}

try {
  await rm(databaseDir, { recursive: true, force: true });
  await postgres.initialise();
  await postgres.start();

  admin = new Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PASSWORD, database: "postgres" });
  await admin.connect();
  await admin.query(`create database ${DATABASE}`);
  for (const role of ["anon", "authenticated", "service_role"]) {
    await admin.query(`create role ${role} login password '${PASSWORD}'`);
  }
  // Como no Supabase: service_role ignora RLS.
  await admin.query(`alter role service_role bypassrls`);

  db = new Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PASSWORD, database: DATABASE });
  await db.connect();
  await db.query(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
  `);

  const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
  const migrationNames = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
  check("migration do Calendar existe", migrationNames.includes(CALENDAR_MIGRATION));
  const matrixMigration = migrationNames.find((name) => name.includes("table_privileges_matrix"));
  if (matrixMigration) {
    check(
      "migration do Calendar é posterior à matriz de privilégios (#123)",
      migrationNames.indexOf(CALENDAR_MIGRATION) > migrationNames.indexOf(matrixMigration),
    );
  } else {
    console.log("  info matriz de privilégios (#123) ainda não está nesta árvore");
  }

  for (const name of migrationNames) {
    if (name === CALENDAR_MIGRATION) {
      // Emula os default privileges do Supabase para objetos novos de public.
      await db.query(`
        alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
        alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
        alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
      `);
    }
    const sql = await readFile(path.join(migrationDirectory, name), "utf8");
    await db.query(sql);
    console.log(`aplicada: supabase/migrations/${name}`);
  }

  // ------------------------------------------------------------------ schema
  console.log("\n[schema, RLS e privilégios]");
  const oldTable = await db.query(`select to_regclass('public.provider_calendar_connections') as t`);
  check("nome antigo provider_calendar_connections não existe", oldTable.rows[0].t === null);

  const columns = (
    await db.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'calendar_connections'`,
    )
  ).rows.map((row) => row.column_name);
  const requiredColumns = [
    "provider_id",
    "refresh_token_ciphertext",
    "access_token_ciphertext",
    "access_token_expires_at",
    "calendar_id",
    "granted_scope",
    "connection_status",
    "oauth_state_hash",
    "oauth_state_expires_at",
    "oauth_state_user_id",
    "connected_at",
    "disconnect_requested_at",
    "revocation_pending_at",
    "updated_at",
  ];
  check(
    "calendar_connections tem as colunas esperadas",
    requiredColumns.every((column) => columns.includes(column)),
    requiredColumns.filter((column) => !columns.includes(column)).join(", "),
  );

  const outboxLease = await db.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'calendar_sync_outbox' and column_name = 'lease_token'`,
  );
  check("outbox tem lease_token para fencing", outboxLease.rowCount === 1);

  const statusCheck = await db.query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
     where conrelid = 'public.calendar_connections'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%connection_status%' and pg_get_constraintdef(oid) like '%pending%'`,
  );
  const statusDef = statusCheck.rows[0]?.def ?? "";
  check(
    "connection_status aceita só pending/connected/suspended",
    ["pending", "connected", "suspended"].every((value) => statusDef.includes(`'${value}'`)) &&
      !statusDef.includes("disconnecting"),
    statusDef,
  );

  for (const table of TABLES) {
    const rls = await db.query(`select relrowsecurity from pg_class where oid = $1::regclass`, [`public.${table}`]);
    check(`${table}: RLS ligada`, rls.rows[0].relrowsecurity === true);
    const policies = await db.query(`select count(*)::int as n from pg_policies where schemaname='public' and tablename=$1`, [table]);
    check(`${table}: nenhuma policy de cliente`, policies.rows[0].n === 0);
    for (const role of ["anon", "authenticated", "public"]) {
      const granted = [];
      for (const privilege of TABLE_PRIVILEGES) {
        const result = await db.query(
          role === "public"
            ? `select exists (select 1 from information_schema.role_table_grants
                 where table_schema='public' and table_name=$1 and grantee='PUBLIC' and privilege_type=$2) as ok`
            : `select has_table_privilege('${role}', $1, $2) as ok`,
          role === "public" ? [table, privilege] : [`public.${table}`, privilege],
        );
        if (result.rows[0].ok) granted.push(privilege);
      }
      check(`${table}: ${role} sem nenhum privilégio (apesar dos defaults do Supabase)`, granted.length === 0, granted.join(","));
    }
    const serviceAll = [];
    for (const privilege of TABLE_PRIVILEGES) {
      const result = await db.query(`select has_table_privilege('service_role', $1, $2) as ok`, [`public.${table}`, privilege]);
      serviceAll.push(result.rows[0].ok);
    }
    check(`${table}: service_role com ALL`, serviceAll.every(Boolean));
  }

  const sequences = await db.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S' and c.relname like any (array['calendar%','booking_calendar%'])`,
  );
  check("Calendar não cria sequences expostas", sequences.rowCount === 0, sequences.rows.map((r) => r.relname).join(","));

  console.log("\n[funções SECURITY DEFINER]");
  const functions = {
    "public.enqueue_calendar_sync_from_booking_event()": false,
    "public.enqueue_calendar_backfill_on_connect()": false,
    "public.claim_calendar_sync_jobs(integer)": true,
    "public.consume_calendar_oauth_state(text, uuid)": true,
    "public.finalize_calendar_disconnect(uuid)": true,
    "public.complete_calendar_disconnect(uuid)": true,
  };
  for (const [signature, serviceRoleExecutes] of Object.entries(functions)) {
    const meta = await db.query(
      `select p.prosecdef, p.proconfig, p.proacl::text as acl from pg_proc p where p.oid = $1::regprocedure`,
      [signature],
    );
    const row = meta.rows[0];
    check(`${signature}: SECURITY DEFINER`, row?.prosecdef === true);
    check(
      `${signature}: search_path fixo`,
      Array.isArray(row?.proconfig) && row.proconfig.some((item) => item === "search_path=pg_catalog, public"),
    );
    check(`${signature}: sem EXECUTE para PUBLIC`, !/(^|[{,])=X/.test(row?.acl ?? ""), row?.acl);
    for (const role of ["anon", "authenticated"]) {
      const result = await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, signature]);
      check(`${signature}: ${role} não executa`, result.rows[0].ok === false);
    }
    const service = await db.query(`select has_function_privilege('service_role', $1, 'EXECUTE') as ok`, [signature]);
    check(`${signature}: service_role ${serviceRoleExecutes ? "executa" : "não executa"}`, service.rows[0].ok === serviceRoleExecutes);
  }

  // ------------------------------------------------------------------ dados
  const uuid = () => crypto.randomUUID();
  const owner = uuid();
  const otherOwner = uuid();
  const customer = uuid();
  await db.query(`insert into auth.users (id) values ($1), ($2), ($3)`, [owner, otherOwner, customer]);
  const provider = (
    await db.query(
      `insert into public.providers (owner_id, slug, display_name) values ($1, 'cal-provider', 'Agenda') returning id`,
      [owner],
    )
  ).rows[0].id;
  const service = (
    await db.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents) values ($1, 'Corte', 30, 5000) returning id`,
      [provider],
    )
  ).rows[0].id;

  let slot = 0;
  async function createBooking(status = "confirmed") {
    slot += 1;
    const startsAt = new Date(Date.UTC(2027, 0, 1, 8, 0) + slot * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 30 * 60 * 1000).toISOString();
    return (
      await db.query(
        `insert into public.bookings (
           provider_id, customer_id, service_id, starts_at, ends_at, occupied_until, timezone,
           customer_name, customer_phone, service_name_snapshot, duration_minutes_snapshot,
           price_cents_snapshot, deposit_cents_snapshot, buffer_minutes_snapshot, status, expires_at
         ) values ($1,$2,$3,$4,$5,$5,'America/Sao_Paulo','Cliente','', 'Corte',30,5000,0,0,$6::public.booking_status,
                   case when $6::text in ('pending_payment','pending_review') then now() + interval '1 hour' end)
         returning id`,
        [provider, customer, service, startsAt, endsAt, status],
      )
    ).rows[0].id;
  }
  async function addEvent(bookingId, eventType) {
    return (
      await db.query(
        `insert into public.booking_events (booking_id, event_type, source, external_event_id)
         values ($1, $2, 'system', $3) returning id`,
        [bookingId, eventType, `${eventType}-${uuid()}`],
      )
    ).rows[0].id;
  }
  const jobsFor = async (bookingId) =>
    (
      await db.query(
        `select id, operation, status, attempts from public.calendar_sync_outbox where booking_id = $1 order by created_at, id`,
        [bookingId],
      )
    ).rows;

  console.log("\n[trigger booking_events -> outbox]");
  const bookingA = await createBooking();
  await addEvent(bookingA, "booking.created");
  await addEvent(bookingA, "booking.reminder");
  check("eventos sem efeito no calendário não geram job", (await jobsFor(bookingA)).length === 0);
  const confirmedEvent = await addEvent(bookingA, "booking.confirmed");
  await addEvent(bookingA, "booking.cancelled");
  let jobsA = await jobsFor(bookingA);
  check(
    "confirmed -> upsert e cancelled -> delete, em ordem",
    jobsA.length === 2 && jobsA[0].operation === "upsert" && jobsA[1].operation === "delete",
    JSON.stringify(jobsA),
  );
  await db.query(
    `insert into public.calendar_sync_outbox (booking_id, booking_event_id, operation)
     values ($1, $2, 'upsert') on conflict (booking_event_id) do nothing`,
    [bookingA, confirmedEvent],
  );
  check("um job por booking_event (sem duplicata)", (await jobsFor(bookingA)).length === 2);
  const bookingService = await createBooking();
  const serviceClient = await connect("service_role");
  await serviceClient.query(
    `insert into public.booking_events (booking_id, event_type, source, external_event_id) values ($1, 'booking.confirmed', 'system', $2)`,
    [bookingService, `svc-${uuid()}`],
  );
  check("trigger dispara para inserts do service_role sem EXECUTE direto", (await jobsFor(bookingService)).length === 1);
  const bookingExpired = await createBooking();
  await addEvent(bookingExpired, "booking.expired");
  check("expired -> delete", (await jobsFor(bookingExpired))[0]?.operation === "delete");

  console.log("\n[claim: ordem e exclusividade por reserva]");
  const service_role = await connect("service_role");
  const claim = async (client = service_role, limit = 25) =>
    (await client.query(`select * from public.claim_calendar_sync_jobs($1)`, [limit])).rows;

  let claimed = await claim();
  const claimedA = claimed.filter((job) => job.booking_id === bookingA);
  check(
    "claim pega só o job mais antigo de cada reserva",
    claimedA.length === 1 && claimedA[0].id === jobsA[0].id && claimedA[0].attempts === 1,
    JSON.stringify(claimedA),
  );
  check("claim inclui outras reservas", claimed.some((job) => job.booking_id === bookingExpired));
  claimed = await claim();
  check("reserva com job em processing é ignorada (cancelamento não corre em paralelo)", claimed.length === 0, JSON.stringify(claimed));

  await db.query(`update public.calendar_sync_outbox set status='succeeded', completed_at=now(), processing_started_at=null, lease_token=null where id = $1`, [jobsA[0].id]);
  claimed = await claim();
  check(
    "depois do primeiro concluído, o próximo job da reserva é liberado",
    claimed.length === 1 && claimed[0].id === jobsA[1].id,
    JSON.stringify(claimed),
  );

  // Retry futuro do job mais antigo bloqueia os mais novos da mesma reserva.
  const bookingB = await createBooking();
  await addEvent(bookingB, "booking.confirmed");
  await addEvent(bookingB, "booking.cancelled");
  const jobsB = await jobsFor(bookingB);
  await db.query(
    `update public.calendar_sync_outbox set status='failed', attempts=1, processing_started_at=null, lease_token=null, available_at = now() + interval '1 hour' where id = $1`,
    [jobsB[0].id],
  );
  claimed = await claim();
  check("job antigo em backoff segura os mais novos da reserva", !claimed.some((job) => job.booking_id === bookingB), JSON.stringify(claimed));

  // Concorrência: dois workers simultâneos nunca pegam a mesma reserva.
  const concurrentBookings = [];
  for (let i = 0; i < 6; i += 1) {
    const bookingId = await createBooking();
    await addEvent(bookingId, "booking.confirmed");
    await addEvent(bookingId, "booking.cancelled");
    concurrentBookings.push(bookingId);
  }
  const workers = [];
  for (let i = 0; i < 8; i += 1) workers.push(await connect("service_role"));
  let violations = 0;
  let incompleteRounds = 0;
  for (let round = 0; round < 15; round += 1) {
    await db.query(
      `update public.calendar_sync_outbox set status='pending', attempts=0, processing_started_at=null, lease_token=null, available_at=now()
       where booking_id = any($1::uuid[])`,
      [concurrentBookings],
    );
    const batches = await Promise.all(
      workers.map((client) => client.query(`select * from public.claim_calendar_sync_jobs(2)`)),
    );
    const claimedNow = batches.flatMap((batch) => batch.rows).filter((job) => concurrentBookings.includes(job.booking_id));
    const perBooking = new Map();
    for (const job of claimedNow) perBooking.set(job.booking_id, (perBooking.get(job.booking_id) ?? 0) + 1);
    if ([...perBooking.values()].some((count) => count > 1)) violations += 1;
    const processing = await db.query(
      `select booking_id, count(*)::int as n from public.calendar_sync_outbox
       where booking_id = any($1::uuid[]) and status = 'processing' group by booking_id`,
      [concurrentBookings],
    );
    if (processing.rows.some((row) => row.n > 1)) violations += 1;
    if (perBooking.size !== concurrentBookings.length) incompleteRounds += 1;
  }
  check("15 rodadas de 8 claims paralelos: nunca dois jobs da mesma reserva", violations === 0, `violações=${violations}`);
  console.log(`  info rodadas em que algum worker pulou reserva travada: ${incompleteRounds}/15 (esperado com SKIP LOCKED)`);
  await db.query(
    `update public.calendar_sync_outbox set status='succeeded', processing_started_at=null, lease_token=null where booking_id = any($1::uuid[])`,
    [concurrentBookings],
  );

  console.log("\n[estado terminal dead]");
  const bookingDead = await createBooking();
  await addEvent(bookingDead, "booking.confirmed");
  const [deadJob] = await jobsFor(bookingDead);
  await db.query(
    `update public.calendar_sync_outbox set status='processing', attempts=8, lease_token=gen_random_uuid(),
       processing_started_at = now() - interval '11 minutes' where id = $1`,
    [deadJob.id],
  );
  await claim();
  const deadRow = (await db.query(`select status, last_error_code, completed_at from public.calendar_sync_outbox where id=$1`, [deadJob.id])).rows[0];
  check(
    "job preso em processing após a última tentativa vira dead com registro",
    deadRow.status === "dead" && deadRow.last_error_code === "worker_timeout_max_attempts" && deadRow.completed_at !== null,
    JSON.stringify(deadRow),
  );
  const staleBooking = await createBooking();
  await addEvent(staleBooking, "booking.confirmed");
  const [staleJob] = await jobsFor(staleBooking);
  await db.query(
    `update public.calendar_sync_outbox set status='processing', attempts=2, lease_token=gen_random_uuid(),
       processing_started_at = now() - interval '11 minutes' where id = $1`,
    [staleJob.id],
  );
  claimed = await claim();
  const firstLease = claimed.find((job) => job.id === staleJob.id)?.lease_token;
  check(
    "processing vencido com tentativas restantes é reivindicado com lease",
    Boolean(firstLease) && claimed.some((job) => job.id === staleJob.id && job.attempts === 3),
  );
  await db.query(
    `update public.calendar_sync_outbox
       set processing_started_at = now() - interval '11 minutes'
     where id = $1`,
    [staleJob.id],
  );
  const reclaimed = await claim();
  const secondLease = reclaimed.find((job) => job.id === staleJob.id)?.lease_token;
  check("reclaim substitui o lease token", Boolean(secondLease) && secondLease !== firstLease);
  const staleAck = await db.query(
    `update public.calendar_sync_outbox
        set status = 'succeeded', processing_started_at = null, lease_token = null, completed_at = now()
      where id = $1 and status = 'processing' and lease_token = $2
      returning id`,
    [staleJob.id, firstLease],
  );
  check("worker antigo não consegue confirmar job após reclaim", staleAck.rowCount === 0);
  const currentAck = await db.query(
    `update public.calendar_sync_outbox
        set status = 'succeeded', processing_started_at = null, lease_token = null, completed_at = now()
      where id = $1 and status = 'processing' and lease_token = $2
      returning id`,
    [staleJob.id, secondLease],
  );
  check("worker com lease atual consegue confirmar job", currentAck.rowCount === 1);
  await expectError(
    "status fora do conjunto é recusado",
    () => db.query(`update public.calendar_sync_outbox set status='gone' where id=$1`, [staleJob.id]),
    "calendar_sync_outbox_status_check",
  );

  console.log("\n[state OAuth]");
  const stateHash = "a".repeat(64);
  await db.query(
    `insert into public.calendar_connections (provider_id, oauth_state_hash, oauth_state_expires_at, oauth_state_user_id)
     values ($1, $2, now() + interval '10 minutes', $3)`,
    [provider, stateHash, owner],
  );
  const consume = async (hash, userId, client = service_role) =>
    (await client.query(`select * from public.consume_calendar_oauth_state($1, $2)`, [hash, userId])).rows[0];
  let consumed = await consume(stateHash, owner);
  check("state válido do mesmo usuário: ok", consumed.outcome === "ok" && consumed.connection_provider_id === provider, JSON.stringify(consumed));
  consumed = await consume(stateHash, owner);
  check("replay do state: invalid", consumed.outcome === "invalid" && consumed.connection_provider_id === null);
  const cleared = (await db.query(`select oauth_state_hash, oauth_state_user_id from public.calendar_connections where provider_id=$1`, [provider])).rows[0];
  check("state apagado após consumo", cleared.oauth_state_hash === null && cleared.oauth_state_user_id === null);

  const setState = (hash, userId, interval = "10 minutes") =>
    db.query(
      `update public.calendar_connections set oauth_state_hash=$2, oauth_state_expires_at=now() + $4::interval, oauth_state_user_id=$3 where provider_id=$1`,
      [provider, hash, userId, interval],
    );
  await setState("b".repeat(64), otherOwner);
  consumed = await consume("b".repeat(64), owner);
  check("state emitido para outro usuário: forbidden", consumed.outcome === "forbidden" && consumed.connection_provider_id === null);
  check("state de outro usuário é queimado", (await consume("b".repeat(64), otherOwner)).outcome === "invalid");

  await setState("c".repeat(64), owner, "-1 minute");
  check("state vencido: expired", (await consume("c".repeat(64), owner)).outcome === "expired");

  await setState("d".repeat(64), owner);
  const racer1 = await connect("service_role");
  const racer2 = await connect("service_role");
  const race = await Promise.all([consume("d".repeat(64), owner, racer1), consume("d".repeat(64), owner, racer2)]);
  check(
    "callbacks simultâneos: exatamente um ok",
    race.filter((row) => row.outcome === "ok").length === 1 && race.filter((row) => row.outcome === "invalid").length === 1,
    JSON.stringify(race),
  );
  await expectError(
    "state parcial é recusado pela constraint",
    () => db.query(`update public.calendar_connections set oauth_state_hash='x' where provider_id=$1`, [provider]),
    "calendar_connections_state_complete",
  );

  console.log("\n[desconexão]");
  await db.query(
    `update public.calendar_connections set connection_status='connected', refresh_token_ciphertext='cipher' where provider_id=$1`,
    [provider],
  );
  await expectError(
    "disconnect_requested_at exige status suspended",
    () => db.query(`update public.calendar_connections set disconnect_requested_at=now() where provider_id=$1`, [provider]),
    "calendar_connections_disconnect_suspended",
  );
  const finalize = async () => (await service_role.query(`select * from public.finalize_calendar_disconnect($1)`, [provider])).rows[0];
  const complete = async () => (await service_role.query(`select public.complete_calendar_disconnect($1) as completed`, [provider])).rows[0].completed;
  check("finalize sem desconexão pedida não apaga", (await finalize()).finalized === false);

  await db.query(`update public.calendar_sync_outbox set status='succeeded', processing_started_at=null, lease_token=null where status in ('processing','pending','failed')`);
  const mapped = await createBooking();
  await db.query(
    `insert into public.booking_calendar_events (booking_id, provider_id, calendar_id, google_event_id) values ($1,$2,'primary','evt1')`,
    [mapped, provider],
  );
  await db.query(
    `update public.calendar_connections set connection_status='suspended', disconnect_requested_at=now() where provider_id=$1`,
    [provider],
  );
  await setState("e".repeat(64), owner);
  check("state não conecta durante a desconexão", (await consume("e".repeat(64), owner)).outcome === "disconnecting");
  check("finalize bloqueado por vínculo ativo", (await finalize()).finalized === false);

  await db.query(`update public.booking_calendar_events set orphaned_at = now() where booking_id=$1`, [mapped]);
  await addEvent(mapped, "booking.confirmed");
  const [processingJob] = await jobsFor(mapped);
  await db.query(
    `update public.calendar_sync_outbox set status='processing', lease_token=gen_random_uuid(), processing_started_at=now() where id=$1`,
    [processingJob.id],
  );
  check("finalize bloqueado por job em processing do prestador", (await finalize()).finalized === false);

  await db.query(`update public.calendar_sync_outbox set status='succeeded', processing_started_at=null, lease_token=null where id=$1`, [processingJob.id]);
  const finalized = await finalize();
  check(
    "finalize preserva token cifrado até a revogação externa",
    finalized.finalized === true && finalized.revoke_token_ciphertext === "cipher",
    JSON.stringify(finalized),
  );
  const revocationPending = await db.query(
    `select revocation_pending_at from public.calendar_connections where provider_id=$1`,
    [provider],
  );
  check("revogação pendente permanece persistida para retry", revocationPending.rowCount === 1 && revocationPending.rows[0].revocation_pending_at !== null);
  check("complete_calendar_disconnect remove após revogação confirmada", await complete() === true);
  const remaining = await db.query(`select count(*)::int as n from public.calendar_connections where provider_id=$1`, [provider]);
  check("conexão (tokens) removida após complete", remaining.rows[0].n === 0);
  const orphanKept = await db.query(`select orphaned_at from public.booking_calendar_events where booking_id=$1`, [mapped]);
  check("vínculo órfão mantido como rastro", orphanKept.rowCount === 1 && orphanKept.rows[0].orphaned_at !== null);

  console.log("\n[reenvio ao conectar (backfill)]");
  const bfOwner = uuid();
  await db.query(`insert into auth.users (id) values ($1)`, [bfOwner]);
  const bfProvider = (
    await db.query(
      `insert into public.providers (owner_id, slug, display_name) values ($1, 'cal-backfill', 'Backfill') returning id`,
      [bfOwner],
    )
  ).rows[0].id;
  const bfService = (
    await db.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents) values ($1, 'Corte', 30, 5000) returning id`,
      [bfProvider],
    )
  ).rows[0].id;
  async function bfBooking(status, startsAt) {
    const endsAt = new Date(Date.parse(startsAt) + 30 * 60 * 1000).toISOString();
    return (
      await db.query(
        `insert into public.bookings (
           provider_id, customer_id, service_id, starts_at, ends_at, occupied_until, timezone,
           customer_name, customer_phone, service_name_snapshot, duration_minutes_snapshot,
           price_cents_snapshot, deposit_cents_snapshot, buffer_minutes_snapshot, status, expires_at
         ) values ($1,$2,$3,$4,$5,$5,'America/Sao_Paulo','Cliente','','Corte',30,5000,0,0,$6::public.booking_status,
                   case when $6::text in ('pending_payment','pending_review') then now() + interval '1 hour' end)
         returning id`,
        [bfProvider, customer, bfService, startsAt, endsAt, status],
      )
    ).rows[0].id;
  }
  const future = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const bfConfirmed = await bfBooking("confirmed", future(24));
  const bfPast = await bfBooking("confirmed", future(-48));
  const bfPending = await bfBooking("pending_payment", future(26));
  const bfCancelledMapped = await bfBooking("cancelled", future(28));
  const bfCancelledPlain = await bfBooking("cancelled", future(30));
  const bfQueued = await bfBooking("confirmed", future(32));
  await db.query(
    `insert into public.booking_calendar_events (booking_id, provider_id, calendar_id, google_event_id) values ($1,$2,'primary','evt-bf')`,
    [bfCancelledMapped, bfProvider],
  );
  await addEvent(bfQueued, "booking.confirmed");
  const backfillJobs = async () =>
    (
      await db.query(
        `select o.booking_id, o.operation, o.status, o.booking_event_id
           from public.calendar_sync_outbox o
           join public.bookings b on b.id = o.booking_id
          where b.provider_id = $1 and o.reason = 'backfill'
          order by o.created_at, o.id`,
        [bfProvider],
      )
    ).rows;

  await db.query(`insert into public.calendar_connections (provider_id) values ($1)`, [bfProvider]);
  check("conexão pending não enfileira backfill", (await backfillJobs()).length === 0);

  // Transição para connected feita pelo service_role (como o callback OAuth).
  await service_role.query(
    `update public.calendar_connections set connection_status='connected', refresh_token_ciphertext='c' where provider_id=$1`,
    [bfProvider],
  );
  let bf = await backfillJobs();
  const bfIds = bf.map((job) => job.booking_id);
  check("conectar enfileira a reserva confirmada futura (upsert)", bf.some((job) => job.booking_id === bfConfirmed && job.operation === "upsert"));
  check(
    "conectar enfileira remoção de reserva cancelada com evento ativo (delete)",
    bf.some((job) => job.booking_id === bfCancelledMapped && job.operation === "delete"),
  );
  check("reserva confirmada já terminada não entra", !bfIds.includes(bfPast));
  check("reserva aguardando pagamento não entra", !bfIds.includes(bfPending));
  check("reserva cancelada sem evento no Google não entra", !bfIds.includes(bfCancelledPlain));
  check("reserva com job pending não é duplicada", !bfIds.includes(bfQueued) && (await jobsFor(bfQueued)).length === 1);
  check("backfill não toca reservas de outro prestador", bf.length === 2, JSON.stringify(bf));
  check("jobs de backfill não têm booking_event", bf.every((job) => job.booking_event_id === null && job.status === "pending"));
  const eventsAfterBackfill = await db.query(
    `select count(*)::int as n from public.booking_events where booking_id = any($1::uuid[])`,
    [[bfConfirmed, bfCancelledMapped]],
  );
  check("backfill não grava em booking_events (trilha de auditoria intacta)", eventsAfterBackfill.rows[0].n === 0);

  await service_role.query(`update public.calendar_connections set connection_status='connected' where provider_id=$1`, [bfProvider]);
  check("update connected -> connected não reenfileira", (await backfillJobs()).length === 2);

  const bfClaimed = (await claim()).filter((job) => job.booking_id === bfConfirmed);
  check("claim entrega o job de backfill", bfClaimed.length === 1 && bfClaimed[0].reason === "backfill", JSON.stringify(bfClaimed));

  await db.query(
    `update public.calendar_sync_outbox o set status='succeeded', completed_at=now(), processing_started_at=null, lease_token=null
       from public.bookings b where b.id = o.booking_id and b.provider_id = $1`,
    [bfProvider],
  );
  await service_role.query(
    `update public.calendar_connections set connection_status='suspended', suspended_reason='invalid_grant' where provider_id=$1`,
    [bfProvider],
  );
  check("suspender não enfileira", (await backfillJobs()).length === 2);
  await service_role.query(
    `update public.calendar_connections set connection_status='connected', suspended_reason=null where provider_id=$1`,
    [bfProvider],
  );
  bf = await backfillJobs();
  check(
    "reconectar após suspensão reenvia as reservas confirmadas futuras (inclusive as que já tinham job)",
    bf.filter((job) => job.status === "pending").map((job) => job.booking_id).sort().join() ===
      [bfConfirmed, bfCancelledMapped, bfQueued].sort().join(),
    JSON.stringify(bf),
  );

  await expectError(
    "job de backfill não aceita booking_event",
    () =>
      db.query(
        `insert into public.calendar_sync_outbox (booking_id, booking_event_id, reason, operation)
         select $1, id, 'backfill', 'upsert' from public.booking_events where booking_id = $2 limit 1`,
        [bfQueued, bfQueued],
      ),
    "calendar_sync_outbox_reason_event",
  );
  await expectError(
    "job de booking_event exige booking_event_id",
    () => db.query(`insert into public.calendar_sync_outbox (booking_id, operation) values ($1, 'upsert')`, [bfConfirmed]),
    "calendar_sync_outbox_reason_event",
  );

  const bulkOwner = uuid();
  await db.query(`insert into auth.users (id) values ($1)`, [bulkOwner]);
  const bulkProvider = (
    await db.query(
      `insert into public.providers (owner_id, slug, display_name) values ($1, 'cal-bulk', 'Bulk') returning id`,
      [bulkOwner],
    )
  ).rows[0].id;
  const bulkService = (
    await db.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents) values ($1, 'Corte', 30, 5000) returning id`,
      [bulkProvider],
    )
  ).rows[0].id;
  await db.query(
    `insert into public.bookings (
       provider_id, customer_id, service_id, starts_at, ends_at, occupied_until, timezone,
       customer_name, customer_phone, service_name_snapshot, duration_minutes_snapshot,
       price_cents_snapshot, deposit_cents_snapshot, buffer_minutes_snapshot, status
     )
     select $1, $2, $3,
            date_trunc('hour', now()) + make_interval(hours => 24 + g),
            date_trunc('hour', now()) + make_interval(hours => 24 + g, mins => 30),
            date_trunc('hour', now()) + make_interval(hours => 24 + g, mins => 30),
            'America/Sao_Paulo', 'Cliente', '', 'Corte', 30, 5000, 0, 0, 'confirmed'
       from generate_series(1, 510) g`,
    [bulkProvider, customer, bulkService],
  );
  await db.query(
    `insert into public.calendar_connections (provider_id, connection_status, refresh_token_ciphertext) values ($1, 'connected', 'c')`,
    [bulkProvider],
  );
  const bulk = await db.query(
    `select count(*)::int as n, max(b.starts_at) as last_start
       from public.calendar_sync_outbox o join public.bookings b on b.id = o.booking_id
      where b.provider_id = $1 and o.reason = 'backfill'`,
    [bulkProvider],
  );
  const cutoff = await db.query(
    `select starts_at from public.bookings where provider_id = $1 order by starts_at offset 499 limit 1`,
    [bulkProvider],
  );
  check(
    "inserir conexão já connected também enfileira; limite de 500, das mais próximas",
    bulk.rows[0].n === 500 && bulk.rows[0].last_start.getTime() === cutoff.rows[0].starts_at.getTime(),
    JSON.stringify(bulk.rows[0]),
  );

  console.log("\n[acesso direto de clientes]");
  const anonClient = await connect("anon");
  const authClient = await connect("authenticated");
  for (const [label, client] of [["anon", anonClient], ["authenticated", authClient]]) {
    await expectError(`${label} não lê calendar_connections`, () => client.query(`select * from public.calendar_connections`), "permission denied");
    await expectError(`${label} não chama claim`, () => client.query(`select * from public.claim_calendar_sync_jobs(1)`), "permission denied");
    await expectError(
      `${label} não consome state`,
      () => client.query(`select * from public.consume_calendar_oauth_state('x', $1)`, [owner]),
      "permission denied",
    );
  }
} catch (error) {
  failed += 1;
  console.error("  FAIL erro não tratado no harness do Calendar", error);
} finally {
  await Promise.allSettled(extraClients.map((client) => client.end()));
  if (db) await db.end().catch(() => undefined);
  if (admin) await admin.end().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
}

console.log(`\nresultado calendar: ${passed} passaram, ${failed} falharam`);
process.exitCode = failed === 0 ? 0 : 1;
