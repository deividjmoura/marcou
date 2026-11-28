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
import { bootstrapStorageHarness } from "./storage-harness.mjs";

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
await rm(databaseDir, { recursive: true, force: true });

const postgres = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: PASSWORD,
  port: PORT,
  persistent: false,
  autoRehydrateSymlinks: true,
});

await postgres.initialise();
await postgres.start();

const admin = new Client({
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

const db = new Client({
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
    $;
`);
await bootstrapStorageHarness(db);

const migrations = [
  "supabase/migrations/202611150001_initial_schema.sql",
  "supabase/migrations/202611150002_booking_operations.sql",
  "supabase/migrations/202611150003_notifications.sql",
  "supabase/migrations/202611160001_provider_description.sql",
  "supabase/migrations/20261116035000_fix_booking_idempotency_authorization.sql",
  "supabase/migrations/202611230001_legal_documents_and_acceptances.sql",
  "supabase/migrations/20261125120000_booking_multiple_services.sql",
  "supabase/migrations/20261125130000_table_privileges_matrix.sql",
  "supabase/migrations/20261127000000_booking_transition_concurrency_lock.sql",
  "supabase/migrations/20261127000100_reminder_concurrency_lock.sql",
  "supabase/migrations/20261128000200_booking_definer_search_path.sql",
  "supabase/migrations/20261128000300_booking_counterparty_phone.sql",
  "supabase/migrations/20261128000400_service_images_storage.sql",
];

for (const file of migrations) {
  const sql = await readFile(file, "utf8");
  await db.query(sql);
  console.log(`aplicada: ${file}`);
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
    `select * from public.create_booking($1, $2::uuid, $3::timestamptz, $4, '11999999999', $5)`,
    [slug, serviceId, startsAt, name, key],
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
    `select public.get_provider_schedule('prov-a', $1::uuid, '2026-12-01'::date, $2::timestamptz, $3::timestamptz) as schedule`,
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
        `select public.get_provider_schedule('prov-b-hidden', $1::uuid, '2026-12-01'::date, $2::timestamptz, $3::timestamptz) as schedule`,
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
  const createExpirationFixture = async ({ status, expiresAt, startsAt }) => {
    const row = (
      await db.query(
        `insert into public.bookings (
          provider_id, customer_id, service_id, starts_at, ends_at, occupied_until,
          timezone, service_name_snapshot, duration_minutes_snapshot, price_cents_snapshot,
          deposit_cents_snapshot, buffer_minutes_snapshot, status, expires_at
        ) values (
          $1, $2, $3, $4::timestamptz, $4::timestamptz + interval '1 hour',
          $4::timestamptz + interval '1 hour', 'America/Sao_Paulo', 'Serviço 60',
          60, 8000, 2000, 0, $5::public.booking_status, $6::timestamptz
        ) returning id, status, expires_at`,
        [providerA, customers[0], serviceA1, startsAt, status, expiresAt],
      )
    ).rows[0];
    return row;
  };

  const eligiblePayment = await createExpirationFixture({
    status: "pending_payment",
    expiresAt: "2000-01-01T00:00:00.000Z",
    startsAt: "2030-01-01T10:00:00.000Z",
  });
  const eligibleReview = await createExpirationFixture({
    status: "pending_review",
    expiresAt: "2000-01-01T00:00:00.000Z",
    startsAt: "2030-01-02T10:00:00.000Z",
  });
  const futureHold = await createExpirationFixture({
    status: "pending_payment",
    expiresAt: "2999-01-01T00:00:00.000Z",
    startsAt: "2030-01-03T10:00:00.000Z",
  });
  const confirmedPastExpiry = await createExpirationFixture({
    status: "confirmed",
    expiresAt: "2000-01-01T00:00:00.000Z",
    startsAt: "2030-01-04T10:00:00.000Z",
  });
  const cancelledPastExpiry = await createExpirationFixture({
    status: "cancelled",
    expiresAt: "2000-01-01T00:00:00.000Z",
    startsAt: "2030-01-05T10:00:00.000Z",
  });

  const eligibleIds = [eligiblePayment.id, eligibleReview.id];
  const nonEligibleIds = [futureHold.id, confirmedPastExpiry.id, cancelledPastExpiry.id];
  const serviceRoleA = await asRole("service_role");
  const first = Number(
    (await serviceRoleA.query(`select public.expire_stale_bookings() as total`)).rows[0].total,
  );
  check("batch expira exatamente os holds vencidos", first === 2, `obteve ${first}`);

  const eligibleStatuses = (
    await db.query(`select id, status from public.bookings where id = any($1::uuid[])`, [eligibleIds])
  ).rows;
  check(
    "pending_payment e pending_review vencidos ficam expired",
    eligibleStatuses.length === 2 && eligibleStatuses.every((row) => row.status === "expired"),
    JSON.stringify(eligibleStatuses),
  );

  const nonEligibleStatuses = (
    await db.query(`select id, status from public.bookings where id = any($1::uuid[])`, [nonEligibleIds])
  ).rows;
  check(
    "holds futuros, confirmados e cancelados não são alterados",
    nonEligibleStatuses.length === 3 &&
      nonEligibleStatuses.some((row) => row.id === futureHold.id && row.status === "pending_payment") &&
      nonEligibleStatuses.some((row) => row.id === confirmedPastExpiry.id && row.status === "confirmed") &&
      nonEligibleStatuses.some((row) => row.id === cancelledPastExpiry.id && row.status === "cancelled"),
    JSON.stringify(nonEligibleStatuses),
  );

  const eventRows = (
    await db.query(
      `select booking_id, count(*)::int as total
         from public.booking_events
        where booking_id = any($1::uuid[]) and event_type = 'booking.expired'
        group by booking_id`,
      [eligibleIds],
    )
  ).rows;
  check(
    "cada reserva elegível recebe exatamente um evento booking.expired",
    eventRows.length === 2 && eventRows.every((row) => row.total === 1),
    JSON.stringify(eventRows),
  );

  const second = Number(
    (await serviceRoleA.query(`select public.expire_stale_bookings() as total`)).rows[0].total,
  );
  check("execução repetida não expira nem duplica eventos", second === 0, `obteve ${second}`);
  const eventCountAfterRetry = Number(
    (
      await db.query(
        `select count(*)::int as total from public.booking_events
          where booking_id = any($1::uuid[]) and event_type = 'booking.expired'`,
        [eligibleIds],
      )
    ).rows[0].total,
  );
  check("idempotência preserva total de eventos", eventCountAfterRetry === 2, `obteve ${eventCountAfterRetry}`);

  const concurrentFixture = await createExpirationFixture({
    status: "pending_payment",
    expiresAt: "2000-01-01T00:00:00.000Z",
    startsAt: "2030-01-06T10:00:00.000Z",
  });
  const concurrentClients = [await asRole("service_role"), await asRole("service_role")];
  const concurrentResults = await Promise.all(
    concurrentClients.map((client) =>
      client.query(`select public.expire_stale_bookings() as total`),
    ),
  );
  const concurrentCounts = concurrentResults.map((result) => Number(result.rows[0].total));
  check(
    "execuções concorrentes expiram a mesma reserva apenas uma vez",
    concurrentCounts.reduce((sum, count) => sum + count, 0) === 1 &&
      concurrentCounts.every((count) => count === 0 || count === 1),
    JSON.stringify(concurrentCounts),
  );
  const concurrentState = (
    await db.query(
      `select b.status, count(e.id)::int as events
         from public.bookings b
         left join public.booking_events e
           on e.booking_id = b.id and e.event_type = 'booking.expired'
        where b.id = $1
        group by b.id, b.status`,
      [concurrentFixture.id],
    )
  ).rows[0];
  check(
    "concorrência deixa status expired e um evento",
    concurrentState.status === "expired" && concurrentState.events === 1,
    JSON.stringify(concurrentState),
  );

  await serviceRoleA.end();
  await Promise.all(concurrentClients.map((client) => client.end()));
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
    `update public.bookings
        set starts_at = now() + interval '2 hours',
            ends_at = now() + interval '3 hours',
            occupied_until = now() + interval '3 hours'
      where id = $1`,
    [nBooking.id],
  );

  // Cria, confirma e cancela outra reserva dentro da janela; reminders não
  // deve selecionar status que já foi cancelado.
  const cancelledReminderStart = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const reminderDay = (
    await db.query(
      `select extract(dow from ($1::timestamptz at time zone 'America/Sao_Paulo'))::int as day`,
      [cancelledReminderStart],
    )
  ).rows[0].day;
  await db.query(
    `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at)
     values ($1, $2, '00:00', '23:59') on conflict do nothing`,
    [providerN, reminderDay],
  );
  const cancelledReminderBooking = await createBooking(
    customerNClient,
    "notif-a",
    serviceN,
    cancelledReminderStart,
    `notif-reminder-cancel-${uuid()}`,
    "Cliente Lembrete Cancelado",
  );
  await customerNClient.query(
    `select * from public.transition_booking($1, 'proof_received')`,
    [cancelledReminderBooking.id],
  );
  await ownerNClient.query(
    `select * from public.transition_booking($1, 'payment_approved')`,
    [cancelledReminderBooking.id],
  );
  await customerNClient.query(
    `select * from public.transition_booking($1, 'cancel')`,
    [cancelledReminderBooking.id],
  );

  const serviceRole = await asRole("service_role");
  const serviceRoleConcurrent = await asRole("service_role");
  const concurrentReminderRuns = await Promise.all([
    serviceRole.query(`select public.create_booking_reminders(24) as total`),
    serviceRoleConcurrent.query(`select public.create_booking_reminders(24) as total`),
  ]);
  const concurrentCounts = concurrentReminderRuns.map((result) => Number(result.rows[0].total));
  check(
    "lembretes simultâneos não duplicam evento",
    concurrentCounts.reduce((sum, count) => sum + count, 0) >= 1 &&
      concurrentCounts.some((count) => count === 0),
    `obteve ${concurrentCounts.join(",")}`,
  );
  const second = (
    await serviceRole.query(`select public.create_booking_reminders(24) as total`)
  ).rows[0].total;
  check("lembretes são idempotentes no mesmo dia", Number(second) === 0, `obteve ${second}`);
  await serviceRoleConcurrent.end();

  const cancelledReminderCount = (
    await db.query(
      `select count(*)::int as total from public.notifications
       where booking_id = $1 and kind = 'booking_reminder'`,
      [cancelledReminderBooking.id],
    )
  ).rows[0].total;
  check(
    "reservas canceladas não recebem lembretes",
    cancelledReminderCount === 0,
    `obteve ${cancelledReminderCount}`,
  );
  await expectError(
    "janela de lembrete inválida é rejeitada",
    () => serviceRole.query(`select public.create_booking_reminders(0)`),
    "invalid_reminder_window",
  );
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
  const reminderKeyRow = (
    await db.query(
      `select e.external_event_id, b.starts_at, b.timezone
         from public.booking_events e
         join public.bookings b on b.id = e.booking_id
        where e.booking_id = $1 and e.event_type = 'booking.reminder'
        limit 1`,
      [nBooking.id],
    )
  ).rows[0];
  const expectedReminderKey = (
    await db.query(
      `select 'reminder-' || $1::text || '-'
        || to_char($2::timestamptz at time zone $3::text, 'YYYYMMDD') as key`,
      [nBooking.id, reminderKeyRow.starts_at, reminderKeyRow.timezone],
    )
  ).rows[0].key.replace(/\s+/g, "");
  check(
    "chave do lembrete usa o dia local do agendamento no fuso do prestador",
    reminderKeyRow.external_event_id === expectedReminderKey,
    `obteve ${reminderKeyRow.external_event_id}, esperado ${expectedReminderKey}`,
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

  // Reserva já expirada deve continuar inelegível mesmo se seu início for
  // colocado artificialmente dentro da janela futura do job.
  await db.query(
    `update public.bookings
        set starts_at = now() + interval '2 hours',
            ends_at = now() + interval '3 hours',
            occupied_until = now() + interval '3 hours'
      where id = $1`,
    [expiredBooking.id],
  );
  await serviceRole.query(`select public.create_booking_reminders(24)`);
  const expiredReminderCount = (
    await db.query(
      `select count(*)::int as total from public.notifications
       where booking_id = $1 and kind = 'booking_reminder'`,
      [expiredBooking.id],
    )
  ).rows[0].total;
  check(
    "reservas expiradas não recebem lembretes",
    expiredReminderCount === 0,
    `obteve ${expiredReminderCount}`,
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

console.log("\n[schedulers multi-serviço: expiração e lembretes]");
{
  const ownerMS = uuid();
  const customerMS1 = uuid();
  const customerMS2 = uuid();
  for (const id of [ownerMS, customerMS1, customerMS2]) {
    await db.query("insert into auth.users (id) values ($1)", [id]);
  }

  const providerMS = (
    await db.query(
      `insert into public.providers (owner_id, slug, display_name, timezone, is_published, booking_hold_minutes)
       values ($1, 'multi-sched', 'Barbearia Multi', 'America/Sao_Paulo', true, 30)
       returning id`,
      [ownerMS],
    )
  ).rows[0].id;

  // 2 serviços com duração, preço, sinal e buffer distintos:
  // combinação [Corte, Barba] => 90 min, R$ 125,00, sinal R$ 30,00, buffer 10 min (último serviço), ocupado 100 min.
  const svcCorte = (
    await db.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents, deposit_cents, buffer_minutes)
       values ($1, 'Corte', 60, 8000, 2000, 15) returning id`,
      [providerMS],
    )
  ).rows[0].id;
  const svcBarba = (
    await db.query(
      `insert into public.services (provider_id, name, duration_minutes, price_cents, deposit_cents, buffer_minutes)
       values ($1, 'Barba', 30, 4500, 1000, 10) returning id`,
      [providerMS],
    )
  ).rows[0].id;

  // Expediente amplo todos os dias (08:00-23:55 BRT) para cobrir tanto slots
  // futuros fixos quanto horários próximos da virada de dia UTC (21:30/22:00 BRT).
  await db.query(
    `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at)
     select $1, day, '08:00', '23:55' from generate_series(0, 6) as day`,
    [providerMS],
  );

  const ownerMSClient = await asRole("authenticated", ownerMS);
  const customerMS1Client = await asRole("authenticated", customerMS1);
  const customerMS2Client = await asRole("authenticated", customerMS2);
  const anonMS = await asRole("anon");
  const serviceRoleMS = await asRole("service_role");
  const serviceRoleMS2 = await asRole("service_role");

  async function createMultiBooking(client, serviceIds, startsAt, key, name = "Cliente Multi") {
    const result = await client.query(
      `select * from public.create_booking($1, $2::uuid[], $3::timestamptz, $4, '11988887777', $5)`,
      ["multi-sched", serviceIds, startsAt, name, key],
    );
    return result.rows[0];
  }

  // Datas futuras fixas (2026-12-10 e 2026-12-11) para testes de expiração.
  // 09:00 BRT = 12:00Z; 10:00 BRT = 13:00Z (início do 2º serviço); 11:00 BRT = 14:00Z; 14:00 BRT = 17:00Z; 17:00 BRT = 20:00Z.
  const MS_EXP_PAY = "2026-12-10T12:00:00.000Z";
  const MS_EXP_PAY_SECOND_SVC = "2026-12-10T13:00:00.000Z";
  const MS_EXP_REV = "2026-12-10T15:00:00.000Z";
  const MS_LIVE_HOLD = "2026-12-10T18:00:00.000Z";
  const MS_CONFIRMED_FUTURE = "2026-12-10T21:00:00.000Z";

  const multiExpPay = await createMultiBooking(
    customerMS1Client,
    [svcCorte, svcBarba],
    MS_EXP_PAY,
    `ms-exp-pay-${uuid()}`,
    "Cliente Multi Pagamento",
  );
  check(
    "reserva multi-serviço agrega duração, preço, sinal, buffer do último e snapshot",
    multiExpPay.duration_minutes_snapshot === 90 &&
      multiExpPay.price_cents_snapshot === 12500 &&
      multiExpPay.deposit_cents_snapshot === 3000 &&
      multiExpPay.buffer_minutes_snapshot === 10 &&
      multiExpPay.service_name_snapshot === "Corte + Barba" &&
      new Date(multiExpPay.ends_at).getTime() - new Date(multiExpPay.starts_at).getTime() === 90 * 60_000 &&
      new Date(multiExpPay.occupied_until).getTime() - new Date(multiExpPay.starts_at).getTime() === 100 * 60_000,
    JSON.stringify({
      duration: multiExpPay.duration_minutes_snapshot,
      price: multiExpPay.price_cents_snapshot,
      deposit: multiExpPay.deposit_cents_snapshot,
      buffer: multiExpPay.buffer_minutes_snapshot,
      name: multiExpPay.service_name_snapshot,
    }),
  );

  const multiExpRev = await createMultiBooking(
    customerMS1Client,
    [svcCorte, svcBarba],
    MS_EXP_REV,
    `ms-exp-rev-${uuid()}`,
    "Cliente Multi Análise",
  );
  await customerMS1Client.query(
    `select * from public.transition_booking($1, 'proof_received', $2)`,
    [multiExpRev.id, `ms-proof-${uuid()}`],
  );

  const multiLiveHold = await createMultiBooking(
    customerMS1Client,
    [svcCorte, svcBarba],
    MS_LIVE_HOLD,
    `ms-live-hold-${uuid()}`,
    "Cliente Multi Ativo",
  );

  const multiConfirmedFuture = await createMultiBooking(
    customerMS1Client,
    [svcCorte, svcBarba],
    MS_CONFIRMED_FUTURE,
    `ms-confirmed-future-${uuid()}`,
    "Cliente Multi Confirmado",
  );
  await customerMS1Client.query(
    `select * from public.transition_booking($1, 'proof_received', $2)`,
    [multiConfirmedFuture.id, `ms-proof-cf-${uuid()}`],
  );
  await ownerMSClient.query(
    `select * from public.transition_booking($1, 'payment_approved', $2)`,
    [multiConfirmedFuture.id, `ms-approve-cf-${uuid()}`],
  );

  // Antes da expiração, o intervalo total [09:00, 10:40) aparece ocupado na agenda pública.
  const scheduleBeforeExpire = (
    await anonMS.query(
      `select public.get_provider_schedule(
         'multi-sched', $1::uuid[], '2026-12-10'::date,
         '2026-12-10T03:00:00Z'::timestamptz, '2026-12-11T03:00:00Z'::timestamptz
       ) as data`,
      [[svcCorte, svcBarba]],
    )
  ).rows[0].data;
  check(
    "agenda multi-serviço bloqueia o intervalo combinado antes da expiração",
    scheduleBeforeExpire.busy.some(
      (b) =>
        new Date(b.startsAt).toISOString() === MS_EXP_PAY &&
        new Date(b.occupiedUntil).toISOString() === "2026-12-10T13:40:00.000Z",
    ),
    JSON.stringify(scheduleBeforeExpire.busy),
  );

  // Vence somente multiExpPay (pending_payment) e multiExpRev (pending_review).
  await db.query(
    `update public.bookings set expires_at = now() - interval '2 minutes' where id in ($1, $2)`,
    [multiExpPay.id, multiExpRev.id],
  );

  const expiredMultiCount = Number(
    (await serviceRoleMS.query(`select public.expire_stale_bookings() as total`)).rows[0].total,
  );
  check(
    "expire_stale_bookings expira reservas multi-serviço vencidas (pending_payment e pending_review)",
    expiredMultiCount === 2,
    `obteve ${expiredMultiCount}`,
  );

  const statusesAfterExpire = (
    await db.query(
      `select id, status, duration_minutes_snapshot, price_cents_snapshot, deposit_cents_snapshot, service_name_snapshot
         from public.bookings
        where id in ($1, $2, $3, $4)`,
      [multiExpPay.id, multiExpRev.id, multiLiveHold.id, multiConfirmedFuture.id],
    )
  ).rows;
  const statusMap = Object.fromEntries(statusesAfterExpire.map((r) => [r.id, r]));
  check(
    "expiração preserva hold vigente e confirmada, e mantém snapshots agregados nas expiradas",
    statusMap[multiExpPay.id].status === "expired" &&
      statusMap[multiExpRev.id].status === "expired" &&
      statusMap[multiLiveHold.id].status === "pending_payment" &&
      statusMap[multiConfirmedFuture.id].status === "confirmed" &&
      statusMap[multiExpPay.id].duration_minutes_snapshot === 90 &&
      statusMap[multiExpPay.id].price_cents_snapshot === 12500 &&
      statusMap[multiExpPay.id].deposit_cents_snapshot === 3000 &&
      statusMap[multiExpPay.id].service_name_snapshot === "Corte + Barba",
  );

  const preservedItems = (
    await db.query(
      `select position, service_name_snapshot, duration_minutes_snapshot, price_cents_snapshot
         from public.booking_services
        where booking_id = $1
        order by position`,
      [multiExpPay.id],
    )
  ).rows;
  check(
    "expiração preserva itens em booking_services da reserva multi-serviço",
    preservedItems.length === 2 &&
      preservedItems[0].service_name_snapshot === "Corte" &&
      preservedItems[1].service_name_snapshot === "Barba",
    JSON.stringify(preservedItems),
  );

  const expiredNotifsMulti = (
    await db.query(
      `select recipient_id, body from public.notifications
        where booking_id = $1 and kind = 'booking_expired'`,
      [multiExpPay.id],
    )
  ).rows;
  check(
    "expiração multi-serviço notifica cliente e prestador com snapshot agregado",
    expiredNotifsMulti.length === 2 &&
      expiredNotifsMulti.every((row) => row.body.includes("Corte + Barba")),
    JSON.stringify(expiredNotifsMulti),
  );

  const expiredSecondRun = Number(
    (await serviceRoleMS.query(`select public.expire_stale_bookings() as total`)).rows[0].total,
  );
  check(
    "expire_stale_bookings é idempotente após expirar multi-serviços",
    expiredSecondRun === 0,
    `obteve ${expiredSecondRun}`,
  );

  // Todo o intervalo combinado [09:00, 10:40) foi liberado, inclusive a faixa do 2º serviço (10:00 BRT).
  const scheduleAfterExpire = (
    await anonMS.query(
      `select public.get_provider_schedule(
         'multi-sched', $1::uuid[], '2026-12-10'::date,
         '2026-12-10T03:00:00Z'::timestamptz, '2026-12-11T03:00:00Z'::timestamptz
       ) as data`,
      [[svcCorte, svcBarba]],
    )
  ).rows[0].data;
  check(
    "expiração remove intervalo multi-serviço de busy na agenda pública",
    !scheduleAfterExpire.busy.some(
      (b) => new Date(b.startsAt).toISOString() === MS_EXP_PAY,
    ),
  );

  const rebookedSecondServiceBand = await createMultiBooking(
    customerMS2Client,
    [svcBarba],
    MS_EXP_PAY_SECOND_SVC,
    `ms-rebook-second-${uuid()}`,
    "Cliente Faixa 2º Serviço",
  );
  check(
    "faixa do 2º serviço da reserva multi-serviço expirada aceita nova reserva",
    rebookedSecondServiceBand.status === "pending_payment",
  );

  // Expiração inline em create_booking(text, uuid[], ...) colidindo apenas na faixa do 2º serviço.
  const MS_INLINE_START = "2026-12-11T12:00:00.000Z"; // 09:00-10:40 BRT
  const MS_INLINE_COLLIDE_SECOND = "2026-12-11T13:15:00.000Z"; // 10:15 BRT (dentro do 2º serviço)
  const inlineStale = await createMultiBooking(
    customerMS1Client,
    [svcCorte, svcBarba],
    MS_INLINE_START,
    `ms-inline-stale-${uuid()}`,
    "Cliente Inline Vencido",
  );
  await db.query(
    `update public.bookings set expires_at = now() - interval '2 minutes' where id = $1`,
    [inlineStale.id],
  );
  const inlineWinner = await createMultiBooking(
    customerMS2Client,
    [svcCorte, svcBarba],
    MS_INLINE_COLLIDE_SECOND,
    `ms-inline-winner-${uuid()}`,
    "Cliente Inline Novo",
  );
  const inlineStaleAfter = (
    await db.query(`select status from public.bookings where id = $1`, [inlineStale.id])
  ).rows[0].status;
  const inlineExpiredEvents = Number(
    (
      await db.query(
        `select count(*)::int as total from public.booking_events
          where booking_id = $1 and event_type = 'booking.expired'`,
        [inlineStale.id],
      )
    ).rows[0].total,
  );
  check(
    "create_booking multi-serviço expira inline conflito vencido na faixa do 2º serviço",
    inlineWinner.status === "pending_payment" &&
      inlineStaleAfter === "expired" &&
      inlineExpiredEvents === 1,
    `winner=${inlineWinner.status}, stale=${inlineStaleAfter}, events=${inlineExpiredEvents}`,
  );

  // --- Lembretes (create_booking_reminders) com reservas multi-serviço e virada de dia UTC ---
  // Escolhe sempre um horário futuro dentro das próximas 24h em que a data UTC é
  // 1 dia posterior à data local em America/Sao_Paulo (00:30Z = 21:30 BRT ou 01:00Z = 22:00 BRT).
  const rolloverSlot = (
    await db.query(`
      with base as (
        select
          (date_trunc('day', now() at time zone 'UTC') + interval '30 minutes') at time zone 'UTC' as t_0030,
          (date_trunc('day', now() at time zone 'UTC') + interval '1 hour') at time zone 'UTC' as t_0100,
          (date_trunc('day', now() at time zone 'UTC') + interval '1 day 30 minutes') at time zone 'UTC' as t_next_0030
      ),
      chosen as (
        select case
          when t_0030 > now() + interval '5 minutes' then t_0030
          when t_0100 > now() + interval '5 minutes' then t_0100
          else t_next_0030
        end as starts_at
        from base
      )
      select
        starts_at,
        to_char(starts_at at time zone 'America/Sao_Paulo', 'YYYYMMDD') as local_ymd,
        to_char(starts_at at time zone 'UTC', 'YYYYMMDD') as utc_ymd,
        to_char(starts_at at time zone 'America/Sao_Paulo', 'HH24:MI') as local_hm
      from chosen
    `)
  ).rows[0];
  check(
    "horário de teste multi-serviço cruza a virada de dia UTC vs America/Sao_Paulo",
    rolloverSlot.local_ymd !== rolloverSlot.utc_ymd,
    `local=${rolloverSlot.local_ymd}, utc=${rolloverSlot.utc_ymd}`,
  );

  const multiReminderConfirmed = await createMultiBooking(
    customerMS1Client,
    [svcCorte, svcBarba],
    rolloverSlot.starts_at,
    `ms-rem-confirmed-${uuid()}`,
    "Cliente Multi Lembrete",
  );
  await customerMS1Client.query(
    `select * from public.transition_booking($1, 'proof_received', $2)`,
    [multiReminderConfirmed.id, `ms-rem-proof-${uuid()}`],
  );
  await ownerMSClient.query(
    `select * from public.transition_booking($1, 'payment_approved', $2)`,
    [multiReminderConfirmed.id, `ms-rem-approve-${uuid()}`],
  );

  // Cria também uma reserva multi-serviço confirmada e depois cancelada na mesma janela
  // (em outro horário livre dentro das próximas 24h) para garantir exclusão de canceladas.
  const cancelledSlot = (
    await db.query(`
      select to_char((($1::timestamptz) - interval '3 hours') at time zone 'America/Sao_Paulo', 'HH24:MI') as hm,
             (($1::timestamptz) - interval '3 hours') as candidate,
             (now() + interval '2 hours') as fallback
    `, [rolloverSlot.starts_at])
  ).rows[0];
  const cancelledStartsAt =
    new Date(cancelledSlot.candidate).getTime() > Date.now() + 10 * 60_000
      ? cancelledSlot.candidate
      : (
          await db.query(
            `select ((date_trunc('hour', now() at time zone 'America/Sao_Paulo') + interval '2 hours') at time zone 'America/Sao_Paulo') as ts`,
          )
        ).rows[0].ts;
  // Usa uma hora garantidamente dentro de 08:00-20:00 BRT caso o fallback caia na madrugada,
  // ajustando diretamente para evitar conflito com multiReminderConfirmed.
  const multiReminderCancelled = await createMultiBooking(
    customerMS2Client,
    [svcCorte, svcBarba],
    "2026-12-12T12:00:00.000Z",
    `ms-rem-cancelled-${uuid()}`,
    "Cliente Multi Cancelado",
  );
  await customerMS2Client.query(
    `select * from public.transition_booking($1, 'proof_received', $2)`,
    [multiReminderCancelled.id, `ms-rem-c-proof-${uuid()}`],
  );
  await ownerMSClient.query(
    `select * from public.transition_booking($1, 'payment_approved', $2)`,
    [multiReminderCancelled.id, `ms-rem-c-approve-${uuid()}`],
  );
  await customerMS2Client.query(
    `select * from public.transition_booking($1, 'cancel', $2)`,
    [multiReminderCancelled.id, `ms-rem-c-cancel-${uuid()}`],
  );
  await db.query(
    `update public.bookings
        set starts_at = $2::timestamptz,
            ends_at = $2::timestamptz + interval '90 minutes',
            occupied_until = $2::timestamptz + interval '100 minutes'
      where id = $1`,
    [multiReminderCancelled.id, cancelledStartsAt],
  );

  // Executa create_booking_reminders(24) com a sessão em UTC.
  await serviceRoleMS.query(`set time zone 'UTC'`);
  const reminderCountUtc = Number(
    (await serviceRoleMS.query(`select public.create_booking_reminders(24) as total`)).rows[0].total,
  );
  check(
    "create_booking_reminders(24) gera 1 único lembrete para reserva multi-serviço na janela",
    reminderCountUtc === 1,
    `obteve ${reminderCountUtc}`,
  );

  const multiReminderEvents = (
    await db.query(
      `select external_event_id from public.booking_events
        where booking_id = $1 and event_type = 'booking.reminder'`,
      [multiReminderConfirmed.id],
    )
  ).rows;
  const expectedMultiReminderKey = `reminder-${multiReminderConfirmed.id}-${rolloverSlot.local_ymd}`;
  check(
    "chave do lembrete multi-serviço usa data local do prestador (não data UTC)",
    multiReminderEvents.length === 1 &&
      multiReminderEvents[0].external_event_id === expectedMultiReminderKey,
    `obteve ${JSON.stringify(multiReminderEvents)}, esperado ${expectedMultiReminderKey}`,
  );

  const multiReminderNotifs = (
    await db.query(
      `select recipient_id, body from public.notifications
        where booking_id = $1 and kind = 'booking_reminder'`,
      [multiReminderConfirmed.id],
    )
  ).rows;
  check(
    "lembrete multi-serviço cria 1 par de notificações com snapshot agregado e hora local",
    multiReminderNotifs.length === 2 &&
      multiReminderNotifs.every(
        (n) =>
          n.body.includes("Corte + Barba") &&
          n.body.includes(rolloverSlot.local_hm),
      ),
    JSON.stringify(multiReminderNotifs),
  );

  // Reexecuções em fusos de sessão distintos (Asia/Tokyo e America/Sao_Paulo) não duplicam.
  await serviceRoleMS.query(`set time zone 'Asia/Tokyo'`);
  const reminderCountTokyo = Number(
    (await serviceRoleMS.query(`select public.create_booking_reminders(24) as total`)).rows[0].total,
  );
  await serviceRoleMS.query(`set time zone 'America/Sao_Paulo'`);
  const reminderCountSp = Number(
    (await serviceRoleMS.query(`select public.create_booking_reminders(24) as total`)).rows[0].total,
  );
  check(
    "idempotência diária do lembrete multi-serviço independe do fuso da sessão",
    reminderCountTokyo === 0 && reminderCountSp === 0,
    `tokyo=${reminderCountTokyo}, sp=${reminderCountSp}`,
  );

  // Exclusão de cancelada, expirada e confirmada fora da janela (> 24h).
  const excludedMultiReminders = Number(
    (
      await db.query(
        `select count(*)::int as total from public.booking_events
          where booking_id in ($1, $2, $3, $4) and event_type = 'booking.reminder'`,
        [
          multiReminderCancelled.id,
          multiExpPay.id,
          multiLiveHold.id,
          multiConfirmedFuture.id,
        ],
      )
    ).rows[0].total,
  );
  check(
    "reservas multi-serviço canceladas, expiradas, pendentes ou fora da janela não recebem lembrete",
    excludedMultiReminders === 0,
    `obteve ${excludedMultiReminders}`,
  );

  // Concorrência (FOR UPDATE SKIP LOCKED) em nova reserva multi-serviço elegível.
  const multiConcurrentReminder = await createMultiBooking(
    customerMS2Client,
    [svcCorte, svcBarba],
    "2026-12-13T12:00:00.000Z",
    `ms-rem-concurrent-${uuid()}`,
    "Cliente Multi Concorrente",
  );
  await customerMS2Client.query(
    `select * from public.transition_booking($1, 'proof_received', $2)`,
    [multiConcurrentReminder.id, `ms-rem-cc-proof-${uuid()}`],
  );
  await ownerMSClient.query(
    `select * from public.transition_booking($1, 'payment_approved', $2)`,
    [multiConcurrentReminder.id, `ms-rem-cc-approve-${uuid()}`],
  );
  await db.query(
    `update public.bookings
        set starts_at = case
              when ($2::timestamptz - interval '3 hours') > now() + interval '10 minutes'
                then $2::timestamptz - interval '3 hours'
              else $2::timestamptz + interval '3 hours'
            end,
            ends_at = (case
              when ($2::timestamptz - interval '3 hours') > now() + interval '10 minutes'
                then $2::timestamptz - interval '3 hours'
              else $2::timestamptz + interval '3 hours'
            end) + interval '90 minutes',
            occupied_until = (case
              when ($2::timestamptz - interval '3 hours') > now() + interval '10 minutes'
                then $2::timestamptz - interval '3 hours'
              else $2::timestamptz + interval '3 hours'
            end) + interval '100 minutes'
      where id = $1`,
    [multiConcurrentReminder.id, rolloverSlot.starts_at],
  );
  const concurrentMultiRuns = await Promise.all([
    serviceRoleMS.query(`select public.create_booking_reminders(24) as total`),
    serviceRoleMS2.query(`select public.create_booking_reminders(24) as total`),
  ]);
  const concurrentMultiSum = concurrentMultiRuns.reduce(
    (acc, r) => acc + Number(r.rows[0].total),
    0,
  );
  const concurrentMultiEvents = Number(
    (
      await db.query(
        `select count(*)::int as total from public.booking_events
          where booking_id = $1 and event_type = 'booking.reminder'`,
        [multiConcurrentReminder.id],
      )
    ).rows[0].total,
  );
  check(
    "execução concorrente de create_booking_reminders não duplica lembrete multi-serviço",
    concurrentMultiSum === 1 && concurrentMultiEvents === 1,
    `sum=${concurrentMultiSum}, events=${concurrentMultiEvents}`,
  );

  await expectError(
    "janela de lembrete acima de 168h é rejeitada",
    () => serviceRoleMS.query(`select public.create_booking_reminders(169)`),
    "invalid_reminder_window",
  );

  await ownerMSClient.end();
  await customerMS1Client.end();
  await customerMS2Client.end();
  await anonMS.end();
  await serviceRoleMS.end();
  await serviceRoleMS2.end();
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
    "booking_services",
    "booking_events",
    "notifications",
    "legal_documents",
    "legal_acceptances",
  ];
  const rpcOnlyTables = [
    "bookings",
    "booking_services",
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

  console.log("\n[storage de imagens de serviços]");
  const imageBucket = (
    await db.query(
      `select public, file_size_limit, allowed_mime_types
         from storage.buckets where id = 'service-images'`,
    )
  ).rows[0];
  check(
    "bucket service-images é público para leitura, limita 5 MiB e MIME permitidos",
    imageBucket?.public === true &&
      Number(imageBucket.file_size_limit) === 5 * 1024 * 1024 &&
      ["image/jpeg", "image/png", "image/webp"].every((mime) =>
        imageBucket.allowed_mime_types.includes(mime),
      ),
  );
  const imagePolicies = (
    await db.query(
      `select polname from pg_policy where polrelid = 'storage.objects'::regclass`,
    )
  ).rows.map((row) => row.polname);
  check(
    "storage.objects possui leitura pública e políticas de escrita do dono",
    ["service_images_public_read", "service_images_owner_insert", "service_images_owner_update", "service_images_owner_delete"]
      .every((name) => imagePolicies.includes(name)),
    imagePolicies.join(", "),
  );

  const anonStorageClient = await asRole("anon");
  const ownServiceImagePath = `providers/${providerA}/services/${serviceA1}/${uuid()}.jpg`;
  const ownImageInsert = await ownerAClient.query(
    `insert into storage.objects (bucket_id, name) values ('service-images', $1) returning id`,
    [ownServiceImagePath],
  ).then((result) => result.rows.length === 1).catch(() => false);
  check("dono envia imagem no prefixo do próprio serviço", ownImageInsert);

  const foreignServiceImagePath = `providers/${providerB}/services/${serviceB1}/${uuid()}.jpg`;
  const foreignImageInsert = await ownerAClient.query(
    `insert into storage.objects (bucket_id, name) values ('service-images', $1)`,
    [foreignServiceImagePath],
  ).then(() => true).catch(() => false);
  check("prestador A não envia imagem para serviço de B", !foreignImageInsert);

  const anonymousImageInsert = await anonStorageClient.query(
    `insert into storage.objects (bucket_id, name) values ('service-images', $1)`,
    [`providers/${providerA}/services/${serviceA1}/${uuid()}.jpg`],
  ).then(() => true).catch(() => false);
  check("anon não envia imagem mesmo com caminho válido", !anonymousImageInsert);

  const publicImageRead = await anonStorageClient.query(
    `select name from storage.objects where bucket_id = 'service-images' and name = $1`,
    [ownServiceImagePath],
  ).then((result) => result.rows.length === 1).catch(() => false);
  check("imagem do bucket público pode ser lida anonimamente", publicImageRead);

  const foreignImageDelete = await ownerBClient.query(
    `delete from storage.objects where bucket_id = 'service-images' and name = $1 returning id`,
    [ownServiceImagePath],
  ).then((result) => result.rows.length > 0).catch(() => true);
  check("prestador B não remove imagem de A", !foreignImageDelete);

  const ownerImageDelete = await ownerAClient.query(
    `delete from storage.objects where bucket_id = 'service-images' and name = $1 returning id`,
    [ownServiceImagePath],
  ).then((result) => result.rows.length === 1).catch(() => false);
  check("dono remove imagem do próprio serviço", ownerImageDelete);
  await anonStorageClient.end();

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

await ownerAClient.end();
await ownerBClient.end();
await customerCClient.end();
await customerDClient.end();
await db.end();
await admin.end();
await postgres.stop();

console.log(`\nresultado: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
