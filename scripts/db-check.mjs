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
    $$;
`);

const migrations = [
  "supabase/migrations/202611150001_initial_schema.sql",
  "supabase/migrations/202611150002_booking_operations.sql",
  "supabase/migrations/202611150003_notifications.sql",
  "supabase/migrations/202611160001_harden_security_definer_grants.sql",
];

for (const file of migrations) {
  const sql = await readFile(file, "utf8");
  await db.query(sql);
  console.log(`aplicada: ${file}`);
}

console.log("\\n[permissões de funções SECURITY DEFINER]");
{
  const permissions = (
    await db.query(`
      select
        has_function_privilege('anon', 'public.expire_stale_bookings()', 'EXECUTE') as anon_expire,
        has_function_privilege('authenticated', 'public.expire_stale_bookings()', 'EXECUTE') as authenticated_expire,
        has_function_privilege('service_role', 'public.expire_stale_bookings()', 'EXECUTE') as service_expire,
        has_function_privilege('anon', 'public.create_booking(text, uuid, timestamptz, text, text, text)', 'EXECUTE') as anon_create_booking,
        has_function_privilege('authenticated', 'public.create_booking(text, uuid, timestamptz, text, text, text)', 'EXECUTE') as authenticated_create_booking,
        has_function_privilege('anon', 'public.transition_booking(uuid, text, text)', 'EXECUTE') as anon_transition,
        has_function_privilege('authenticated', 'public.transition_booking(uuid, text, text)', 'EXECUTE') as authenticated_transition,
        has_function_privilege('anon', 'public.create_booking_reminders(integer)', 'EXECUTE') as anon_reminders,
        has_function_privilege('authenticated', 'public.create_booking_reminders(integer)', 'EXECUTE') as authenticated_reminders,
        has_function_privilege('service_role', 'public.create_booking_reminders(integer)', 'EXECUTE') as service_reminders,
        has_function_privilege('anon', 'public.get_provider_schedule(text, uuid, date, timestamptz, timestamptz)', 'EXECUTE') as anon_schedule,
        has_function_privilege('authenticated', 'public.get_provider_schedule(text, uuid, date, timestamptz, timestamptz)', 'EXECUTE') as authenticated_schedule,
        has_function_privilege('anon', 'public.mark_notification_read(uuid)', 'EXECUTE') as anon_mark_one,
        has_function_privilege('authenticated', 'public.mark_notification_read(uuid)', 'EXECUTE') as authenticated_mark_one,
        has_function_privilege('anon', 'public.mark_all_notifications_read()', 'EXECUTE') as anon_mark_all,
        has_function_privilege('authenticated', 'public.mark_all_notifications_read()', 'EXECUTE') as authenticated_mark_all,
        has_function_privilege('anon', 'public.is_interval_available(uuid, timestamptz, timestamptz)', 'EXECUTE') as anon_interval_helper,
        has_function_privilege('anon', 'public.notification_payloads(text, public.bookings, public.providers, text)', 'EXECUTE') as anon_notification_payloads,
        has_function_privilege('anon', 'public.notify_on_booking_event()', 'EXECUTE') as anon_notification_trigger
    `)
  ).rows[0];

  check("expiração em lote é exclusiva de service_role",
    !permissions.anon_expire && !permissions.authenticated_expire && permissions.service_expire);
  check("criação de reserva exige autenticação",
    !permissions.anon_create_booking && permissions.authenticated_create_booking);
  check("transição de reserva exige autenticação",
    !permissions.anon_transition && permissions.authenticated_transition);
  check("geração de lembretes é exclusiva de service_role",
    !permissions.anon_reminders && !permissions.authenticated_reminders && permissions.service_reminders);
  check("agenda pública permanece acessível a anon e authenticated",
    permissions.anon_schedule && permissions.authenticated_schedule);
  check("leitura de notificação exige autenticação",
    !permissions.anon_mark_one && permissions.authenticated_mark_one);
  check("leitura de todas notificações exige autenticação",
    !permissions.anon_mark_all && permissions.authenticated_mark_all);
  check("helpers SECURITY DEFINER não são executáveis por anon",
    !permissions.anon_interval_helper &&
    !permissions.anon_notification_payloads &&
    !permissions.anon_notification_trigger);
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
    `select * from public.create_booking($1, $2, $3, $4, '11999999999', $5)`,
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
    `select public.get_provider_schedule('prov-a', $1, '2026-12-01', $2, $3) as schedule`,
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
        `select public.get_provider_schedule('prov-b-hidden', $1, '2026-12-01', $2, $3) as schedule`,
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

await ownerAClient.end();
await ownerBClient.end();
await customerCClient.end();
await customerDClient.end();
await db.end();
await admin.end();
await postgres.stop();

console.log(`\nresultado: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
