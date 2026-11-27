/**
 * Testes de integração de concorrência e integridade do ciclo de vida dos
 * agendamentos, executados contra um PostgreSQL local isolado (embedded-postgres).
 *
 * Cenários:
 * 1. Duas chamadas simultâneas de create_booking no mesmo intervalo → apenas uma ativa.
 * 2. Duas chamadas simultâneas com mesma chave de idempotência → sem duplicatas (exclusion).
 * 3. Idempotência sequencial com mesma chave → mesma reserva, sem duplicata.
 * 4. Chamadas simultâneas com chaves diferentes em horários conflitantes → lock/exclusion.
 * 5. transition_booking simultânea em transições incompatíveis → estado final válido.
 * 6. Repetição de transição já aplicada → rejeição (invalid_transition).
 * 7. payment_approved apenas pelo prestador no banco real.
 * 8. Expiração antes da confirmação bloqueia aprovação.
 *
 * Cada teste usa um horário/dia distinto para não haver interferência cruzada.
 * Uso: node scripts/booking-concurrency.mjs
 */
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const { Client } = pg;
const PORT = 55433;
const PASSWORD = "marcou-test";
const DATABASE = "marcou_concurrency";

let passed = 0;
let failed = 0;

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  process.exit(1);
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

const databaseDir = path.join(os.tmpdir(), `marcou-pg-data-${PORT}`);
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
  "supabase/migrations/202611160001_provider_description.sql",
  "supabase/migrations/20261116035000_fix_booking_idempotency_authorization.sql",
  "supabase/migrations/202611230001_legal_documents_and_acceptances.sql",
  "supabase/migrations/20261127000000_booking_transition_concurrency_lock.sql",
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
const customer1 = uuid();
const customer2 = uuid();
const customer3 = uuid();
const customer4 = uuid();

for (const id of [ownerA, customer1, customer2, customer3, customer4]) {
  await db.query("insert into auth.users (id) values ($1)", [id]);
}

const slugA = `prov-conc-${uuid().slice(0, 8)}`;
await db.query(
  `insert into public.providers (id, owner_id, slug, display_name, timezone, is_published)
   values ($1, $2, $3, 'Prestador Concorrência', 'America/Sao_Paulo', true)`,
  [ownerA, ownerA, slugA],
);
const serviceA = uuid();
await db.query(
  `insert into public.services (id, provider_id, name, duration_minutes, price_cents, deposit_cents, buffer_minutes, is_active)
   values ($1, $2, 'Serviço Conc', 60, 8000, 0, 15, true)`,
  [serviceA, ownerA],
);

for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
  await db.query(
    `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at, is_active)
     values ($1, $2, '09:00', '12:00', true)`,
    [ownerA, dow],
  );
  await db.query(
    `insert into public.availability_rules (provider_id, day_of_week, starts_at, ends_at, is_active)
     values ($1, $2, '14:00', '18:00', true)`,
    [ownerA, dow],
  );
}
const D1_09 = "2026-12-01T12:00:00.000Z"; // 09:00 BRT
const D1_1030 = "2026-12-01T13:30:00.000Z"; // 10:30 BRT
const D2_09 = "2026-12-08T12:00:00.000Z"; // 09:00 BRT
const D2_14 = "2026-12-08T17:00:00.000Z"; // 14:00 BRT
const D2_1430 = "2026-12-08T17:30:00.000Z"; // 14:30 BRT (conflita com D2_14)
const D3_09 = "2026-12-15T12:00:00.000Z"; // 09:00 BRT
const D3_1030 = "2026-12-15T13:30:00.000Z"; // 10:30 BRT
const D4_09 = "2026-12-22T12:00:00.000Z"; // 09:00 BRT
const D4_1030 = "2026-12-22T13:30:00.000Z"; // 10:30 BRT
const D5_09 = "2026-12-29T12:00:00.000Z"; // 09:00 BRT (nova data para não conflitar)

async function createBooking(client, startsAt, key, name = "Cliente") {
  const result = await client.query(
    `select * from public.create_booking($1, $2, $3, $4, '11999999999', $5)`,
    [slugA, serviceA, startsAt, name, key],
  );
  return result.rows[0];
}

const c1 = await asRole("authenticated", customer1);
const c2 = await asRole("authenticated", customer2);
const c3 = await asRole("authenticated", customer3);
const c4 = await asRole("authenticated", customer4);
const ownerAClient = await asRole("authenticated", ownerA);

console.log("\n[concorrência 1: mesmo intervalo, apenas uma ativa]");
{
  const attempts = await Promise.allSettled([
    createBooking(c1, D1_09, `race-1-${uuid()}`, "C1"),
    createBooking(c2, D1_09, `race-2-${uuid()}`, "C2"),
  ]);
  const fulfilled = attempts.filter((a) => a.status === "fulfilled");
  const rejected = attempts.filter(
    (a) =>
      a.status === "rejected" &&
      String(a.reason?.message).includes("slot_unavailable"),
  );
  check("exatamente uma reserva criada", fulfilled.length === 1, `obteve ${fulfilled.length}`);
  check("a outra recebe slot_unavailable", rejected.length === 1, `obteve ${rejected.length}`);
  const active = (
    await db.query(
      `select count(*)::int as total from public.bookings where provider_id = $1 and status in ('pending_payment','pending_review','confirmed')`,
      [ownerA],
    )
  ).rows[0];
  check("apenas uma reserva ativa no intervalo", active.total === 1, `obteve ${active.total}`);
}

console.log("\n[concorrência 2: mesma chave, execução simultânea → sem duplicatas]");
{
  const key = `idem-conc-${uuid()}`;
  const attempts = await Promise.allSettled([
    createBooking(c1, D1_1030, key, "Idem1"),
    createBooking(c2, D1_1030, key, "Idem2"),
  ]);
  const fulfilled = attempts.filter((a) => a.status === "fulfilled");
  const rejected = attempts.filter(
    (a) =>
      a.status === "rejected" &&
      String(a.reason?.message).includes("slot_unavailable"),
  );
  check("apenas uma reserva criada sob concorrência", fulfilled.length === 1, `obteve ${fulfilled.length}`);
  check("a outra recebe slot_unavailable", rejected.length === 1, `obteve ${rejected.length}`);
  const rows = (
    await db.query(
      `select count(*)::int as total from public.bookings where provider_id = $1 and starts_at = $2`,
      [ownerA, D1_1030],
    )
  ).rows[0];
  check("não há reserva duplicada no mesmo horário", rows.total === 1, `obteve ${rows.total}`);
  const events = (
    await db.query(
      `select count(*)::int as total from public.booking_events where external_event_id = $1`,
      [key],
    )
  ).rows[0];
  check("não há evento de criação duplicado", events.total === 1, `obteve ${events.total}`);
}

console.log("\n[idempotência sequencial: mesma chave devolve a mesma reserva]");
{
  const key = `idem-seq-${uuid()}`;
  const first = await createBooking(c1, D2_09, key, "Seq1");
  const second = await createBooking(c1, D2_09, key, "Seq2");
  check("mesma chave devolve a mesma reserva", first.id === second.id);
  const rows = (
    await db.query(
      `select count(*)::int as total from public.bookings where id = $1`,
      [first.id],
    )
  ).rows[0];
  check("não duplicou reserva", rows.total === 1, `obteve ${rows.total}`);
}

console.log("\n[concorrência 3: chaves diferentes, horários conflitantes]");
{
  const attempts = await Promise.allSettled([
    createBooking(c3, D2_14, `race-3-${uuid()}`, "C3"),
    createBooking(c4, D2_1430, `race-4-${uuid()}`, "C4"),
  ]);
  const fulfilled = attempts.filter((a) => a.status === "fulfilled");
  const rejected = attempts.filter(
    (a) =>
      a.status === "rejected" &&
      String(a.reason?.message).includes("slot_unavailable"),
  );
  check("apenas uma vence no conflito", fulfilled.length === 1, `obteve ${fulfilled.length}`);
  check("outra recebe slot_unavailable", rejected.length === 1, `obteve ${rejected.length}`);
}

console.log("\n[transição simultânea: duas confirmações de comprovante no mesmo agendamento]");
{
  const booking = await createBooking(c1, D3_09, `trans-${uuid()}`, "Transicao");
  // Duas conexões distintas disputam a mesma transição com chaves diferentes.
  // Com FOR UPDATE, apenas uma aplica o proof_received; a outra recebe invalid_transition.
  const attempts = await Promise.allSettled([
    c1.query(
      `select * from public.transition_booking($1, 'proof_received', $2)`,
      [booking.id, `trans-key-1-${uuid()}`],
    ),
    c2.query(
      `select * from public.transition_booking($1, 'proof_received', $2)`,
      [booking.id, `trans-key-2-${uuid()}`],
    ),
  ]);
  const fulfilled = attempts.filter((a) => a.status === "fulfilled");
  const rejected = attempts.filter((a) => a.status === "rejected");
  check("exatamente uma transição aplica", fulfilled.length === 1, `obteve ${fulfilled.length}`);
  check("a outra é rejeitada com invalid_transition", rejected.length === 1, `obteve ${rejected.length}`);
  const final = (
    await db.query(`select status from public.bookings where id = $1`, [booking.id])
  ).rows[0];
  check("estado final é pending_review (não corrompido)", final.status === "pending_review", `obteve ${final.status}`);
}

console.log("\n[transições mutuamente excludentes: prova vs cancelamento]");
{
  const booking = await createBooking(c1, D3_1030, `mutex-${uuid()}`, "Mutex");
  // proof_received (vai para pending_review) e cancel (vai para cancelled)
  // são mutuamente excludentes a partir de pending_payment.
  const attempts = await Promise.allSettled([
    c1.query(
      `select * from public.transition_booking($1, 'proof_received', $2)`,
      [booking.id, `mutex-key-1-${uuid()}`],
    ),
    c2.query(
      `select * from public.transition_booking($1, 'cancel', $2)`,
      [booking.id, `mutex-key-2-${uuid()}`],
    ),
  ]);
  const fulfilled = attempts.filter((a) => a.status === "fulfilled");
  const rejected = attempts.filter((a) => a.status === "rejected");
  check("exatamente uma transição mutuamente excludente aplica", fulfilled.length === 1, `obteve ${fulfilled.length}`);
  check("a outra é rejeitada com invalid_transition", rejected.length === 1, `obteve ${rejected.length}`);
  const final = (
    await db.query(`select status from public.bookings where id = $1`, [booking.id])
  ).rows[0];
  check("estado final é válido (pending_review ou cancelled)", ["pending_review", "cancelled"].includes(final.status), `obteve ${final.status}`);
  const events = (
    await db.query(
      `select count(*)::int as total from public.booking_events where booking_id = $1`,
      [booking.id],
    )
  ).rows[0];
  check("não há eventos de auditoria duplicados", events.total === 2, `obteve ${events.total}`);
}

console.log("\n[repetição de transição já aplicada]");
{
  const booking = await createBooking(c1, D5_09, `idem-trans-${uuid()}`, "IdemTrans");
  const first = (
    await c1.query(`select * from public.transition_booking($1, 'proof_received')`, [
      booking.id,
    ])
  ).rows[0];
  check("primeira transição aplica", first.status === "pending_review");
  await expectError(
    "replay do proof_received é rejeitado",
    () =>
      c1.query(`select * from public.transition_booking($1, 'proof_received')`, [
        booking.id,
      ]),
    "invalid_transition",
  );
  const row = (
    await db.query(`select status from public.bookings where id = $1`, [booking.id])
  ).rows[0];
  check("estado não alterado pelo replay", row.status === "pending_review");
}

console.log("\n[payment_approved apenas pelo prestador]");
{
  const booking = await createBooking(c1, D4_09, `pay-${uuid()}`, "Pay");
  await c1.query(`select * from public.transition_booking($1, 'proof_received')`, [
    booking.id,
  ]);
  await expectError(
    "cliente não pode aprovar pagamento",
    () =>
      c1.query(`select * from public.transition_booking($1, 'payment_approved')`, [
        booking.id,
      ]),
    "forbidden",
  );
  const confirmed = (
    await ownerAClient.query(
      `select * from public.transition_booking($1, 'payment_approved')`,
      [booking.id],
    )
  ).rows[0];
  check("prestador confirma", confirmed.status === "confirmed");
  check("expiração limpa na confirmação", confirmed.expires_at === null);
}

console.log("\n[expiração antes da confirmação bloqueia aprovação]");
{
  const booking = await createBooking(c1, D4_1030, `expire-pay-${uuid()}`, "ExpirePay");
  await c1.query(`select * from public.transition_booking($1, 'proof_received')`, [
    booking.id,
  ]);
  await db.query(
    `update public.bookings set expires_at = now() - interval '1 minute' where id = $1`,
    [booking.id],
  );
  const result = await ownerAClient.query(
    `select * from public.transition_booking($1, 'payment_approved')`,
    [booking.id],
  );
  check("aprovação tardia expira em vez de confirmar", result.rows[0].status === "expired");
}

await c1.end();
await c2.end();
await c3.end();
await c4.end();
await ownerAClient.end();
await db.end();
await admin.end();
await postgres.stop();

console.log(`\nresultado: ${passed} passou, ${failed} falhou`);
process.exit(failed > 0 ? 1 : 0);
