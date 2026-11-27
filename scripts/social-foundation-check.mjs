/**
 * Integração PostgreSQL da fundação de rollout social (#82).
 *
 * Aplica todas as migrations em ordem, valida nomenclatura, flags fail-closed,
 * grants, constraints, coortes e isolamento entre duas contas/providers. Usa
 * cluster efêmero separado para poder rodar depois do harness de booking.
 */
import os from "node:os";
import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const { Client } = pg;
const PORT = 55433;
const PASSWORD = "marcou-social-test";
const DATABASE = "marcou_social";

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

const databaseDir = path.join(os.tmpdir(), "marcou-social-pg-data");
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
  const migrationPattern = /^((?:\d{12}|\d{14}))_[a-z0-9_]+\.sql$/;
  const invalidNames = migrationNames.filter(
    (name) => !migrationPattern.test(name),
  );
  if (invalidNames.length > 0) {
    throw new Error(`migrations com nome inválido: ${invalidNames.join(", ")}`);
  }
  const prefixes = migrationNames.map(
    (name) => name.match(migrationPattern)?.[1],
  );
  const duplicatedPrefixes = prefixes.filter(
    (prefix, index) => prefixes.indexOf(prefix) !== index,
  );
  if (duplicatedPrefixes.length > 0) {
    throw new Error(
      `prefixos de migration duplicados: ${[...new Set(duplicatedPrefixes)].join(", ")}`,
    );
  }

  for (const name of migrationNames) {
    const sql = await readFile(path.join(migrationDirectory, name), "utf8");
    await db.query(sql);
    console.log(`aplicada: supabase/migrations/${name}`);
  }

  const uuid = () => crypto.randomUUID();
  const ownerA = uuid();
  const ownerB = uuid();
  await db.query(`insert into auth.users (id) values ($1), ($2)`, [ownerA, ownerB]);

  const providerA = (
    await db.query(
      `insert into public.providers (
         owner_id, slug, display_name, timezone, is_published
       ) values ($1, 'social-prov-a', 'Social A', 'America/Sao_Paulo', true)
       returning id`,
      [ownerA],
    )
  ).rows[0].id;
  const providerB = (
    await db.query(
      `insert into public.providers (
         owner_id, slug, display_name, timezone, is_published
       ) values ($1, 'social-prov-b', 'Social B', 'America/Sao_Paulo', true)
       returning id`,
      [ownerB],
    )
  ).rows[0].id;
  const serviceA = (
    await db.query(
      `insert into public.services (
         provider_id, name, duration_minutes, price_cents
       ) values ($1, 'Serviço compatível', 30, 5000)
       returning id`,
      [providerA],
    )
  ).rows[0].id;
  await db.query(
    `insert into public.availability_rules (
       provider_id, day_of_week, starts_at, ends_at
     ) values ($1, 2, '09:00', '12:00')`,
    [providerA],
  );

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

  const ownerAClient = await asRole("authenticated", ownerA);
  const ownerBClient = await asRole("authenticated", ownerB);
  const anonClient = await asRole("anon");
  const serviceRoleClient = await asRole("service_role");

  const accountFlag = async (client, providerId = null, flag = "social_profile") =>
    Boolean((
      await client.query(
        `select public.is_feature_enabled($1, $2::uuid) as enabled`,
        [flag, providerId],
      )
    ).rows[0].enabled);
  const publicFlag = async (flag = "social_profile") =>
    Boolean((
      await anonClient.query(
        `select public.is_public_feature_enabled($1) as enabled`,
        [flag],
      )
    ).rows[0].enabled);

  console.log("\n[permissões de funções SECURITY DEFINER]");

  const publicDefinerGrants = (
    await db.query(`
      select distinct p.oid::regprocedure::text as signature
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(
          coalesce(p.proacl, acldefault('f', p.proowner))
        ) acl
       where n.nspname = 'public'
         and p.prosecdef
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
       order by signature
    `)
  ).rows.map((row) => row.signature);
  check(
    "nenhuma função definer herda EXECUTE de PUBLIC",
    publicDefinerGrants.length === 0,
    publicDefinerGrants.join(", "),
  );

  const grantExpectations = [
    {
      label: "expiração em lote é exclusiva de service_role",
      signature: "public.expire_stale_bookings()",
      roles: { anon: false, authenticated: false, service_role: true },
    },
    {
      label: "lembretes em lote são exclusivos de service_role",
      signature: "public.create_booking_reminders(integer)",
      roles: { anon: false, authenticated: false, service_role: true },
    },
    {
      label: "criação de reserva exige autenticação",
      signature: "public.create_booking(text,uuid,timestamptz,text,text,text)",
      roles: { anon: false, authenticated: true },
    },
    {
      label: "transição de reserva exige autenticação",
      signature: "public.transition_booking(uuid,text,text)",
      roles: { anon: false, authenticated: true },
    },
    {
      label: "agenda permanece pública",
      signature: "public.get_provider_schedule(text,uuid,date,timestamptz,timestamptz)",
      roles: { anon: true, authenticated: true },
    },
    {
      label: "marcar notificação exige autenticação",
      signature: "public.mark_notification_read(uuid)",
      roles: { anon: false, authenticated: true },
    },
    {
      label: "marcar todas notificações exige autenticação",
      signature: "public.mark_all_notifications_read()",
      roles: { anon: false, authenticated: true },
    },
    {
      label: "helper de intervalo não é API de cliente",
      signature: "public.is_interval_available(uuid,timestamptz,timestamptz)",
      roles: { anon: false, authenticated: false },
    },
    {
      label: "helper de payload não é API de cliente",
      signature: "public.notification_payloads(text,public.bookings,public.providers,text)",
      roles: { anon: false, authenticated: false },
    },
    {
      label: "função de trigger não é API de cliente",
      signature: "public.notify_on_booking_event()",
      roles: { anon: false, authenticated: false },
    },
    {
      label: "status de aceite exige autenticação",
      signature: "public.has_current_legal_acceptances()",
      roles: { anon: false, authenticated: true },
    },
    {
      label: "pendências legais exigem autenticação",
      signature: "public.get_pending_legal_documents()",
      roles: { anon: false, authenticated: true },
    },
    {
      label: "registro de aceite exige autenticação",
      signature: "public.record_legal_acceptances(jsonb)",
      roles: { anon: false, authenticated: true },
    },
    {
      label: "flag segmentada exige autenticação",
      signature: "public.is_feature_enabled(text,uuid)",
      roles: { anon: false, authenticated: true },
    },
    {
      label: "flag pública preserva leitura anônima",
      signature: "public.is_public_feature_enabled(text)",
      roles: { anon: true, authenticated: true },
    },
  ];

  for (const expectation of grantExpectations) {
    const observed = {};
    for (const [role, expected] of Object.entries(expectation.roles)) {
      observed[role] = Boolean((
        await db.query(
          `select has_function_privilege($1, $2, 'EXECUTE') as allowed`,
          [role, expectation.signature],
        )
      ).rows[0].allowed);
      if (observed[role] !== expected) break;
    }
    check(
      expectation.label,
      Object.entries(expectation.roles).every(
        ([role, expected]) => observed[role] === expected,
      ),
      `${expectation.signature}: ${JSON.stringify(observed)}`,
    );
  }

  await expectError(
    "anon não dispara job de expiração",
    () => anonClient.query(`select public.expire_stale_bookings()`),
    "permission denied",
  );
  await expectError(
    "authenticated não dispara geração de lembretes",
    () => ownerAClient.query(`select public.create_booking_reminders(24)`),
    "permission denied",
  );
  const serviceExpireResult = await serviceRoleClient.query(
    `select public.expire_stale_bookings()`,
  );
  const serviceReminderResult = await serviceRoleClient.query(
    `select public.create_booking_reminders(24)`,
  );
  check(
    "service_role executa os dois jobs autorizados",
    serviceExpireResult.rowCount === 1 && serviceReminderResult.rowCount === 1,
  );

  console.log("\n[fundação de rollout social]");

  const seededFlags = (
    await db.query(`
      select count(*)::integer as count,
             bool_and(
               not is_enabled
               and rollout_percentage = 0
               and cardinality(enabled_environments) = 0
             ) as fail_closed
        from public.feature_flags
    `)
  ).rows[0];
  check(
    "sete módulos sociais começam desativados",
    seededFlags.count === 7 && seededFlags.fail_closed === true,
    JSON.stringify(seededFlags),
  );
  check(
    "duas contas recebem false por padrão",
    !(await accountFlag(ownerAClient)) && !(await accountFlag(ownerBClient)),
  );
  check("superfície pública começa desativada", !(await publicFlag()));

  await expectError(
    "ambiente arbitrário é rejeitado no banco",
    () => db.query(`
      update public.app_runtime_config
         set deployment_environment = 'browser-forjado'
       where singleton = true
    `),
    "app_runtime_config_deployment_environment_check",
  );
  await expectError(
    "override exige exatamente um tipo de alvo",
    () => db.query(
      `insert into public.feature_flag_overrides (
         flag_key, user_id, provider_id, is_enabled, reason
       ) values (
         'social_profile', $1, $2, true, 'alvos conflitantes criados pelo teste'
       )`,
      [ownerA, providerA],
    ),
    "feature_flag_override_one_subject",
  );
  await expectError(
    "anon não executa avaliação segmentada",
    () => anonClient.query(
      `select public.is_feature_enabled('social_profile', null::uuid)`,
    ),
    "permission denied",
  );
  await expectError(
    "authenticated não lê configuração privada",
    () => ownerAClient.query(`select * from public.feature_flags`),
    "permission denied",
  );
  await expectError(
    "authenticated não forja override",
    () => ownerAClient.query(
      `insert into public.feature_flag_overrides (
         flag_key, user_id, is_enabled, reason
       ) values ('social_profile', $1, true, 'override forjado pelo navegador')`,
      [ownerA],
    ),
    "permission denied",
  );

  const functionPrivileges = (
    await db.query(`
      select
        has_function_privilege(
          'authenticated',
          'public.is_feature_enabled(text,uuid)',
          'EXECUTE'
        ) as authenticated_segmented,
        has_function_privilege(
          'anon',
          'public.is_feature_enabled(text,uuid)',
          'EXECUTE'
        ) as anon_segmented,
        has_function_privilege(
          'anon',
          'public.is_public_feature_enabled(text)',
          'EXECUTE'
        ) as anon_public
    `)
  ).rows[0];
  check(
    "grants separam avaliação autenticada e pública",
    functionPrivileges.authenticated_segmented === true &&
      functionPrivileges.anon_segmented === false &&
      functionPrivileges.anon_public === true,
    JSON.stringify(functionPrivileges),
  );

  await db.query(`
    update public.app_runtime_config
       set deployment_environment = 'test', updated_at = now()
     where singleton = true;
    update public.feature_flags
       set is_enabled = true,
           enabled_environments = array['test'],
           rollout_percentage = 0,
           updated_at = now()
     where flag_key = 'social_profile';
  `);
  check(
    "rollout zero permanece fechado sem override",
    !(await accountFlag(ownerAClient)) && !(await accountFlag(ownerBClient)),
  );

  await db.query(
    `insert into public.feature_flag_overrides (
       flag_key, user_id, is_enabled, reason
     ) values ('social_profile', $1, true, 'coorte interna de teste automatizado')`,
    [ownerA],
  );
  check(
    "override de usuário não vaza para segunda conta",
    (await accountFlag(ownerAClient)) && !(await accountFlag(ownerBClient)),
  );
  await db.query(
    `delete from public.feature_flag_overrides
      where flag_key = 'social_profile' and user_id = $1`,
    [ownerA],
  );

  await db.query(
    `insert into public.feature_flag_overrides (
       flag_key, user_id, is_enabled, reason, created_at, expires_at
     ) values (
       'social_profile', $1, true,
       'override expirado criado pelo teste automatizado',
       now() - interval '2 hours', now() - interval '1 hour'
     )`,
    [ownerA],
  );
  check("override expirado é ignorado", !(await accountFlag(ownerAClient)));
  await db.query(
    `delete from public.feature_flag_overrides
      where flag_key = 'social_profile' and user_id = $1`,
    [ownerA],
  );

  await db.query(
    `insert into public.feature_flag_overrides (
       flag_key, provider_id, is_enabled, reason
     ) values
       ('social_profile', $1, true, 'piloto do primeiro prestador de teste'),
       ('social_profile', $2, true, 'piloto do segundo prestador de teste')`,
    [providerA, providerB],
  );
  check(
    "cada owner avalia a coorte do próprio prestador",
    (await accountFlag(ownerAClient, providerA)) &&
      (await accountFlag(ownerBClient, providerB)),
  );
  check(
    "provider alheio não concede acesso à coorte",
    !(await accountFlag(ownerAClient, providerB)) &&
      !(await accountFlag(ownerBClient, providerA)),
  );
  await db.query(
    `update public.feature_flag_overrides
        set is_enabled = false, updated_at = now()
      where flag_key = 'social_profile' and provider_id = $1`,
    [providerB],
  );
  check(
    "override negativo exclui somente o provider alvo",
    (await accountFlag(ownerAClient, providerA)) &&
      !(await accountFlag(ownerBClient, providerB)),
  );
  await db.query(
    `delete from public.feature_flag_overrides where flag_key = 'social_profile'`,
  );

  await db.query(`
    update public.feature_flags
       set rollout_percentage = 47, updated_at = now()
     where flag_key = 'social_profile'
  `);
  const firstBucket = await accountFlag(ownerAClient);
  const repeatedBucket = await accountFlag(ownerAClient);
  check(
    "bucket percentual é determinístico para a mesma conta",
    firstBucket === repeatedBucket,
  );

  await db.query(`
    update public.feature_flags
       set rollout_percentage = 100, updated_at = now()
     where flag_key = 'social_profile'
  `);
  await db.query(
    `insert into public.feature_flag_overrides (
       flag_key, user_id, is_enabled, reason
     ) values ('social_profile', $1, false, 'exclusão segura durante piloto automatizado')`,
    [ownerA],
  );
  check(
    "override negativo prevalece sobre rollout total",
    !(await accountFlag(ownerAClient)) && (await accountFlag(ownerBClient)),
  );
  check("anon só acessa rollout total", await publicFlag());

  await db.query(`
    update public.feature_flags
       set rollout_percentage = 99, updated_at = now()
     where flag_key = 'social_profile'
  `);
  check(
    "rollout parcial não cria coorte anônima controlável",
    !(await publicFlag()),
  );
  check(
    "flag desconhecida falha fechada",
    !(await accountFlag(ownerBClient, null, "social_unknown")),
  );

  await db.query(`
    update public.app_runtime_config
       set deployment_environment = 'production', updated_at = now()
     where singleton = true
  `);
  check(
    "ambiente fora da allowlist desliga inclusive overrides",
    !(await accountFlag(ownerBClient)) && !(await publicFlag()),
  );

  const privateTables = [
    "app_runtime_config",
    "feature_flags",
    "feature_flag_overrides",
  ];
  const leakedPrivileges = [];
  for (const role of ["anon", "authenticated"]) {
    for (const table of privateTables) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const allowed = (
          await db.query(
            `select has_table_privilege($1, $2, $3) as allowed`,
            [role, `public.${table}`, privilege],
          )
        ).rows[0].allowed;
        if (allowed) leakedPrivileges.push(`${role}:${table}.${privilege}`);
      }
    }
  }
  check(
    "configuração privada não concede privilégios ao navegador",
    leakedPrivileges.length === 0,
    leakedPrivileges.join(", "),
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
    "todas as tabelas públicas continuam com RLS",
    tablesWithoutRls.length === 0,
    tablesWithoutRls.join(", "),
  );

  const unsafeDefiners = (
    await db.query(`
      select p.proname
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prosecdef
         and not exists (
           select 1
             from unnest(coalesce(p.proconfig, '{}'::text[])) as setting
            where setting like 'search_path=%'
         )
       order by p.proname
    `)
  ).rows.map((row) => row.proname);
  check(
    "funções SECURITY DEFINER mantêm search_path fixo",
    unsafeDefiners.length === 0,
    unsafeDefiners.join(", "),
  );

  await db.query(`
    delete from public.feature_flag_overrides where flag_key = 'social_profile';
    update public.feature_flags
       set is_enabled = false,
           enabled_environments = '{}'::text[],
           rollout_percentage = 0,
           updated_at = now()
     where flag_key = 'social_profile';
    update public.app_runtime_config
       set deployment_environment = 'local', updated_at = now()
     where singleton = true;
  `);

  const bookingAfterHardening = (
    await ownerBClient.query(
      `select * from public.create_booking(
         'social-prov-a',
         $1::uuid,
         '2026-12-01T12:00:00Z'::timestamptz,
         'Cliente ACL',
         '47999999999',
         $2
       )`,
      [serviceA, `acl-${crypto.randomUUID()}`],
    )
  ).rows[0];
  check(
    "booking autenticado continua funcional após hardening",
    bookingAfterHardening?.status === "pending_payment",
  );
  const bookingNotifications = (
    await db.query(
      `select id, recipient_id
         from public.notifications
        where booking_id = $1
        order by recipient_id`,
      [bookingAfterHardening.id],
    )
  ).rows;
  check(
    "trigger interno continua gerando notificações",
    bookingNotifications.length === 2 &&
      bookingNotifications.some((row) => row.recipient_id === ownerA) &&
      bookingNotifications.some((row) => row.recipient_id === ownerB),
    `obteve ${bookingNotifications.length}`,
  );
  const customerNotification = bookingNotifications.find(
    (row) => row.recipient_id === ownerB,
  );
  let markedNotification = null;
  if (customerNotification) {
    markedNotification = (
      await ownerBClient.query(
        `select * from public.mark_notification_read($1)`,
        [customerNotification.id],
      )
    ).rows[0];
  }
  check(
    "RPC autenticada de notificação continua funcional",
    markedNotification?.read_at != null,
  );

  const publicProvider = await anonClient.query(
    `select id from public.providers where slug = 'social-prov-a'`,
  );
  const schedule = await anonClient.query(
    `select public.get_provider_schedule(
       'social-prov-a', $1::uuid, '2026-12-01'::date,
       '2026-12-01T00:00:00Z'::timestamptz, '2026-12-02T00:00:00Z'::timestamptz
     ) as value`,
    [serviceA],
  );
  check(
    "flags desligadas preservam provider e agenda públicos atuais",
    publicProvider.rows.length === 1 &&
      schedule.rows[0].value?.timezone === "America/Sao_Paulo",
  );
} catch (error) {
  failed += 1;
  console.error("  FAIL erro não tratado no harness social", error);
} finally {
  await Promise.allSettled(roleClients.map((client) => client.end()));
  if (db) await db.end().catch(() => undefined);
  if (admin) await admin.end().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
}

console.log(`\nresultado social: ${passed} passaram, ${failed} falharam`);
process.exitCode = failed === 0 ? 0 : 1;
