/**
 * Verificação de integração do motor de agendamentos em um PostgreSQL real.
 *
 * Sobre um cluster embutido (embedded-postgres), aplica as migrations e
 * exercita conflito, concorrência, expiração, transições e isolamento RLS.
 * Uso: node scripts/db-check.mjs
 */
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const { Client } = pg;
const PORT = 55432;
const PASSWORD = "marcou-test";
const DATABASE = "marcou";

let passed = 0;
let failed = 0;

function check(name, condition, extra = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name} ${extra}`);
  }
}

async function expectError(name, fn, messagePart) {
  try {
    await fn();
    check(name, false, "(não lançou erro)");
  } catch (error) {
    const text = String(error?.message ?? error);
    check(
      name,
      text.includes(messagePart),
      `esperava "${messagePart}", obteve "${text}"`,
    );
  }
}

const iso = (value) => new Date(value).toISOString();

async function hasPrivilege(role, table, privilege) {
  const result = await db.query(
    `select has_table_privilege($1, $2, $3) as allowed`,
    [role, `public.${table}`, privilege],
  );
  return Boolean(result.rows[0].allowed);
}

const databaseDir = path.join(os.tmpdir(), "marcou-pg-data");
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: PASSWORD,
  port: PORT,
  persistent: false,
  autoRehydrateSymlinks: true,
});

let admin;
let db;
const roleClients = new Set();

try {
  await rm(databaseDir, { recursive: true, force: true });
  await postgres.initialise();
  await postgres.start();

  admin = new Client({
    host: "127.0.0.1",
    port: PORT,
    user: "postgres",
    password: PASSWORD,
    database: "postgres",
  });
  await admin.connect();

await admin.query(`drop database if exists ${DATABASE}`);
await admin.query(`create database ${DATABASE}`);

for (const role of ["anon", "authenticated", "service_role"]) {
  await admin.query(`
    do $$
    begin
      if not exists (select from pg_roles where rolname = '${role}') then
        create role ${role} login password '${PASSWORD}';
      end if;
    end
    $$;
  `);
}

db = new Client({
  host: "127.0.0.1",
  port: PORT,
  user: "postgres",
  password: PASSWORD,
  database: DATABASE,
});
await db.connect();

await db.query(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
`);

const MULTI_MIGRATION = "supabase/migrations/20261125120000_booking_multiple_services.sql";
const PRIVILEGES_MIGRATION =
  "supabase/migrations/20261125130000_table_privileges_matrix.sql";
const migrations = [
  "supabase/migrations/202611150001_initial_schema.sql",
  "supabase/migrations/202611150002_booking_operations.sql",
  "supabase/migrations/202611150003_notifications.sql",
  "supabase/migrations/202611160001_provider_description.sql",
  "supabase/migrations/20261116035000_fix_booking_idempotency_authorization.sql",
  "supabase/migrations/202611230001_legal_documents_and_acceptances.sql",
  MULTI_MIGRATION,
  PRIVILEGES_MIGRATION,
];

async function writePrivileges(table) {
  const result = await db.query(
    `select r.rolname as role, p.privilege_type as privilege
       from pg_roles r
       cross join unnest(array[
         'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
       ]) as p(privilege_type)
      where r.rolname in ('anon', 'authenticated')
        and has_table_privilege(r.oid, ('public.' || $1)::regclass, p.privilege_type)
      order by 1, 2`,
    [table],
  );
  return result.rows.map((row) => `${row.role}:${row.privilege}`);
}

let bookingsPrivilegesBefore;
let bookingEventsPrivilegesBefore;
let legacyBackfillBookingId;
let legacyBackfillServiceId;

for (const file of migrations) {
  if (file === MULTI_MIGRATION) {
    // Flag antes da migration nova: nada aqui pode alterar bookings antigos.
    bookingsPrivilegesBefore = await writePrivileges("bookings");
    bookingEventsPrivilegesBefore = await writePrivileges("booking_events");

    // Emula os default privileges do Supabase para tabelas novas em public.
    await db.query(
      `alter default privileges in schema public
         grant all on tables to anon, authenticated`,
    );

    // Reserva de serviço único criada ANTES da migration: o backfill precisa
    // preservar o snapshot histórico, não o preço atual do serviço.
    const legacyOwner = crypto.randomUUID();
    const legacyCustomer = crypto.randomUUID();
    await db.query(`insert into auth.users (id) values ($1), ($2)`, [
      legacyOwner,
      legacyCustomer,
    ]);
    const legacyProvider = (
      await db.query(
        `insert into public.providers
           (owner_id, slug, display_name, timezone, is_published)
         values ($1, 'prov-legacy', 'Legado', 'America/Sao_Paulo', true)
         returning id`,
        [legacyOwner],
      )
    ).rows[0].id;
    legacyBackfillServiceId = (
      await db.query(
        `insert into public.services
           (provider_id, name, duration_minutes, price_cents, deposit_cents, buffer_minutes)
         values ($1, 'Serviço legado', 30, 5000, 0, 0) returning id`,
        [legacyProvider],
      )
    ).rows[0].id;
    legacyBackfillBookingId = (
      await db.query(
        `insert into public.bookings (
           provider_id, customer_id, service_id, starts_at, ends_at,
           occupied_until, timezone, customer_name, customer_phone,
           service_name_snapshot, duration_minutes_snapshot,
           price_cents_snapshot, deposit_cents_snapshot,
           buffer_minutes_snapshot, status
         ) values (
           $1, $2, $3, '2026-12-01T12:00:00Z', '2026-12-01T12:30:00Z',
           '2026-12-01T12:30:00Z', 'America/Sao_Paulo', 'Cliente legado', '',
           'Serviço legado', 30, 4500, 0, 0, 'confirmed'
         ) returning id`,
        [legacyProvider, legacyCustomer, legacyBackfillServiceId],
      )
    ).rows[0].id;
  }

  const sql = await readFile(file, "utf8");
  await db.query(sql);
  console.log(`aplicada: ${file}`);
}

console.log("\n[privilégios de booking_services]");
{
  const inheritedWrite = await writePrivileges("booking_services");
  check(
    "tabela nova não herda INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER",
    inheritedWrite.length === 0,
    inheritedWrite.join(", "),
  );

  const hasSelect = async (role) =>
    Boolean(
      (
        await db.query(
          `select has_table_privilege($1, 'public.booking_services', 'SELECT') as allowed`,
          [role],
        )
      ).rows[0].allowed,
    );
  check("anon não recebe SELECT da tabela nova", (await hasSelect("anon")) === false);
  check(
    "authenticated recebe só SELECT da tabela nova",
    (await hasSelect("authenticated")) === true,
  );
  check(
    "privilégios de bookings/booking_events não foram alterados",
    JSON.stringify(await writePrivileges("bookings")) ===
      JSON.stringify(bookingsPrivilegesBefore) &&
      JSON.stringify(await writePrivileges("booking_events")) ===
        JSON.stringify(bookingEventsPrivilegesBefore),
  );
}

function clientFor(role) {
  return new Client({
    host: "127.0.0.1",
    port: PORT,
    database: DATABASE,
    user: role,
    password: PASSWORD,
  });
}

async function asRole(role, uid) {
  const client = clientFor(role);
  await client.connect();
  roleClients.add(client);
  if (uid) {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [
      uid,
    ]);
  }
  return client;
}

const uuid = () => crypto.randomUUID();
const ownerA = uuid();
const ownerB = uuid();
const ownerC = uuid();
const customerC = uuid();
const customerD = uuid();
const customers = [uuid(), uuid(), uuid(), uuid(), uuid()];

for (const id of [ownerA, ownerB, ownerC, customerC, customerD, ...customers]) {
  await db.query("insert into auth.users (id) values ($1)", [id]);
}

const providerA = (
  await db.query(
    `insert into public.providers (owner_id, slug, display_name, timezone, is_published, booking_hold_minutes)
     values ($1, 'prov-a', 'Prestador A', 'America/Sao_Paulo', true, 30)
     returning id`,
    [ownerA],
  )
).rows[0].id;

const providerB = (
  await db.query(
    `insert into public.providers (owner_id, slug, display_name, timezone, is_published)
     values ($1, 'prov-b', 'Prestador B', 'America/Sao_Paulo', true)
     returning id`,
    [ownerB],
  )
).rows[0].id;

const providerBHidden = (
  await db.query(
    `insert into public.providers (owner_id, slug, display_name, timezone, is_published)
     values ($1, 'prov-b-hidden', 'Prestador B oculto', 'America/Sao_Paulo', false)
     returning id`,
    [ownerC],
  )
).rows[0].id;

const serviceA1 = (
  await db.query(
    `insert into public.services (provider_id, name, duration_minutes, price_cents, deposit_cents, buffer_minutes)
     values ($1, 'Serviço 60', 60, 8000, 2000, 15) returning id`,
    [providerA],
  )
).rows[0].id;

const serviceA2 = (
  await db.query(
    `insert into public.services (provider_id, name, duration_minutes, price_cents, deposit_cents, buffer_minutes)
     values ($1, 'Serviço 30', 30, 4000, 0, 0) returning id`,
    [providerA],
  )
).rows[0].id;

const serviceB1 = (
  await db.query(
    `insert into public.services (provider_id, name, duration_minutes, price_cents, deposit_cents, buffer_minutes)
     values ($1, 'Serviço B', 60, 5000, 0, 0) returning id`,
    [providerB],
  )
).rows[0].id;

// Terça a sexta (2026-12-01 a 2026-12-04), 09:00-12:00 em America/Sao_Paulo.
await db.query(
  `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at)
   select $1, day, '09:00', '12:00' from generate_series(2, 5) as day`,
  [providerA],
);
await db.query(
  `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at)
   values ($1, 2, '09:00', '12:00')`,
  [providerB],
);

// 09:00 BRT = 12:00Z; 10:00 BRT = 13:00Z; 11:00 BRT = 14:00Z.
const D1_09 = "2026-12-01T12:00:00.000Z";
const D1_10 = "2026-12-01T13:00:00.000Z";
const D2_09 = "2026-12-02T12:00:00.000Z";
const D2_10 = "2026-12-02T13:00:00.000Z";
const D3_09 = "2026-12-03T12:00:00.000Z";
const D3_1045 = "2026-12-03T13:45:00.000Z";
const D3_11 = "2026-12-03T14:00:00.000Z";

async function createBooking(client, slug, serviceId, startsAt, key, name = "Cliente") {
  const result = await client.query(
    `select * from public.create_booking($1, $2::uuid, $3, $4, '11999999999', $5)`,
    [slug, serviceId, startsAt, name, key],
  );
  return result.rows[0];
}

async function createBookingMulti(client, slug, serviceIds, startsAt, key, name = "Cliente") {
  const result = await client.query(
    `select * from public.create_booking($1, $2::uuid[], $3, $4, '11999999999', $5)`,
    [slug, serviceIds, startsAt, name, key],
  );
  return result.rows[0];
}

const ownerAClient = await asRole("authenticated", ownerA);
const ownerBClient = await asRole("authenticated", ownerB);
const customerCClient = await asRole("authenticated", customerC);
const customerDClient = await asRole("authenticated", customerD);

console.log("\n[agenda pública]");
{
  const anon = await asRole("anon");
  const result = await anon.query(
    `select public.get_provider_schedule('prov-a', $1::uuid, '2026-12-01', $2, $3) as schedule`,
    [serviceA1, "2026-12-01T00:00:00Z", "2026-12-02T00:00:00Z"],
  );
  const schedule = result.rows[0].schedule;
  check(
    "anon enxerga agenda do prestador publicado",
    schedule?.timezone === "America/Sao_Paulo",
  );
  check(
    "agenda traz as regras de expediente",
    Array.isArray(schedule?.rules) && schedule.rules.length === 4,
  );
  check(
    "agenda não expõe prestador não publicado",
    (
      await anon.query(
        `select public.get_provider_schedule('prov-b-hidden', $1::uuid, '2026-12-01', $2, $3) as schedule`,
        [serviceA1, "2026-12-01T00:00:00Z", "2026-12-02T00:00:00Z"],
      )
    ).rows[0].schedule === null,
  );
  await anon.end();
}

console.log("\n[criação e conflito]");
let booking1;
{
  booking1 = await createBooking(
    customerCClient,
    "prov-a",
    serviceA1,
    D1_09,
    `key-${uuid()}`,
    "Cliente C",
  );
  check("reserva criada como pending_payment", booking1.status === "pending_payment");
  check(
    "fim ocupado inclui intervalo (13:15Z)",
    iso(booking1.occupied_until) === "2026-12-01T13:15:00.000Z",
    `obteve ${iso(booking1.occupied_until)}`,
  );
  check(
    "snapshot de duração/preço",
    booking1.duration_minutes_snapshot === 60 && booking1.price_cents_snapshot === 8000,
  );
  check("expiração preenchida", Boolean(booking1.expires_at));
}

await expectError(
  "mesmo horário por outro cliente é recusado",
  () => createBooking(customerDClient, "prov-a", serviceA1, D1_09, `key-${uuid()}`, "Cliente D"),
  "slot_unavailable",
);

await expectError(
  "horário fora do expediente é recusado",
  () => createBooking(customerDClient, "prov-a", serviceA1, "2026-12-01T11:00:00.000Z", `key-${uuid()}`, "Cliente D"),
  "outside_working_hours",
);

await expectError(
  "horário no passado é recusado",
  () => createBooking(customerDClient, "prov-a", serviceA1, "2020-01-01T12:00:00.000Z", `key-${uuid()}`, "Cliente D"),
  "slot_in_the_past",
);

await expectError(
  "slot que invade o intervalo do anterior é recusado",
  () => createBooking(customerDClient, "prov-a", serviceA1, D1_10, `key-${uuid()}`, "Cliente D"),
  "slot_unavailable",
);

console.log("\n[concorrência]");
{
  const attempts = await Promise.allSettled(
    customers.map(async (uid, index) => {
      const client = await asRole("authenticated", uid);
      try {
        return await createBooking(
          client,
          "prov-a",
          serviceA2,
          D2_09,
          `race-${uuid()}`,
          `Concorrente ${index}`,
        );
      } finally {
        await client.end();
      }
    }),
  );
  const succeeded = attempts.filter((attempt) => attempt.status === "fulfilled");
  const rejected = attempts.filter(
    (attempt) =>
      attempt.status === "rejected" &&
      String(attempt.reason?.message).includes("slot_unavailable"),
  );
  check("apenas uma reserva concorrente vence", succeeded.length === 1, `obteve ${succeeded.length}`);
  check(
    "demais recebem slot_unavailable",
    rejected.length === customers.length - 1,
    `obteve ${rejected.length}`,
  );
}

console.log("\n[adjacência]");
{
  const result = await createBooking(
    customerDClient,
    "prov-a",
    serviceA2,
    D2_10,
    `key-${uuid()}`,
    "Adjacente",
  );
  check(
    "slot adjacente aceito",
    iso(result.occupied_until) === "2026-12-02T13:30:00.000Z",
    `obteve ${iso(result.occupied_until)}`,
  );
}

console.log("\n[expiração]");
{
  await db.query(
    `update public.bookings set expires_at = now() - interval '1 minute' where id = $1`,
    [booking1.id],
  );
  const result = await createBooking(
    customerDClient,
    "prov-a",
    serviceA1,
    D1_09,
    `key-${uuid()}`,
    "Pós-expiração",
  );
  check("reserva vencida foi expirada e o slot liberado", result.id !== booking1.id);

  const old = (
    await db.query(`select status from public.bookings where id = $1`, [booking1.id])
  ).rows[0];
  check("histórico antigo marcado como expirado", old.status === "expired");

  const event = (
    await db.query(
      `select 1 from public.booking_events where booking_id = $1 and event_type = 'booking.expired'`,
      [booking1.id],
    )
  ).rows;
  check("evento de expiração registrado", event.length === 1);
}

console.log("\n[transições]");
{
  const fresh = await createBooking(
    customerCClient,
    "prov-a",
    serviceA1,
    D3_09,
    `key-${uuid()}`,
    "Transições",
  );

  const proof = (
    await customerCClient.query(
      `select * from public.transition_booking($1, 'proof_received')`,
      [fresh.id],
    )
  ).rows[0];
  check("comprovante leva a pending_review", proof.status === "pending_review");

  await expectError(
    "cliente não pode aprovar o próprio pagamento",
    () =>
      customerCClient.query(
        `select * from public.transition_booking($1, 'payment_approved')`,
        [fresh.id],
      ),
    "forbidden",
  );

  const confirmed = (
    await ownerAClient.query(
      `select * from public.transition_booking($1, 'payment_approved')`,
      [fresh.id],
    )
  ).rows[0];
  check(
    "prestador confirma e limpa expiração",
    confirmed.status === "confirmed" && confirmed.expires_at === null,
  );

  const late = await createBooking(
    customerCClient,
    "prov-a",
    serviceA1,
    D3_1045,
    `key-${uuid()}`,
    "Tardio",
  );
  await customerCClient.query(
    `select * from public.transition_booking($1, 'proof_received')`,
    [late.id],
  );
  await db.query(
    `update public.bookings set expires_at = now() - interval '1 minute' where id = $1`,
    [late.id],
  );
  const lateResult = (
    await ownerAClient.query(
      `select * from public.transition_booking($1, 'payment_approved')`,
      [late.id],
    )
  ).rows[0];
  check(
    "aprovação tardia expira a reserva em vez de confirmar",
    lateResult.status === "expired",
  );
  const lateRow = (
    await db.query(`select status from public.bookings where id = $1`, [late.id])
  ).rows[0];
  check("expiração tardia foi persistida", lateRow.status === "expired");
}

console.log("\n[múltiplos serviços]");
{
  const anon = await asRole("anon");
  const D4_09 = "2026-12-04T12:00:00.000Z";
  const D4_10 = "2026-12-04T13:00:00.000Z";
  const D4_11 = "2026-12-04T14:00:00.000Z";
  const D4_1430 = "2026-12-04T14:30:00.000Z";
  const dayWindow = ["2026-12-04T00:00:00Z", "2026-12-05T00:00:00Z"];

  const scheduleResult = await anon.query(
    `select public.get_provider_schedule('prov-a', $1::uuid[], '2026-12-04', $2, $3) as schedule`,
    [[serviceA1, serviceA2], ...dayWindow],
  );
  const schedule = scheduleResult.rows[0].schedule;
  check(
    " agenda agregada expõe duração e intervalo do banco",
    schedule?.timing?.durationMinutes === 90 && schedule?.timing?.bufferMinutes === 0,
    JSON.stringify(schedule?.timing),
  );
  check(
    " totais agregados vêm dos serviços persistidos",
    schedule?.totals?.priceCents === 12000 &&
      schedule?.totals?.depositCents === 2000 &&
      schedule?.totals?.occupiedMinutes === 90 && schedule?.totals?.bufferMinutes === 0,
    JSON.stringify(schedule?.totals),
  );
  check(
    " agenda devolve os serviços na ordem escolhida",
    JSON.stringify((schedule?.services ?? []).map((item) => item.id)) ===
      JSON.stringify([serviceA1, serviceA2]),
  );

  const legacySchedule = (
    await anon.query(
      `select public.get_provider_schedule('prov-a', $1::uuid, '2026-12-04', $2, $3) as schedule`,
      [serviceA1, ...dayWindow],
    )
  ).rows[0].schedule;
  check(
    " assinatura legada da agenda continua com um serviço",
    legacySchedule?.timing?.durationMinutes === 60 &&
      legacySchedule?.totals?.priceCents === 8000,
  );

  const mixedSchedule = (
    await anon.query(
      `select public.get_provider_schedule('prov-a', $1::uuid[], '2026-12-04', $2, $3) as schedule`,
      [[serviceA1, serviceB1], ...dayWindow],
    )
  ).rows[0].schedule;
  check("agenda mista entre negócios retorna nulo", mixedSchedule === null);
  await anon.end();

  const combo = await createBookingMulti(
    customerCClient,
    "prov-a",
    [serviceA1, serviceA2],
    D4_09,
    `combo-${uuid()}`,
    "Combo",
  );
  check(
    " reserva combinada usa fim agregado e intervalo do último serviço",
    iso(combo.ends_at) === "2026-12-04T13:30:00.000Z" &&
      iso(combo.occupied_until) === "2026-12-04T13:30:00.000Z",
    `${iso(combo.ends_at)} / ${iso(combo.occupied_until)}`,
  );
  check(
    " snapshots agregados refletem o conjunto",
    combo.duration_minutes_snapshot === 90 &&
      combo.price_cents_snapshot === 12000 &&
      combo.deposit_cents_snapshot === 2000 &&
      combo.buffer_minutes_snapshot === 0,
  );
  check("service_id permanece como primeiro serviço", combo.service_id === serviceA1);

  const comboServices = (
    await db.query(
      `select service_id, position, duration_minutes_snapshot, price_cents_snapshot
         from public.booking_services where booking_id = $1 order by position`,
      [combo.id],
    )
  ).rows;
  check(
    " cada serviço tem snapshot próprio e posição",
    comboServices.length === 2 &&
      comboServices[0].service_id === serviceA1 &&
      comboServices[0].position === 0 &&
      comboServices[0].duration_minutes_snapshot === 60 &&
      comboServices[1].service_id === serviceA2 &&
      comboServices[1].position === 1 &&
      comboServices[1].duration_minutes_snapshot === 30,
    JSON.stringify(comboServices),
  );

  await expectError(
    " serviço único que caberia sozinho conflita com o intervalo combinado",
    () =>
      createBooking(customerDClient, "prov-a", serviceA2, D4_10, `combo-conflict-${uuid()}`),
    "slot_unavailable",
  );
  await expectError(
    " combo que não cabe no expediente é recusado",
    () =>
      createBookingMulti(
        customerDClient,
        "prov-a",
        [serviceA1, serviceA2],
        D4_1430,
        `combo-hours-${uuid()}`,
      ),
    "outside_working_hours",
  );
  await expectError(
    " serviços de outro prestador são recusados",
    () =>
      createBookingMulti(
        customerDClient,
        "prov-a",
        [serviceA1, serviceB1],
        D4_09,
        `combo-tenant-${uuid()}`,
      ),
    "service_not_available",
  );
  await expectError(
    " serviços duplicados são recusados",
    () =>
      createBookingMulti(
        customerDClient,
        "prov-a",
        [serviceA1, serviceA1],
        D4_09,
        `combo-duplicate-${uuid()}`,
      ),
    "service_not_available",
  );

  const inactiveService = (
    await db.query(
      `insert into public.services
         (provider_id, name, duration_minutes, price_cents, is_active)
       values ($1, 'Inativo', 30, 1000, false) returning id`,
      [providerA],
    )
  ).rows[0].id;
  await expectError(
    " serviço inativo não entra no combo",
    () =>
      createBookingMulti(
        customerDClient,
        "prov-a",
        [serviceA1, inactiveService],
        D4_09,
        `combo-inactive-${uuid()}`,
      ),
    "service_not_available",
  );

  const legacyAfterMigration = await createBooking(
    customerDClient,
    "prov-a",
    serviceA2,
    D4_11,
    `legacy-${uuid()}`,
  );
  const legacyRows = (
    await db.query(
      `select count(*)::int as total from public.booking_services where booking_id = $1`,
      [legacyAfterMigration.id],
    )
  ).rows[0].total;
  check("reserva antiga de serviço único continua funcionando", legacyRows === 1);
  const realBackfill = (
    await db.query(
      `select service_id, position, service_name_snapshot, price_cents_snapshot
         from public.booking_services where booking_id = $1`,
      [legacyBackfillBookingId],
    )
  ).rows;
  check(
    "backfill real preserva o snapshot histórico (4500, não 5000)",
    realBackfill.length === 1 &&
      realBackfill[0].service_id === legacyBackfillServiceId &&
      realBackfill[0].position === 0 &&
      realBackfill[0].service_name_snapshot === "Serviço legado" &&
      realBackfill[0].price_cents_snapshot === 4500,
    JSON.stringify(realBackfill),
  );

  const serviceB2 = (
    await db.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents, buffer_minutes)
       values ($1, 'Serviço B 2', 30, 3000, 0) returning id`,
      [providerB],
    )
  ).rows[0].id;
  await db.query(
    `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at)
     values ($1, 5, '09:00', '12:00')`,
    [providerB],
  );

  const comboAttempts = await Promise.allSettled(
    customers.map(async (uid, index) => {
      const client = await asRole("authenticated", uid);
      try {
        return await createBookingMulti(
          client,
          "prov-b",
          [serviceB1, serviceB2],
          D4_09,
          `race-combo-${uuid()}`,
          `Concorrente combo ${index}`,
        );
      } finally {
        await client.end();
      }
    }),
  );
  const comboWinners = comboAttempts.filter((attempt) => attempt.status === "fulfilled");
  const comboLosers = comboAttempts.filter(
    (attempt) =>
      attempt.status === "rejected" &&
      String(attempt.reason?.message).includes("slot_unavailable"),
  );
  check(
    "apenas uma reserva combinada vence a concorrência",
    comboWinners.length === 1,
    `obteve ${comboWinners.length}`,
  );
  check(
    "demais combos concorrentes recebem slot_unavailable",
    comboLosers.length === customers.length - 1,
    `obteve ${comboLosers.length}`,
  );

  if (comboWinners.length === 1) {
    const winnerId = comboWinners[0].value.id;
    const winnerServices = (
      await db.query(
        `select count(*)::int as total from public.booking_services where booking_id = $1`,
        [winnerId],
      )
    ).rows[0].total;
    check("reserva vencedora guarda os dois serviços", winnerServices === 2);

    const outsiderRows = await customerCClient.query(
      `select 1 from public.booking_services where booking_id = $1`,
      [winnerId],
    );
    check("cliente de outro negócio não lê os serviços da reserva", outsiderRows.rows.length === 0);

    const otherProviderRows = await ownerAClient.query(
      `select 1 from public.booking_services where booking_id = $1`,
      [winnerId],
    );
    check("prestador A não lê serviços da reserva de B", otherProviderRows.rows.length === 0);

    const ownerRows = await ownerBClient.query(
      `select 1 from public.booking_services where booking_id = $1`,
      [winnerId],
    );
    check("dono da reserva lê os serviços", ownerRows.rows.length === 2);

    const directInsert = await customerCClient
      .query(
        `insert into public.booking_services
           (booking_id, provider_id, service_id, position, service_name_snapshot,
            duration_minutes_snapshot, price_cents_snapshot, deposit_cents_snapshot,
            buffer_minutes_snapshot)
         values ($1, $2, $3, 9, 'Invasor', 30, 100, 0, 0)`,
        [winnerId, providerB, serviceB1],
      )
      .then(() => true)
      .catch(() => false);
    check("cliente não insere diretamente em booking_services", directInsert === false);
  }
}

console.log("\n[resolução de overload em notação nomeada (PostgREST)]");
{
  const anon = await asRole("anon");
  const dayWindow = ["2026-12-04T00:00:00Z", "2026-12-05T00:00:00Z"];

  // O PostgREST resolve sobrecargas por nome de argumento, não só por tipo.
  const namedScheduleSingle = (
    await anon.query(
      `select public.get_provider_schedule(
         p_provider_slug => 'prov-a',
         p_service_id => $1::uuid,
         p_date => '2026-12-04'::date,
         p_from => $2::timestamptz,
         p_to => $3::timestamptz
       ) as schedule`,
      [serviceA1, ...dayWindow],
    )
  ).rows[0].schedule;
  const namedScheduleMany = (
    await anon.query(
      `select public.get_provider_schedule(
         p_provider_slug => 'prov-a',
         p_service_ids => $1::uuid[],
         p_date => '2026-12-04'::date,
         p_from => $2::timestamptz,
         p_to => $3::timestamptz
       ) as schedule`,
      [[serviceA1, serviceA2], ...dayWindow],
    )
  ).rows[0].schedule;

  check(
    " p_service_id nomeado cai na assinatura de um serviço",
    namedScheduleSingle?.timing?.durationMinutes === 60 &&
      namedScheduleSingle?.services?.length === 1,
    JSON.stringify(namedScheduleSingle?.timing),
  );
  check(
    " p_service_ids nomeado cai na assinatura agregada",
    namedScheduleMany?.timing?.durationMinutes === 90 &&
      namedScheduleMany?.services?.length === 2,
    JSON.stringify(namedScheduleMany?.timing),
  );
  await anon.end();

  const namedB2 = (
    await db.query(
      `select id from public.services where provider_id = $1 and name = 'Serviço B 2'`,
      [providerB],
    )
  ).rows[0].id;

  const namedCustomerId = uuid();
  await db.query(`insert into auth.users (id) values ($1)`, [namedCustomerId]);
  const namedCustomer = await asRole("authenticated", namedCustomerId);

  // Sábado (12/05) livre no prestador B para as duas criações nomeadas.
  await db.query(
    `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at)
     values ($1, 6, '09:00', '12:00')`,
    [providerB],
  );

  const namedLegacy = (
    await namedCustomer.query(
      `select * from public.create_booking(
         p_provider_slug => $1,
         p_service_id => $2::uuid,
         p_starts_at => $3::timestamptz,
         p_customer_name => $4,
         p_customer_phone => '11999999999',
         p_idempotency_key => $5
       )`,
      ["prov-b", serviceB1, "2026-12-05T12:00:00.000Z", "Nomeado um", `named-legacy-${uuid()}`],
    )
  ).rows[0];
  const namedLegacyRows = (
    await db.query(
      `select count(*)::int as total from public.booking_services where booking_id = $1`,
      [namedLegacy.id],
    )
  ).rows[0].total;
  check(
    " wrapper legado nomeado responde como antes (um serviço)",
    namedLegacy.status === "pending_payment" &&
      namedLegacy.service_id === serviceB1 &&
      namedLegacy.duration_minutes_snapshot === 60 &&
      namedLegacy.price_cents_snapshot === 5000 &&
      namedLegacy.buffer_minutes_snapshot === 0 &&
      namedLegacyRows === 1,
    JSON.stringify({ status: namedLegacy.status, rows: namedLegacyRows }),
  );

  const namedArray = (
    await namedCustomer.query(
      `select * from public.create_booking(
         p_provider_slug => $1,
         p_service_ids => $2::uuid[],
         p_starts_at => $3::timestamptz,
         p_customer_name => $4,
         p_customer_phone => '11999999999',
         p_idempotency_key => $5
       )`,
      ["prov-b", [serviceB1, namedB2], "2026-12-05T13:00:00.000Z", "Nomeado dois", `named-array-${uuid()}`],
    )
  ).rows[0];
  const namedArrayRows = (
    await db.query(
      `select count(*)::int as total from public.booking_services where booking_id = $1`,
      [namedArray.id],
    )
  ).rows[0].total;
  check(
    " assinatura array nomeada cria reserva combinada",
    namedArray.status === "pending_payment" &&
      namedArray.duration_minutes_snapshot === 90 &&
      namedArray.price_cents_snapshot === 8000 &&
      iso(namedArray.occupied_until) === "2026-12-05T14:30:00.000Z" &&
      namedArrayRows === 2,
    JSON.stringify({ occupied: iso(namedArray.occupied_until), rows: namedArrayRows }),
  );

  const overloads = (
    await db.query(`
      select p.proname as name, pg_get_function_identity_arguments(p.oid) as args
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('create_booking', 'get_provider_schedule')
         and p.prosecdef
    `)
  ).rows;
  const hasBothOverloads = ["create_booking", "get_provider_schedule"].every((name) => {
    const args = overloads.filter((row) => row.name === name).map((row) => row.args);
    return (
      args.some((item) => item.includes("uuid[]")) &&
      args.some((item) => item.includes("uuid") && !item.includes("uuid[]"))
    );
  });
  check(
    "quatro assinaturas (legada + array) continuam publicadas",
    overloads.length === 4 && hasBothOverloads,
    JSON.stringify(overloads),
  );
}

console.log("\n[casos de borda e truncamento]");
{
  const anon = await asRole("anon");
  const dayWindow = ["2026-12-04T00:00:00Z", "2026-12-05T00:00:00Z"];
  const slot = "2026-12-04T13:45:00.000Z";

  const scheduleIds = (ids) =>
    anon.query(
      `select public.get_provider_schedule(
         p_provider_slug => 'prov-a',
         p_service_ids => $1::uuid[],
         p_date => '2026-12-04'::date,
         p_from => $2::timestamptz,
         p_to => $3::timestamptz
       ) as schedule`,
      [ids, ...dayWindow],
    );

  check(" array vazio não produz agenda", (await scheduleIds([])).rows[0].schedule === null);
  check(
    " array com NULL não produz agenda",
    (await scheduleIds([serviceA1, null])).rows[0].schedule === null,
  );
  check(
    " array com duplicatas não produz agenda",
    (await scheduleIds([serviceA1, serviceA1])).rows[0].schedule === null,
  );

  await db.query(
    `insert into public.services (provider_id, name, duration_minutes, price_cents)
     select $1, 'Extra ' || i, 30, 1000 from generate_series(1, 20) as i`,
    [providerA],
  );
  const manyIds = (
    await db.query(
      `select id from public.services
        where provider_id = $1 and is_active
        order by created_at desc limit 21`,
      [providerA],
    )
  ).rows.map((row) => row.id);
  check(" 21 serviços distintos não produzem agenda", (await scheduleIds(manyIds)).rows[0].schedule === null);
  await expectError(
    " 21 serviços são recusados na criação",
    () => createBookingMulti(customerDClient, "prov-a", manyIds, slot, `many-${uuid()}`),
    "service_not_available",
  );
  await expectError(
    " array vazio é recusado na criação",
    () => createBookingMulti(customerDClient, "prov-a", [], slot, `empty-${uuid()}`),
    "service_not_available",
  );
  await expectError(
    " array com NULL é recusado na criação",
    () => createBookingMulti(customerDClient, "prov-a", [serviceA1, null], slot, `null-${uuid()}`),
    "service_not_available",
  );

  const inactiveId = (
    await db.query(
      `insert into public.services
         (provider_id, name, duration_minutes, price_cents, is_active)
       values ($1, 'Inativo borda', 30, 1000, false) returning id`,
      [providerA],
    )
  ).rows[0].id;
  check(
    " serviço inativo não produz agenda",
    (await scheduleIds([serviceA1, inactiveId])).rows[0].schedule === null,
  );
  await expectError(
    " serviço inativo é recusado na criação",
    () =>
      createBookingMulti(customerDClient, "prov-a", [serviceA1, inactiveId], slot, `inactive-edge-${uuid()}`),
    "service_not_available",
  );
  check(
    " mistura de negócios não produz agenda",
    (await scheduleIds([serviceA1, serviceB1])).rows[0].schedule === null,
  );
  await expectError(
    " mistura de negócios é recusada na criação",
    () =>
      createBookingMulti(customerDClient, "prov-a", [serviceA1, serviceB1], slot, `mixed-edge-${uuid()}`),
    "service_not_available",
  );
  await anon.end();

  const firstLong = "A".repeat(120);
  const secondLong = "B".repeat(120);
  const longA = (
    await db.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents)
       values ($1, $2, 30, 1000) returning id`,
      [providerB, firstLong],
    )
  ).rows[0].id;
  const longB = (
    await db.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents)
       values ($1, $2, 30, 1000) returning id`,
      [providerB, secondLong],
    )
  ).rows[0].id;
  const longBooking = await createBookingMulti(
    customerDClient,
    "prov-b",
    [longA, longB],
    "2026-12-04T13:45:00.000Z",
    `long-${uuid()}`,
    "Nome longo",
  );
  check(
    " nome combinado é truncado em 180 caracteres",
    longBooking.service_name_snapshot.length === 180 &&
      longBooking.service_name_snapshot.startsWith(`${firstLong} + `) &&
      longBooking.service_name_snapshot.includes("B".repeat(40)),
    `tamanho=${longBooking.service_name_snapshot.length}`,
  );
  const longNotifications = (
    await db.query(
      `select title, body from public.notifications
        where booking_id = $1 order by recipient_id`,
      [longBooking.id],
    )
  ).rows;
  check(
    " notificação continua legível após o truncamento",
    longNotifications.length === 2 &&
      longNotifications.every(
        (row) =>
          row.body.includes("A".repeat(40)) &&
          row.body.includes("B".repeat(40)) &&
          row.body.length > 150,
      ),
    `notificações=${longNotifications.length}`,
  );

  // Decisão do responsável: soma das durações + intervalo APENAS do último
  // serviço da seleção (ordem de seleção).
  const timedA = (
    await db.query(
      `insert into public.services
         (provider_id, name, duration_minutes, price_cents, buffer_minutes)
       values ($1, 'Intervalo A', 30, 2000, 15) returning id`,
      [providerB],
    )
  ).rows[0].id;
  const timedB = (
    await db.query(
      `insert into public.services
         (provider_id, name, duration_minutes, price_cents, buffer_minutes)
       values ($1, 'Intervalo B', 45, 3000, 20) returning id`,
      [providerB],
    )
  ).rows[0].id;
  const timed = (
    await db.query(
      `select public.booking_service_totals($1::uuid, $2::uuid[]) as totals`,
      [providerB, [timedA, timedB]],
    )
  ).rows[0].totals;
  check(
    " intervalo apenas do último serviço (30+15 e 45+20 ⇒ 75 + 20 = 95)",
    timed.durationMinutes === 75 &&
      timed.bufferMinutes === 20 &&
      timed.occupiedMinutes === 95 &&
      timed.priceCents === 5000,
    JSON.stringify(timed),
  );

  const shortA = (
    await db.query(
      `insert into public.services
         (provider_id, name, duration_minutes, price_cents, buffer_minutes)
       values ($1, 'Intervalo curto A', 30, 1000, 10) returning id`,
      [providerB],
    )
  ).rows[0].id;
  const shortB = (
    await db.query(
      `insert into public.services
         (provider_id, name, duration_minutes, price_cents, buffer_minutes)
       values ($1, 'Intervalo curto B', 45, 1000, 5) returning id`,
      [providerB],
    )
  ).rows[0].id;
  const shortTotals = (
    await db.query(
      `select public.booking_service_totals($1::uuid, $2::uuid[]) as totals`,
      [providerB, [shortA, shortB]],
    )
  ).rows[0].totals;
  check(
    " intervalo apenas do último serviço (30+10 e 45+5 ⇒ 75 + 5 = 80)",
    shortTotals.durationMinutes === 75 &&
      shortTotals.bufferMinutes === 5 &&
      shortTotals.occupiedMinutes === 80,
    JSON.stringify(shortTotals),
  );
}

console.log("\n[idempotência]");
{
  const key = `idem-${uuid()}`;
  const first = await createBooking(
    customerCClient,
    "prov-a",
    serviceA2,
    D3_11,
    key,
    "Idem",
  );
  const second = await createBooking(
    customerCClient,
    "prov-a",
    serviceA2,
    D3_11,
    key,
    "Idem",
  );
  check("mesma chave devolve a mesma reserva", first.id === second.id);

  const count = (
    await db.query(`select count(*)::int as total from public.bookings where id = $1`, [
      first.id,
    ])
  ).rows[0];
  check("não duplicou reserva", count.total === 1);
}

console.log("\n[isolamento multi-tenant]");
{
  const aViewsB = await ownerAClient.query(
    `select * from public.bookings where provider_id = $1`,
    [providerB],
  );
  check("prestador A não lê reservas de B", aViewsB.rows.length === 0);

  const cViewsB = await customerCClient.query(
    `select * from public.bookings where provider_id = $1`,
    [providerB],
  );
  check("cliente não lê reservas de outro prestador", cViewsB.rows.length === 0);

  const aSeesHidden = await ownerAClient.query(
    `select * from public.providers where id = $1`,
    [providerBHidden],
  );
  check("prestador não publicado é invisível para outros", aSeesHidden.rows.length === 0);

  const anon = await asRole("anon");
  const anonBookings = await anon.query(`select * from public.bookings`);
  check("anon não lê reservas", anonBookings.rows.length === 0);
  await anon.end();

  const bBooking = await createBooking(
    ownerBClient,
    "prov-b",
    serviceB1,
    D1_09,
    `b-${uuid()}`,
    "Cliente B",
  );
  await expectError(
    "prestador A não transiciona reserva de B",
    () =>
      ownerAClient.query(`select * from public.transition_booking($1, 'cancel')`, [
        bBooking.id,
      ]),
    "forbidden",
  );
}

console.log("\n[expiração em lote]");
{
  const result = await db.query(`select public.expire_stale_bookings() as total`);
  check("função de expiração em lote executa", Number(result.rows[0].total) >= 0);
}

console.log("\n[notificações]");
{
  const ownerN = uuid();
  const customerN = uuid();
  const outsiderN = uuid();
  for (const id of [ownerN, customerN, outsiderN]) {
    await db.query("insert into auth.users (id) values ($1)", [id]);
  }

  const providerN = (
    await db.query(
      `insert into public.providers (owner_id, slug, display_name, timezone, is_published, booking_hold_minutes)
       values ($1, 'notif-a', 'Notif A', 'America/Sao_Paulo', true, 30)
       returning id`,
      [ownerN],
    )
  ).rows[0].id;
  const serviceN = (
    await db.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents, deposit_cents, buffer_minutes)
       values ($1, 'Serviço Notif', 60, 8000, 2000, 0) returning id`,
      [providerN],
    )
  ).rows[0].id;
  await db.query(
    `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at)
     values ($1, 2, '09:00', '12:00')`,
    [providerN],
  );

  const ownerNClient = await asRole("authenticated", ownerN);
  const customerNClient = await asRole("authenticated", customerN);
  const outsiderNClient = await asRole("authenticated", outsiderN);
  const anonN = await asRole("anon");

  const nBooking = await createBooking(
    customerNClient,
    "notif-a",
    serviceN,
    "2026-12-01T12:00:00.000Z",
    `notif-${uuid()}`,
    "Cliente Notif",
  );

  const created = (
    await db.query(
      `select recipient_id, kind from public.notifications where booking_id = $1 order by recipient_id`,
      [nBooking.id],
    )
  ).rows;
  check(
    "criação notifica cliente e prestador",
    created.length === 2 &&
      created.some((row) => row.recipient_id === customerN && row.kind === "booking_created") &&
      created.some((row) => row.recipient_id === ownerN && row.kind === "booking_created"),
    `obteve ${created.length}`,
  );
  check(
    "terceiro não recebe notificação da reserva",
    created.every((row) => row.recipient_id !== outsiderN),
  );

  await customerNClient.query(
    `select * from public.transition_booking($1, 'proof_received')`,
    [nBooking.id],
  );
  const proof = (
    await db.query(
      `select recipient_id from public.notifications where booking_id = $1 and kind = 'booking_proof_received'`,
      [nBooking.id],
    )
  ).rows;
  check(
    "comprovante notifica apenas o prestador",
    proof.length === 1 && proof[0].recipient_id === ownerN,
    `obteve ${proof.length}`,
  );
  check(
    "transição persiste mesmo com trigger de notificação",
    (
      await db.query(`select status from public.bookings where id = $1`, [nBooking.id])
    ).rows[0].status === "pending_review",
  );

  await ownerNClient.query(
    `select * from public.transition_booking($1, 'payment_approved')`,
    [nBooking.id],
  );
  const confirmed = (
    await db.query(
      `select recipient_id from public.notifications where booking_id = $1 and kind = 'booking_confirmed'`,
      [nBooking.id],
    )
  ).rows;
  check(
    "confirmação notifica cliente e prestador",
    confirmed.length === 2,
    `obteve ${confirmed.length}`,
  );

  const ownRows = (await customerNClient.query(`select * from public.notifications`)).rows;
  check(
    "cliente só lê as próprias notificações",
    ownRows.length > 0 && ownRows.every((row) => row.recipient_id === customerN),
  );
  const anonDenied = await anonN
    .query(`select * from public.notifications`)
    .then(() => false)
    .catch(() => true);
  check("anon não lê notificações", anonDenied);

  const insertDenied = await customerNClient
    .query(
      `insert into public.notifications (recipient_id, kind, title, body, event_key)
       values ($1, 'booking_created', 'x', 'y', 'forjado')`,
      [ownerN],
    )
    .then(() => false)
    .catch(() => true);
  check("cliente não consegue forjar notificação", insertDenied);

  const target = (
    await customerNClient.query(
      `select * from public.notifications where recipient_id = $1 limit 1`,
      [customerN],
    )
  ).rows[0];
  const marked = (
    await customerNClient.query(`select * from public.mark_notification_read($1)`, [
      target.id,
    ])
  ).rows[0];
  check(
    "marcar como lida grava read_at",
    marked.is_read === true && Boolean(marked.read_at),
  );

  const foreignDenied = await outsiderNClient
    .query(`select * from public.mark_notification_read($1)`, [target.id])
    .then(() => false)
    .catch(() => true);
  check("terceiro não marca notificação alheia", foreignDenied);

  await customerNClient.query(`select public.mark_all_notifications_read()`);
  const unread = (
    await db.query(
      `select count(*)::int as total from public.notifications where recipient_id = $1 and not is_read`,
      [customerN],
    )
  ).rows[0].total;
  check("marcar todas zera não lidas do cliente", unread === 0, `obteve ${unread}`);

  await db.query(
    `update public.bookings set starts_at = now() + interval '2 hours' where id = $1`,
    [nBooking.id],
  );
  const serviceRole = await asRole("service_role");
  const first = (
    await serviceRole.query(`select public.create_booking_reminders(24) as total`)
  ).rows[0].total;
  const second = (
    await serviceRole.query(`select public.create_booking_reminders(24) as total`)
  ).rows[0].total;
  check("lembretes criados para a reserva confirmada", Number(first) >= 1, `obteve ${first}`);
  check("lembretes são idempotentes no mesmo dia", Number(second) === 0, `obteve ${second}`);
  const reminders = (
    await db.query(
      `select recipient_id from public.notifications where booking_id = $1 and kind = 'booking_reminder'`,
      [nBooking.id],
    )
  ).rows;
  check(
    "lembrete alcança cliente e prestador",
    reminders.length === 2,
    `obteve ${reminders.length}`,
  );

  const expiredBooking = await createBooking(
    customerNClient,
    "notif-a",
    serviceN,
    "2026-12-08T12:00:00.000Z",
    `notif-exp-${uuid()}`,
    "Cliente Expirado",
  );
  await db.query(
    `update public.bookings set expires_at = now() - interval '1 minute' where id = $1`,
    [expiredBooking.id],
  );
  await serviceRole.query(`select public.expire_stale_bookings()`);
  const expired = (
    await db.query(
      `select recipient_id from public.notifications where booking_id = $1 and kind = 'booking_expired'`,
      [expiredBooking.id],
    )
  ).rows;
  check(
    "expiração notifica cliente e prestador",
    expired.length === 2 &&
      expired.some((row) => row.recipient_id === customerN) &&
      expired.some((row) => row.recipient_id === ownerN),
    `obteve ${expired.length}`,
  );

  await ownerNClient.end();
  await customerNClient.end();
  await outsiderNClient.end();
  await anonN.end();
  await serviceRole.end();
}

console.log("\n[documentos legais e aceite versionado]");
{
  const anonLegal = await asRole("anon");
  const visibleDocuments = await anonLegal.query(
    `select document_key, version, status, requires_acceptance
       from public.legal_documents
      order by document_key`,
  );
  check(
    "metadados das quatro minutas são públicos",
    visibleDocuments.rows.length === 4,
    `obteve ${visibleDocuments.rows.length}`,
  );
  check(
    "minutas não exigem aceite",
    visibleDocuments.rows.every(
      (row) => row.status === "draft" && row.requires_acceptance === false,
    ),
  );
  await anonLegal.end();

  const initialStatus = await customerCClient.query(
    `select public.has_current_legal_acceptances() as current`,
  );
  check(
    "sem documento publicado não existe bloqueio de aceite",
    initialStatus.rows[0].current === true,
  );

  const publishedTerms = (
    await db.query(`
      update public.legal_documents
         set status = 'published',
             requires_acceptance = true,
             published_at = now() - interval '2 minutes',
             effective_at = now() - interval '1 minute'
       where document_key = 'terms' and version = '0.1-draft'
       returning id, document_key, version, content_sha256
    `)
  ).rows[0];

  const pending = await customerCClient.query(
    `select * from public.get_pending_legal_documents()`,
  );
  check(
    "documento material publicado fica pendente",
    pending.rows.length === 1 && pending.rows[0].document_key === "terms",
  );
  check(
    "aceite atual passa a ser obrigatório",
    (
      await customerCClient.query(
        `select public.has_current_legal_acceptances() as current`,
      )
    ).rows[0].current === false,
  );

  await expectError(
    "hash forjado não pode ser aceito",
    () => customerCClient.query(
      `select public.record_legal_acceptances($1::jsonb)`,
      [JSON.stringify([{
        documentKey: publishedTerms.document_key,
        version: publishedTerms.version,
        contentHash: "0".repeat(64),
      }])],
    ),
    "legal_document_not_current",
  );

  await expectError(
    "payload duplicado não pode simular seleção completa",
    () => customerCClient.query(
      `select public.record_legal_acceptances($1::jsonb)`,
      [JSON.stringify([
        {
          documentKey: publishedTerms.document_key,
          version: publishedTerms.version,
          contentHash: publishedTerms.content_sha256,
        },
        {
          documentKey: publishedTerms.document_key,
          version: publishedTerms.version,
          contentHash: publishedTerms.content_sha256,
        },
      ])],
    ),
    "legal_acceptance_set_mismatch",
  );

  const exactReceipt = JSON.stringify([{
    documentKey: publishedTerms.document_key,
    version: publishedTerms.version,
    contentHash: publishedTerms.content_sha256,
  }]);
  const accepted = await customerCClient.query(
    `select public.record_legal_acceptances($1::jsonb) as count`,
    [exactReceipt],
  );
  check("aceite exato é registrado", accepted.rows[0].count === 1);
  check(
    "repetir aceite é idempotente",
    (
      await customerCClient.query(
        `select public.record_legal_acceptances($1::jsonb) as count`,
        [exactReceipt],
      )
    ).rows[0].count === 0,
  );
  check(
    "usuário que aceitou fica em dia",
    (
      await customerCClient.query(
        `select public.has_current_legal_acceptances() as current`,
      )
    ).rows[0].current === true,
  );
  check(
    "outro usuário continua pendente",
    (
      await customerDClient.query(
        `select public.has_current_legal_acceptances() as current`,
      )
    ).rows[0].current === false,
  );
  check(
    "RLS oculta recibo de outro usuário",
    (
      await customerDClient.query(
        `select count(*)::integer as count from public.legal_acceptances`,
      )
    ).rows[0].count === 0,
  );

  const directInsertWorked = await customerDClient
    .query(
      `insert into public.legal_acceptances (
         user_id, document_id, document_key, document_version, content_sha256
       ) values ($1, $2, $3, $4, $5)`,
      [
        customerD,
        publishedTerms.id,
        publishedTerms.document_key,
        publishedTerms.version,
        publishedTerms.content_sha256,
      ],
    )
    .then(() => true)
    .catch(() => false);
  check("authenticated não insere recibo diretamente", directInsertWorked === false);

  await db.query("begin");
  let nextTerms;
  try {
    await db.query(`
      update public.legal_documents
         set status = 'retired', retired_at = now()
       where id = $1
    `, [publishedTerms.id]);
    nextTerms = (
      await db.query(`
        insert into public.legal_documents (
          document_key,
          version,
          title,
          public_path,
          status,
          content_sha256,
          requires_acceptance,
          material_change_summary,
          published_at,
          effective_at
        ) values (
          'terms',
          '0.2-test',
          'Termos de Uso',
          '/termos',
          'published',
          $1,
          true,
          'Alteração material criada apenas pelo teste de integração.',
          now() - interval '2 minutes',
          now() - interval '1 minute'
        ) returning document_key, version, content_sha256
      `, ["a".repeat(64)])
    ).rows[0];
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }

  check(
    "nova versão material exige novo aceite",
    (
      await customerCClient.query(
        `select public.has_current_legal_acceptances() as current`,
      )
    ).rows[0].current === false,
  );
  await customerCClient.query(
    `select public.record_legal_acceptances($1::jsonb)`,
    [JSON.stringify([{
      documentKey: nextTerms.document_key,
      version: nextTerms.version,
      contentHash: nextTerms.content_sha256,
    }])],
  );
  check(
    "novo aceite regulariza a versão material",
    (
      await customerCClient.query(
        `select public.has_current_legal_acceptances() as current`,
      )
    ).rows[0].current === true,
  );

  await db.query(`
    update public.legal_documents
       set status = 'published',
           requires_acceptance = false,
           published_at = now() - interval '2 minutes',
           effective_at = now() - interval '1 minute'
     where document_key = 'privacy' and version = '0.1-draft'
  `);
  check(
    "versão informativa não material não força novo aceite",
    (
      await customerCClient.query(
        `select public.has_current_legal_acceptances() as current`,
      )
    ).rows[0].current === true,
  );
}

console.log("\n[segurança e RLS]");
{
  // 1. Toda tabela de negócio precisa ter RLS habilitada.
  const tables = (
    await db.query(`
      select c.relname as name, c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `)
  ).rows;
  const withoutRls = tables.filter((row) => !row.rls).map((row) => row.name);
  check(
    "todas as tabelas públicas têm RLS habilitada",
    withoutRls.length === 0,
    withoutRls.length ? `sem RLS: ${withoutRls.join(", ")}` : "",
  );

  // 2. Funções SECURITY DEFINER precisam fixar search_path (evita sequestro).
  const definer = (
    await db.query(`
      select p.proname as name, p.proconfig as config
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by p.proname
    `)
  ).rows;
  const unlocked = definer.filter(
    (row) => !(row.config ?? []).some((entry) => String(entry).startsWith("search_path=")),
  );
  check(
    "toda função SECURITY DEFINER fixa search_path",
    unlocked.length === 0,
    unlocked.length ? `sem search_path: ${unlocked.map((row) => row.name).join(", ")}` : "",
  );

  // 3. anon não pode escrever em nenhuma tabela; authenticated não escreve
  //    diretamente em tabelas controladas por RPC, trigger ou publicação legal.
  const businessTables = [
    "profiles",
    "providers",
    "services",
    "availability_rules",
    "availability_exceptions",
    "bookings",
    "booking_events",
    "notifications",
    "legal_documents",
    "legal_acceptances",
  ];
  const rpcOnlyTables = [
    "bookings",
    "booking_events",
    "notifications",
    "legal_documents",
    "legal_acceptances",
  ];
  const writePrivileges = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"];
  const anonWrites = [];
  const authenticatedWrites = [];
  for (const table of businessTables) {
    for (const privilege of writePrivileges) {
      if (await hasPrivilege("anon", table, privilege)) {
        anonWrites.push(`${table}.${privilege}`);
      }
      // UPDATE de notifications é permitido ao próprio destinatário (RPC/RLS);
      // INSERT/DELETE e escrita em reservas/eventos passam por RPC/trigger.
      const notificationUpdate = table === "notifications" && privilege === "UPDATE";
      if (
        rpcOnlyTables.includes(table) &&
        !notificationUpdate &&
        (await hasPrivilege("authenticated", table, privilege))
      ) {
        authenticatedWrites.push(`${table}.${privilege}`);
      }
    }
  }
  check(
    "anon não tem privilégios de escrita",
    anonWrites.length === 0,
    anonWrites.join(", "),
  );
  check(
    "authenticated não escreve diretamente em tabelas controladas",
    authenticatedWrites.length === 0,
    authenticatedWrites.join(", "),
  );

  // 4. RLS bloqueia escrita de outro estabelecimento (não só leitura).
  const crossTenantUpdate = await ownerAClient
    .query(`update public.providers set display_name = 'Invadido' where id = $1`, [
      providerB,
    ])
    .catch(() => ({ rowCount: -1 }));
  check(
    "prestador A não atualiza o negócio de B",
    crossTenantUpdate.rowCount === 0,
    `rowCount=${crossTenantUpdate.rowCount}`,
  );

  const crossTenantService = await ownerAClient
    .query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents)
       values ($1, 'Serviço invasor', 30, 1000)`,
      [providerB],
    )
    .then(() => true)
    .catch(() => false);
  check("prestador A não cria serviço em B", crossTenantService === false);

  // 5. Notificações: sem insert/delete direto para autenticados e RLS por destinatário.
  const notificationPolicies = (
    await db.query(`
      select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
      from pg_policy
      where polrelid = 'public.notifications'::regclass
      order by polname
    `)
  ).rows;
  const recipientScoped = notificationPolicies.filter((row) =>
    /auth\.uid\(\)/.test(row.using_expr ?? ""),
  );
  check(
    "políticas de notifications usam auth.uid()",
    notificationPolicies.length > 0 &&
      recipientScoped.length === notificationPolicies.length,
    notificationPolicies.map((row) => `${row.polname}:${row.using_expr}`).join(" | "),
  );

  // 6. A política de escrita não pode escapar do próprio destinatário.
  const withCheck = (
    await db.query(`
      select polname, pg_get_expr(polwithcheck, polrelid) as check_expr
      from pg_policy
      where polrelid = 'public.notifications'::regclass and polwithcheck is not null
    `)
  ).rows;
  check(
    "políticas de update de notifications têm with check",
    withCheck.length > 0 &&
      withCheck.every((row) => /auth\.uid\(\)/.test(row.check_expr ?? "")),
    withCheck.map((row) => `${row.polname}:${row.check_expr}`).join(" | "),
  );
}

} catch (error) {
  failed += 1;
  console.error("  FAIL erro não tratado no harness de booking", error);
} finally {
  // Sempre desliga o cluster, inclusive em falha: a porta 55432 precisa ficar
  // livre para a próxima execução de `npm run test:db`.
  await Promise.allSettled([...roleClients].map((client) => client.end()));
  if (db) await db.end().catch(() => undefined);
  if (admin) await admin.end().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
}

console.log(`\nresultado: ${passed} passaram, ${failed} falharam`);
process.exitCode = failed === 0 ? 0 : 1;
