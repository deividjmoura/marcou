/**
 * Integração PostgreSQL do consumo atômico do OAuth state do Google Calendar (#29).
 *
 * Aplica todas as migrations em ordem em um cluster efêmero isolado e valida a
 * RPC `public.consume_calendar_oauth_state(text)`:
 *   - grants mínimos (somente service_role) e search_path fixo;
 *   - state válido devolve o provider dono e limpa o hash na mesma instrução;
 *   - state expirado, inexistente, malformado ou já consumido devolve vazio;
 *   - replay sequencial e callbacks concorrentes resultam em um único consumo;
 *   - o consumo de um provider não afeta o state de outro.
 *
 * Nenhum banco remoto é tocado e o processo não usa credenciais reais.
 */
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const { Client } = pg;
const PORT = 55435;
const PASSWORD = "marcou-calendar-test";
const DATABASE = "marcou_calendar";

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

async function expectError(name, operation, messagePart) {
  try {
    await operation();
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

const databaseDir = path.join(os.tmpdir(), "marcou-calendar-pg-data");
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
const roleClients = [];

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
  await admin.query(`create database ${DATABASE}`);

  for (const role of ["anon", "authenticated", "service_role"]) {
    await admin.query(`create role ${role} login password '${PASSWORD}'`);
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
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
  `);

  const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
  const migrationNames = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrationNames) {
    const sql = await readFile(path.join(migrationDirectory, name), "utf8");
    await db.query(sql);
  }
  console.log(`migrations aplicadas: ${migrationNames.length}`);

  const uuid = () => randomUUID();
  const ownerA = uuid();
  const ownerB = uuid();
  await db.query(`insert into auth.users (id) values ($1), ($2)`, [ownerA, ownerB]);

  const insertProvider = async (owner, slug) =>
    (
      await db.query(
        `insert into public.providers (
           owner_id, slug, display_name, timezone, is_published
         ) values ($1, $2, $3, 'America/Sao_Paulo', true)
         returning id`,
        [owner, slug, slug],
      )
    ).rows[0].id;

  const providerA = await insertProvider(ownerA, "calendar-prov-a");
  const providerB = await insertProvider(ownerB, "calendar-prov-b");

  const asRole = async (role) => {
    const client = new Client({
      host: "127.0.0.1",
      port: PORT,
      database: DATABASE,
      user: role,
      password: PASSWORD,
    });
    await client.connect();
    roleClients.push(client);
    return client;
  };

  const anonClient = await asRole("anon");
  const authenticatedClient = await asRole("authenticated");
  const serviceRoleClient = await asRole("service_role");

  const sha256 = (value) =>
    createHash("sha256").update(value).digest("hex");

  /** Grava um state pendente e devolve o hash persistido. */
  const seedState = async (
    providerId,
    { state = `state-${uuid()}`, expiresIn = "10 minutes" } = {},
  ) => {
    const hash = sha256(state);
    await db.query(
      `insert into public.provider_calendar_connections (
         provider_id, oauth_state_hash, oauth_state_expires_at, updated_at
       ) values ($1, $2, now() + $3::interval, now())
       on conflict (provider_id) do update
         set oauth_state_hash = excluded.oauth_state_hash,
             oauth_state_expires_at = excluded.oauth_state_expires_at,
             updated_at = now()`,
      [providerId, hash, expiresIn],
    );
    return hash;
  };

  const consumeAs = async (client, hash) =>
    (
      await client.query(
        `select * from public.consume_calendar_oauth_state($1)`,
        [hash],
      )
    ).rows;

  console.log("\n[grants e hardening da RPC]");

  const definition = (
    await db.query(`
      select p.prosecdef as is_definer,
             coalesce(p.proconfig, '{}'::text[]) as proconfig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'consume_calendar_oauth_state'
    `)
  ).rows[0];
  check(
    "RPC existe como SECURITY DEFINER",
    definition?.is_definer === true,
    JSON.stringify(definition),
  );
  check(
    "RPC fixa search_path seguro",
    (definition?.proconfig ?? []).some(
      (setting) =>
        setting === "search_path=pg_catalog, public" ||
        setting === "search_path=pg_catalog,public",
    ),
    JSON.stringify(definition?.proconfig),
  );

  const publicExecute = (
    await db.query(`
      select count(*)::int as total
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(
          coalesce(p.proacl, acldefault('f', p.proowner))
        ) acl
       where n.nspname = 'public'
         and p.proname = 'consume_calendar_oauth_state'
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
    `)
  ).rows[0].total;
  check("RPC não herda EXECUTE de PUBLIC", publicExecute === 0);

  const privileges = (
    await db.query(`
      select role_name,
             has_function_privilege(
               role_name,
               'public.consume_calendar_oauth_state(text)',
               'EXECUTE'
             ) as allowed
        from unnest(array['anon', 'authenticated', 'service_role']) as role_name
       order by role_name
    `)
  ).rows;
  const privilegeMap = Object.fromEntries(
    privileges.map((row) => [row.role_name, row.allowed]),
  );
  check(
    "somente service_role executa a RPC",
    privilegeMap.anon === false &&
      privilegeMap.authenticated === false &&
      privilegeMap.service_role === true,
    JSON.stringify(privilegeMap),
  );

  await expectError(
    "anon não consome state",
    () => consumeAs(anonClient, sha256("anon-state")),
    "permission denied",
  );
  await expectError(
    "authenticated não consome state",
    () => consumeAs(authenticatedClient, sha256("authenticated-state")),
    "permission denied",
  );

  console.log("\n[consumo de state]");

  const validHash = await seedState(providerA);
  const consumed = await consumeAs(serviceRoleClient, validHash);
  check(
    "state válido devolve exatamente um provider",
    consumed.length === 1 && consumed[0].provider_id === providerA,
    JSON.stringify(consumed),
  );
  const afterConsume = (
    await db.query(
      `select oauth_state_hash, oauth_state_expires_at
         from public.provider_calendar_connections
        where provider_id = $1`,
      [providerA],
    )
  ).rows[0];
  check(
    "consumo limpa hash e expiração na mesma operação",
    afterConsume.oauth_state_hash === null &&
      afterConsume.oauth_state_expires_at === null,
    JSON.stringify(afterConsume),
  );
  check(
    "replay sequencial do mesmo state devolve vazio",
    (await consumeAs(serviceRoleClient, validHash)).length === 0,
  );

  const expiredHash = await seedState(providerA, { expiresIn: "-1 minute" });
  check(
    "state expirado devolve vazio",
    (await consumeAs(serviceRoleClient, expiredHash)).length === 0,
  );
  const expiredRow = (
    await db.query(
      `select oauth_state_hash
         from public.provider_calendar_connections
        where provider_id = $1`,
      [providerA],
    )
  ).rows[0];
  check(
    "state expirado não é promovido a válido",
    expiredRow.oauth_state_hash !== validHash,
    JSON.stringify(expiredRow),
  );

  check(
    "hash inexistente devolve vazio",
    (await consumeAs(serviceRoleClient, sha256("state-que-nunca-existiu")))
      .length === 0,
  );
  check(
    "hash malformado devolve vazio",
    (await consumeAs(serviceRoleClient, "not-a-hash")).length === 0,
  );
  check(
    "hash nulo devolve vazio",
    (await consumeAs(serviceRoleClient, null)).length === 0,
  );
  check(
    "string vazia devolve vazio",
    (await consumeAs(serviceRoleClient, "")).length === 0,
  );

  console.log("\n[isolamento entre providers]");

  await seedState(providerA);
  const hashA = (
    await db.query(
      `select oauth_state_hash from public.provider_calendar_connections where provider_id = $1`,
      [providerA],
    )
  ).rows[0].oauth_state_hash;
  const hashB = await seedState(providerB);
  const consumedB = await consumeAs(serviceRoleClient, hashB);
  check(
    "consumo devolve o provider dono do state",
    consumedB.length === 1 && consumedB[0].provider_id === providerB,
    JSON.stringify(consumedB),
  );
  const untouchedA = (
    await db.query(
      `select oauth_state_hash from public.provider_calendar_connections where provider_id = $1`,
      [providerA],
    )
  ).rows[0].oauth_state_hash;
  check(
    "state de outro provider permanece intacto",
    untouchedA === hashA,
    `${untouchedA} !== ${hashA}`,
  );

  console.log("\n[callbacks concorrentes]");

  const raceHash = await seedState(providerA);
  const raceClients = await Promise.all([
    asRole("service_role"),
    asRole("service_role"),
  ]);
  const raceResults = await Promise.all(
    raceClients.map((client) => consumeAs(client, raceHash)),
  );
  const winners = raceResults.filter((rows) => rows.length === 1);
  check(
    "dois callbacks simultâneos consomem o state uma única vez",
    winners.length === 1 &&
      raceResults.reduce((total, rows) => total + rows.length, 0) === 1,
    JSON.stringify(raceResults),
  );
  check(
    "callback perdedor recebe resultado vazio",
    raceResults.some((rows) => rows.length === 0),
    JSON.stringify(raceResults),
  );
  check(
    "vencedor da corrida é o provider correto",
    winners[0]?.[0]?.provider_id === providerA,
    JSON.stringify(winners),
  );

  const burstHash = await seedState(providerB);
  const burstClients = await Promise.all(
    Array.from({ length: 8 }, () => asRole("service_role")),
  );
  const burstResults = await Promise.all(
    burstClients.map((client) => consumeAs(client, burstHash)),
  );
  check(
    "oito callbacks simultâneos consomem o state uma única vez",
    burstResults.reduce((total, rows) => total + rows.length, 0) === 1,
    JSON.stringify(burstResults.map((rows) => rows.length)),
  );

  const sameClientHash = await seedState(providerA);
  const sameClientResults = await Promise.all([
    consumeAs(serviceRoleClient, sameClientHash),
    consumeAs(serviceRoleClient, sameClientHash),
    consumeAs(serviceRoleClient, sameClientHash),
  ]);
  check(
    "repetições na mesma conexão também são de uso único",
    sameClientResults.reduce((total, rows) => total + rows.length, 0) === 1,
    JSON.stringify(sameClientResults.map((rows) => rows.length)),
  );

  console.log("\n[estado das conexões após consumo]");

  const connectionAfterRace = (
    await db.query(
      `select connection_status, oauth_state_hash
         from public.provider_calendar_connections
        where provider_id = $1`,
      [providerA],
    )
  ).rows[0];
  check(
    "consumo não altera o status da conexão",
    connectionAfterRace.connection_status === "pending" &&
      connectionAfterRace.oauth_state_hash === null,
    JSON.stringify(connectionAfterRace),
  );

  const tablesWithoutRls = (
    await db.query(`
      select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relkind = 'r'
         and not c.relrowsecurity
       order by c.relname
    `)
  ).rows.map((row) => row.relname);
  check(
    "tabelas do Calendar continuam com RLS",
    tablesWithoutRls.length === 0,
    tablesWithoutRls.join(", "),
  );

  const leakedPrivileges = [];
  for (const role of ["anon", "authenticated"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const allowed = (
        await db.query(
          `select has_table_privilege($1, 'public.provider_calendar_connections', $2) as allowed`,
          [role, privilege],
        )
      ).rows[0].allowed;
      if (allowed) leakedPrivileges.push(`${role}:${privilege}`);
    }
  }
  check(
    "credenciais do Calendar não são legíveis pelo cliente",
    leakedPrivileges.length === 0,
    leakedPrivileges.join(", "),
  );
} catch (error) {
  failed += 1;
  console.error("  FAIL erro não tratado no harness do Calendar", error);
} finally {
  await Promise.allSettled(roleClients.map((client) => client.end()));
  if (db) await db.end().catch(() => undefined);
  if (admin) await admin.end().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
}

console.log(`\nresultado calendar: ${passed} passaram, ${failed} falharam`);
process.exitCode = failed === 0 ? 0 : 1;
