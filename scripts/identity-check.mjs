/**
 * Harness PostgreSQL isolado para identidade, perfil privado e preferência de
 * área do Marcou. Aplica todas as migrations em um cluster efêmero e testa
 * ownership, RLS, grants, RPCs e tentativas de elevação de privilégio.
 * Uso: node scripts/identity-check.mjs
 */
import os from "node:os";
import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const { Client } = pg;
const PORT = 55434;
const PASSWORD = "marcou-identity-test";
const DATABASE = "marcou_identity";
const databaseDir = path.join(os.tmpdir(), "marcou-identity-pg-data");

let passed = 0;
let failed = 0;
let admin;
let db;
const roleClients = [];
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
    check(
      name,
      text.includes(messagePart),
      `esperava "${messagePart}", obteve "${text}"`,
    );
  }
}

async function hasTablePrivilege(role, privilege) {
  const result = await db.query(
    `select has_table_privilege($1, 'public.account_preferences', $2) as allowed`,
    [role, privilege],
  );
  return Boolean(result.rows[0].allowed);
}

async function hasFunctionPrivilege(role, signature) {
  const result = await db.query(
    `select has_function_privilege($1, $2, 'EXECUTE') as allowed`,
    [role, signature],
  );
  return Boolean(result.rows[0].allowed);
}

async function asRole(role, userId) {
  const client = new Client({
    host: "127.0.0.1",
    port: PORT,
    database: DATABASE,
    user: role,
    password: PASSWORD,
  });
  await client.connect();
  if (userId) {
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, false)`,
      [userId],
    );
  }
  roleClients.push(client);
  return client;
}

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
  const migrationPattern = /^((?:\d{12}|\d{14}))_[a-z0-9_]+\.sql$/;
  const invalidNames = migrationNames.filter((name) => !migrationPattern.test(name));
  const timestamps = migrationNames.map((name) => name.match(migrationPattern)?.[1]);
  const duplicateTimestamps = timestamps.filter(
    (timestamp, index) => timestamps.indexOf(timestamp) !== index,
  );
  const hardeningMigration = migrationNames.find(
    (name) => name === "20261123133000_harden_security_definer_grants.sql",
  );
  const identityMigration = migrationNames.find(
    (name) => name === "20261123140000_account_modes.sql",
  );
  const hardeningTimestamp = hardeningMigration?.match(migrationPattern)?.[1];
  const identityTimestamp = identityMigration?.match(migrationPattern)?.[1];
  check(
    "migrations seguem a convenção e account_modes usa timestamp UTC único de 14 dígitos posterior ao hardening",
    invalidNames.length === 0 &&
      duplicateTimestamps.length === 0 &&
      identityTimestamp?.length === 14 &&
      hardeningTimestamp !== undefined &&
      Number(identityTimestamp) > Number(hardeningTimestamp),
    `${invalidNames.join(", ")} ${duplicateTimestamps.join(", ")} ${identityMigration ?? "missing account_modes"}`,
  );

  for (const name of migrationNames) {
    const sql = await readFile(path.join(migrationDirectory, name), "utf8");
    await db.query(sql);
    console.log(`aplicada: supabase/migrations/${name}`);
  }

  const uuid = () => crypto.randomUUID();
  const ownerA = uuid();
  const ownerB = uuid();
  const customerA = uuid();
  const customerB = uuid();
  const users = [ownerA, ownerB, customerA, customerB];
  await db.query(
    `insert into auth.users (id) select unnest($1::uuid[])`,
    [users],
  );
  await db.query(
    `insert into public.profiles (id, display_name)
     select id, 'Perfil de teste' from auth.users`,
  );

  await db.query(
    `insert into public.providers (
       owner_id, slug, display_name, timezone, is_published
     ) values ($1, 'identity-owner-a', 'Negócio A', 'America/Sao_Paulo', false)`,
    [ownerA],
  );
  const providerB = (
    await db.query(
      `insert into public.providers (
         owner_id, slug, display_name, timezone, is_published
       ) values ($1, 'identity-owner-b', 'Negócio B', 'America/Sao_Paulo', false)
       returning id`,
      [ownerB],
    )
  ).rows[0].id;
  await expectError(
    "uma identidade não cria um segundo provider",
    () => db.query(
      `insert into public.providers (
         owner_id, slug, display_name, timezone, is_published
       ) values ($1, 'identity-owner-a-duplicate', 'Outro negócio A', 'America/Sao_Paulo', false)`,
      [ownerA],
    ),
    "providers_owner_id_key",
  );

  const customerAClient = await asRole("authenticated", customerA);
  const customerBClient = await asRole("authenticated", customerB);
  const ownerAClient = await asRole("authenticated", ownerA);
  const ownerBClient = await asRole("authenticated", ownerB);
  const anonClient = await asRole("anon");

  console.log("\n[identidade e privacidade]");
  const relation = (
    await db.query(`
      select c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'account_preferences'
    `)
  ).rows[0];
  check("preferências privadas têm RLS habilitada", relation?.rls === true);

  const preferencePolicies = (
    await db.query(`
      select polname, pg_get_expr(polqual, polrelid) as using_expr
        from pg_policy
       where polrelid = 'public.account_preferences'::regclass
    `)
  ).rows;
  check(
    "leitura da preferência é limitada por auth.uid()",
    preferencePolicies.length === 1 &&
      /auth\.uid\(\)/.test(preferencePolicies[0].using_expr ?? ""),
    preferencePolicies.map((row) => row.using_expr).join(" | "),
  );

  const preferencePrivileges = {
    anonSelect: await hasTablePrivilege("anon", "SELECT"),
    authSelect: await hasTablePrivilege("authenticated", "SELECT"),
    authInsert: await hasTablePrivilege("authenticated", "INSERT"),
    authUpdate: await hasTablePrivilege("authenticated", "UPDATE"),
    authDelete: await hasTablePrivilege("authenticated", "DELETE"),
    serviceAll: await hasTablePrivilege("service_role", "SELECT") &&
      await hasTablePrivilege("service_role", "INSERT") &&
      await hasTablePrivilege("service_role", "UPDATE") &&
      await hasTablePrivilege("service_role", "DELETE"),
  };
  check(
    "grants permitem somente leitura própria e administração de service_role",
    !preferencePrivileges.anonSelect &&
      preferencePrivileges.authSelect &&
      !preferencePrivileges.authInsert &&
      !preferencePrivileges.authUpdate &&
      !preferencePrivileges.authDelete &&
      preferencePrivileges.serviceAll,
    JSON.stringify(preferencePrivileges),
  );

  const functionPrivileges = {
    anonGet: await hasFunctionPrivilege("anon", "public.get_preferred_mode()"),
    anonSet: await hasFunctionPrivilege("anon", "public.set_preferred_mode(text)"),
    authenticatedGet: await hasFunctionPrivilege("authenticated", "public.get_preferred_mode()"),
    authenticatedSet: await hasFunctionPrivilege("authenticated", "public.set_preferred_mode(text)"),
    serviceGet: await hasFunctionPrivilege("service_role", "public.get_preferred_mode()"),
    serviceSet: await hasFunctionPrivilege("service_role", "public.set_preferred_mode(text)"),
  };
  check(
    "RPCs de preferência são executáveis somente por authenticated",
    !functionPrivileges.anonGet &&
      !functionPrivileges.anonSet &&
      functionPrivileges.authenticatedGet &&
      functionPrivileges.authenticatedSet &&
      !functionPrivileges.serviceGet &&
      !functionPrivileges.serviceSet,
    JSON.stringify(functionPrivileges),
  );
  await expectError(
    "anon não consulta a RPC de preferência",
    () => anonClient.query(`select public.get_preferred_mode()`),
    "permission denied",
  );
  await expectError(
    "anon não altera a RPC de preferência",
    () => anonClient.query(`select public.set_preferred_mode('customer')`),
    "permission denied",
  );
  await expectError(
    "tentativa de assumir service_role é negada",
    () => customerAClient.query(`set role service_role`),
    "permission denied",
  );

  console.log("\n[isolamento por auth.uid()]");
  check(
    "usuário lê somente a própria preferência",
    (await customerAClient.query(`select * from public.account_preferences`)).rows.length === 0 &&
      (await customerAClient.query(
        `select * from public.account_preferences where user_id = $1`,
        [customerB],
      )).rows.length === 0,
  );
  check(
    "profiles preserva a identidade auth.users 1:1 e RLS privada",
    (await customerAClient.query(`select id from public.profiles`)).rows.length === 1 &&
      (await customerAClient.query(
        `select id from public.profiles where id = $1`,
        [customerB],
      )).rows.length === 0,
  );
  await expectError(
    "usuário não insere perfil para outra identidade",
    () => customerAClient.query(
      `insert into public.profiles (id, display_name) values ($1, 'perfil forjado')`,
      [customerB],
    ),
    "row-level security",
  );
  check(
    "owner só enxerga o provider que deriva de sua identidade",
    (await ownerAClient.query(`select id from public.providers`)).rows.length === 1 &&
      (await ownerAClient.query(
        `select id from public.providers where id = $1`,
        [providerB],
      )).rows.length === 0 &&
      (await ownerBClient.query(`select id from public.providers`)).rows.length === 1,
  );

  console.log("\n[RPC de preferência sem elevação de privilégio]");
  const initialMode = await customerAClient.query(
    `select public.get_preferred_mode() as mode`,
  );
  check("modo padrão de conta autenticada é Cliente", initialMode.rows[0].mode === "customer");

  const customerMode = await customerAClient.query(
    `select public.set_preferred_mode('customer') as mode`,
  );
  check("RPC salva somente a preferência Cliente do ator", customerMode.rows[0].mode === "customer");
  const customerPreference = (
    await customerAClient.query(
      `select user_id, preferred_mode from public.account_preferences`,
    )
  ).rows;
  check(
    "RLS retorna a preferência própria e oculta a de outra conta",
    customerPreference.length === 1 &&
      customerPreference[0].user_id === customerA &&
      customerPreference[0].preferred_mode === "customer" &&
      (await customerBClient.query(`select * from public.account_preferences`)).rows.length === 0,
  );
  check(
    "RPC de leitura devolve apenas o modo efetivo da própria conta",
    (
      await customerAClient.query(`select public.get_preferred_mode() as mode`)
    ).rows[0].mode === "customer" &&
      (
        await customerBClient.query(`select public.get_preferred_mode() as mode`)
      ).rows[0].mode === "customer",
  );
  await db.query(
    `update public.account_preferences set preferred_mode = 'provider' where user_id = $1`,
    [customerA],
  );
  check(
    "modo Profissional gravado sem ownership continua efetivamente Cliente",
    (
      await customerAClient.query(`select public.get_preferred_mode() as mode`)
    ).rows[0].mode === "customer",
  );
  await customerAClient.query(`select public.set_preferred_mode('customer')`);

  await expectError(
    "conta sem provider não ativa modo profissional",
    () => customerAClient.query(`select public.set_preferred_mode('provider')`),
    "provider_required",
  );
  check(
    "tentativa sem provider não grava preferência profissional",
    (
      await customerAClient.query(
        `select preferred_mode from public.account_preferences where user_id = $1`,
        [customerA],
      )
    ).rows[0].preferred_mode === "customer",
  );
  await expectError(
    "modo fora da allowlist é rejeitado",
    () => customerAClient.query(`select public.set_preferred_mode('admin')`),
    "invalid_preferred_mode",
  );

  await expectError(
    "authenticated não escreve diretamente na tabela privada",
    () => customerAClient.query(
      `insert into public.account_preferences (user_id, preferred_mode) values ($1, 'provider')`,
      [customerB],
    ),
    "permission denied",
  );
  await expectError(
    "authenticated não altera diretamente a preferência",
    () => customerAClient.query(
      `update public.account_preferences set preferred_mode = 'provider' where user_id = $1`,
      [customerA],
    ),
    "permission denied",
  );
  await expectError(
    "RPC não aceita user_id forjado",
    () => customerAClient.query(
      `select public.set_preferred_mode('provider', $1::uuid)`,
      [ownerA],
    ),
    "does not exist",
  );

  const providerMode = await ownerAClient.query(
    `select public.set_preferred_mode('provider') as mode`,
  );
  check(
    "owner com provider pode salvar e consultar a preferência Profissional",
    providerMode.rows[0].mode === "provider" &&
      (
        await ownerAClient.query(`select public.get_preferred_mode() as mode`)
      ).rows[0].mode === "provider",
  );
  check(
    "provider alheio não é aceito como identidade profissional",
    (
      await ownerAClient.query(
        `select owner_id from public.providers where id = $1`,
        [providerB],
      )
    ).rows.length === 0 &&
      (
        await ownerBClient.query(
          `select public.set_preferred_mode('provider') as mode`,
        )
      ).rows[0].mode === "provider",
  );

  const identityCounts = (
    await db.query(`
      select
        (select count(*)::integer from auth.users) as users,
        (select count(*)::integer from public.profiles) as profiles,
        (select count(*)::integer from public.providers) as providers
    `)
  ).rows[0];
  check(
    "criar providers não duplica auth.users nem remove profiles de cliente",
    identityCounts.users === 4 &&
      identityCounts.profiles === 4 &&
      identityCounts.providers === 2 &&
      (await ownerAClient.query(`select id from public.profiles`)).rows.length === 1,
    JSON.stringify(identityCounts),
  );

  const unsafeDefiners = (
    await db.query(`
      select p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('get_preferred_mode', 'set_preferred_mode')
         and p.prosecdef
         and not exists (
           select 1
             from unnest(coalesce(p.proconfig, '{}'::text[])) as setting
            where setting like 'search_path=%'
         )
    `)
  ).rows;
  check("RPC SECURITY DEFINER fixa search_path", unsafeDefiners.length === 0);

  console.log("\n[provisionamento de perfil e medição sem PII]");
  const freshUser = uuid();
  await db.query(`insert into auth.users (id) values ($1)`, [freshUser]);
  const freshClient = await asRole("authenticated", freshUser);

  const insertedProfile = (
    await freshClient.query(
      `insert into public.profiles (id, display_name)
       values ($1, 'Inicial')
       on conflict (id) do nothing
       returning display_name, phone`,
      [freshUser],
    )
  ).rows;
  check(
    "primeiro login insere perfil sob RLS com ON CONFLICT DO NOTHING",
    insertedProfile.length === 1 &&
      insertedProfile[0].display_name === "Inicial" &&
      insertedProfile[0].phone === null,
  );

  const conflictNoop = (
    await freshClient.query(
      `insert into public.profiles (id, display_name)
       values ($1, 'Tentativa de sobrescrita')
       on conflict (id) do nothing
       returning display_name, phone`,
      [freshUser],
    )
  ).rows;
  const preservedAfterConflict = (
    await freshClient.query(
      `select display_name, phone from public.profiles where id = $1`,
      [freshUser],
    )
  ).rows[0];
  check(
    "conflito concorrente não sobrescreve nome já salvo no perfil",
    conflictNoop.length === 0 && preservedAfterConflict.display_name === "Inicial",
  );

  await freshClient.query(
    `update public.profiles set display_name = null, phone = '47999990000' where id = $1`,
    [freshUser],
  );
  const casUpdated = (
    await freshClient.query(
      `update public.profiles
          set display_name = 'Backfill Provedor'
        where id = $1 and display_name is null
        returning display_name, phone`,
      [freshUser],
    )
  ).rows;
  const casSkipped = (
    await freshClient.query(
      `update public.profiles
          set display_name = 'Outro Nome'
        where id = $1 and display_name is null
        returning display_name, phone`,
      [freshUser],
    )
  ).rows;
  check(
    "guarda CAS preenche nome ausente apenas uma vez sob RLS",
    casUpdated.length === 1 &&
      casUpdated[0].display_name === "Backfill Provedor" &&
      casUpdated[0].phone === "47999990000" &&
      casSkipped.length === 0,
  );

  const iterations = 50;
  const legacyStart = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await freshClient.query(
      `select display_name from public.profiles where id = $1`,
      [freshUser],
    );
    await freshClient.query(
      `insert into public.profiles (id) values ($1)
       on conflict (id) do update set id = excluded.id`,
      [freshUser],
    );
    await freshClient.query(
      `select phone from public.profiles where id = $1`,
      [freshUser],
    );
  }
  const legacyTotalMs = performance.now() - legacyStart;

  const fastStart = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await freshClient.query(
      `select display_name, phone from public.profiles where id = $1`,
      [freshUser],
    );
  }
  const fastTotalMs = performance.now() - fastStart;

  console.log(
    `  info medição PostgreSQL local (${iterations} logins recorrentes, sem PII): sequência anterior 3 queries=${legacyTotalMs.toFixed(2)}ms (${(legacyTotalMs / iterations).toFixed(2)}ms/login) vs caminho rápido 1 SELECT=${fastTotalMs.toFixed(2)}ms (${(fastTotalMs / iterations).toFixed(2)}ms/login)`,
  );
  check(
    "caminho rápido de login recorrente é mais veloz que a sequência anterior em PostgreSQL real",
    fastTotalMs < legacyTotalMs,
    `legacy=${legacyTotalMs.toFixed(2)}ms fast=${fastTotalMs.toFixed(2)}ms`,
  );
} catch (error) {
  failed += 1;
  console.error("  FAIL erro não tratado no harness de identidade", error);
} finally {
  await Promise.allSettled(roleClients.map((client) => client.end()));
  if (db) await db.end().catch(() => undefined);
  if (admin) await admin.end().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
}

console.log(`\nresultado identidade: ${passed} passaram, ${failed} falharam`);
process.exitCode = failed === 0 ? 0 : 1;
