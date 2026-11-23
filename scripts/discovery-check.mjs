/**
 * Integração PostgreSQL da taxonomia e áreas de atendimento (#87).
 *
 * Aplica todas as migrations em um cluster efêmero e comprova constraints,
 * versionamento, filtros, grants, RLS multi-tenant e projeção pública sem
 * endereço exato.
 */
import os from "node:os";
import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const { Client } = pg;
const PORT = 55434;
const PASSWORD = "marcou-discovery-test";
const DATABASE = "marcou_discovery";
const DEFAULT_CATEGORY = "10000000-0000-4000-8000-000000000001";
const BEAUTY_CATEGORY = "10000000-0000-4000-8000-000000000010";

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

async function expectError(name, operation, expectedPart) {
  try {
    await operation();
    check(name, false, "(não lançou erro)");
  } catch (error) {
    const text = String(error?.message ?? error);
    check(
      name,
      text.includes(expectedPart),
      `esperava "${expectedPart}", obteve "${text}"`,
    );
  }
}

const databaseDir = path.join(os.tmpdir(), "marcou-discovery-pg-data");
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
       ) values ($1, 'discovery-a', 'Discovery A', 'America/Sao_Paulo', true)
       returning id`,
      [ownerA],
    )
  ).rows[0].id;
  await db.query(
    `insert into public.providers (
       owner_id, slug, display_name, timezone, is_published
     ) values ($1, 'discovery-b', 'Discovery B', 'America/Sao_Paulo', false)`,
    [ownerB],
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
  const ownerAConcurrentClient = await asRole("authenticated", ownerA);
  const ownerBClient = await asRole("authenticated", ownerB);
  const anonClient = await asRole("anon");

  console.log("\n[taxonomia versionada]");

  const catalog = await anonClient.query(`
    select id, parent_id, stable_key, version, name
      from public.service_category_catalog
     order by stable_key
  `);
  check(
    "catálogo inicial publica raízes e subcategorias",
    catalog.rows.length === 8 &&
      catalog.rows.some((row) => row.stable_key === "cabelo" && row.parent_id),
    `obteve ${catalog.rows.length}`,
  );

  const legacyService = (
    await ownerAClient.query(
      `insert into public.services (
         provider_id, name, duration_minutes, price_cents
       ) values ($1, 'Serviço legado', 45, 8000)
       returning id, category_id, delivery_modes::text[] as delivery_modes`,
      [providerA],
    )
  ).rows[0];
  check(
    "cliente antigo recebe fallback compatível",
    legacyService.category_id === DEFAULT_CATEGORY &&
      legacyService.delivery_modes.length === 1 &&
      legacyService.delivery_modes[0] === "provider_location",
    JSON.stringify(legacyService),
  );

  await expectError(
    "modalidades duplicadas são rejeitadas",
    () => ownerAClient.query(
      `insert into public.services (
         provider_id, category_id, delivery_modes, name,
         duration_minutes, price_cents
       ) values (
         $1, $2,
         array['remote', 'remote']::public.service_delivery_mode[],
         'Modalidade repetida', 30, 5000
       )`,
      [providerA, BEAUTY_CATEGORY],
    ),
    "services_delivery_modes_unique",
  );

  const draftCategory = uuid();
  await db.query(
    `insert into public.service_categories (id, stable_key, status)
     values ($1, 'categoria-em-revisao', 'draft')`,
    [draftCategory],
  );
  await db.query(
    `insert into public.service_category_versions (
       category_id, version, name, description, is_current
     ) values (
       $1, 1, 'Categoria em revisão',
       'Categoria criada apenas para testar moderação.', true
     )`,
    [draftCategory],
  );
  await expectError(
    "serviço não usa categoria ainda não publicada",
    () => ownerAClient.query(
      `insert into public.services (
         provider_id, category_id, name, duration_minutes, price_cents
       ) values ($1, $2, 'Categoria forjada', 30, 5000)`,
      [providerA, draftCategory],
    ),
    "service_category_not_published",
  );

  await db.query(`
    update public.service_category_versions
       set is_current = false
     where category_id = '${BEAUTY_CATEGORY}' and is_current;
    insert into public.service_category_versions (
      category_id, version, name, description, is_current
    ) values (
      '${BEAUTY_CATEGORY}', 2, 'Beleza e autocuidado',
      'Versão atualizada sem trocar a identidade estável da categoria.', true
    );
  `);
  const categoryHistory = await db.query(
    `select version, name, is_current
       from public.service_category_versions
      where category_id = $1
      order by version`,
    [BEAUTY_CATEGORY],
  );
  const currentCategory = await anonClient.query(
    `select version, name
       from public.service_category_catalog
      where id = $1`,
    [BEAUTY_CATEGORY],
  );
  check(
    "nova versão preserva histórico e atualiza a projeção corrente",
    categoryHistory.rows.length === 2 &&
      categoryHistory.rows[0].is_current === false &&
      currentCategory.rows[0]?.version === 2 &&
      currentCategory.rows[0]?.name === "Beleza e autocuidado",
  );

  await expectError(
    "alias normalizado não pode apontar para duas categorias",
    () => db.query(
      `insert into public.service_category_aliases (category_id, alias)
       values ($1, 'BELEZA')`,
      [DEFAULT_CATEGORY],
    ),
    "service_category_aliases_locale_normalized_alias_key",
  );

  console.log("\n[áreas, modalidades e filtros]");

  await expectError(
    "atendimento no cliente exige área cadastrada",
    () => ownerAClient.query(
      `insert into public.services (
         provider_id, category_id, delivery_modes, name,
         duration_minutes, price_cents
       ) values (
         $1, $2,
         array['customer_location']::public.service_delivery_mode[],
         'Atendimento sem área', 30, 5000
       )`,
      [providerA, BEAUTY_CATEGORY],
    ),
    "customer_location_requires_service_area",
  );

  const areaA = (
    await ownerAClient.query(
      `insert into public.provider_service_areas (
         provider_id, state_code, city_name, precision, source
       ) values ($1, 'SC', 'Itajai', 'city', 'provider_declared')
       returning id, city_key`,
      [providerA],
    )
  ).rows[0];
  check("cidade gera chave normalizada de filtro", areaA.city_key === "itajai");

  await expectError(
    "browser não forja fonte verificada da área",
    () => ownerAClient.query(
      `insert into public.provider_service_areas (
         provider_id, state_code, city_name, precision, source
       ) values ($1, 'SC', 'Navegantes', 'city', 'ibge_catalog')`,
      [providerA],
    ),
    "row-level security",
  );
  await expectError(
    "campo público de cidade não aceita formato de endereço exato",
    () => ownerAClient.query(
      `insert into public.provider_service_areas (
         provider_id, state_code, city_name, precision
       ) values ($1, 'SC', 'Rua Exemplo, 123', 'city')`,
      [providerA],
    ),
    "provider_service_area_city_is_not_address",
  );
  await expectError(
    "abreviação de logradouro também é rejeitada",
    () => ownerAClient.query(
      `insert into public.provider_service_areas (
         provider_id, state_code, city_name, precision
       ) values ($1, 'SC', 'R. das Flores', 'city')`,
      [providerA],
    ),
    "provider_service_area_city_is_not_address",
  );
  await expectError(
    "número residencial não pode ser disfarçado como bairro",
    () => ownerAClient.query(
      `insert into public.provider_service_areas (
         provider_id, state_code, city_name, neighborhood_name, precision
       ) values ($1, 'SC', 'Navegantes', 'Centro 123', 'neighborhood')`,
      [providerA],
    ),
    "provider_service_area_neighborhood_is_not_address",
  );

  await expectError(
    "área duplicada é bloqueada após normalização",
    () => ownerAClient.query(
      `insert into public.provider_service_areas (
         provider_id, state_code, city_name, precision
       ) values ($1, 'SC', 'ITAJAI', 'city')`,
      [providerA],
    ),
    "provider_service_area_unique_idx",
  );

  await expectError(
    "precisão de cidade não aceita bairro escondido",
    () => ownerAClient.query(
      `insert into public.provider_service_areas (
         provider_id, state_code, city_name, neighborhood_name, precision
       ) values ($1, 'SC', 'Navegantes', 'Centro', 'city')`,
      [providerA],
    ),
    "provider_service_area_shape",
  );
  await expectError(
    "precisão de raio exige distância aproximada",
    () => ownerAClient.query(
      `insert into public.provider_service_areas (
         provider_id, state_code, city_name, precision
       ) values ($1, 'SC', 'Navegantes', 'radius')`,
      [providerA],
    ),
    "provider_service_area_shape",
  );

  const customerService = (
    await ownerAClient.query(
      `insert into public.services (
         provider_id, category_id, delivery_modes, name,
         duration_minutes, price_cents
       ) values (
         $1, $2,
         array['provider_location', 'customer_location']::public.service_delivery_mode[],
         'Serviço móvel', 60, 12000
       ) returning id`,
      [providerA, BEAUTY_CATEGORY],
    )
  ).rows[0].id;
  check("área ativa habilita modalidade no cliente", Boolean(customerService));

  const filterResult = await db.query(
    `select distinct service.id
       from public.services service
       join public.provider_service_areas area
         on area.provider_id = service.provider_id
        and area.is_active
      where service.delivery_modes @>
              array['customer_location']::public.service_delivery_mode[]
        and area.state_code = 'SC'
        and area.city_key = public.normalize_discovery_key('ITAJAI')`,
  );
  check(
    "modalidade e região são filtráveis em conjunto",
    filterResult.rows.some((row) => row.id === customerService),
  );

  await expectError(
    "última área usada não pode ser removida",
    () => ownerAClient.query(
      `delete from public.provider_service_areas where id = $1`,
      [areaA.id],
    ),
    "service_area_in_use_by_customer_location",
  );

  const areaB = (
    await ownerAClient.query(
      `insert into public.provider_service_areas (
         provider_id, state_code, city_name, neighborhood_name,
         precision, radius_km
       ) values ($1, 'SC', 'Balneário Camboriú', 'Centro', 'radius', 20)
       returning id`,
      [providerA],
    )
  ).rows[0].id;
  const removedArea = await ownerAClient.query(
    `delete from public.provider_service_areas where id = $1 returning id`,
    [areaA.id],
  );
  check(
    "uma segunda área permite remover a anterior sem quebrar serviços",
    removedArea.rows[0]?.id === areaA.id && Boolean(areaB),
  );

  // Reproduz a corrida entre ativar um serviço móvel e apagar a última área.
  // Os dois triggers precisam serializar pelo mesmo provider para que ambas as
  // transações não confirmem com snapshots incompatíveis.
  await ownerAClient.query(
    `update public.services set is_active = false where id = $1`,
    [customerService],
  );
  await ownerAClient.query("begin");
  await ownerAClient.query(
    `update public.services set is_active = true where id = $1`,
    [customerService],
  );
  await ownerAConcurrentClient.query("begin");
  const concurrentAreaDeletion = ownerAConcurrentClient.query(
    `delete from public.provider_service_areas where id = $1`,
    [areaB],
  );
  await new Promise((resolve) => setTimeout(resolve, 75));
  const lockState = (
    await db.query(
      `select wait_event_type, wait_event
         from pg_stat_activity
        where pid = $1`,
      [ownerAConcurrentClient.processID],
    )
  ).rows[0];
  check(
    "remoção concorrente aguarda a validação do mesmo prestador",
    lockState?.wait_event_type === "Lock",
    JSON.stringify(lockState),
  );
  await ownerAClient.query("commit");
  await expectError(
    "corrida não deixa serviço móvel ativo sem área",
    () => concurrentAreaDeletion,
    "service_area_in_use_by_customer_location",
  );
  await ownerAConcurrentClient.query("rollback");
  const concurrentInvariant = (
    await db.query(
      `select
         exists(select 1 from public.services where id = $1 and is_active) as service_active,
         exists(select 1 from public.provider_service_areas where id = $2 and is_active) as area_active`,
      [customerService, areaB],
    )
  ).rows[0];
  check(
    "estado confirmado mantém serviço e área compatíveis",
    concurrentInvariant.service_active && concurrentInvariant.area_active,
    JSON.stringify(concurrentInvariant),
  );

  const forbiddenColumns = (
    await db.query(`
      select column_name
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'provider_service_areas'
         and column_name = any(array[
           'street', 'street_name', 'address', 'address_line', 'house_number',
           'postal_code', 'zip_code', 'latitude', 'longitude', 'coordinates'
         ])
    `)
  ).rows.map((row) => row.column_name);
  check(
    "área não possui coluna para endereço residencial exato",
    forbiddenColumns.length === 0,
    forbiddenColumns.join(", "),
  );

  console.log("\n[moderação e isolamento]");

  await expectError(
    "sugestão exige justificativa mesmo fora da action do painel",
    () => ownerAClient.query(
      `insert into public.service_category_suggestions (
         provider_id, proposed_name, rationale
       ) values ($1, 'Sugestão sem contexto', null)`,
      [providerA],
    ),
    "not-null constraint",
  );

  const suggestion = (
    await ownerAClient.query(
      `insert into public.service_category_suggestions (
         provider_id, proposed_name, rationale
       ) values (
         $1, 'Fotografia de eventos',
         'Categoria para cobertura profissional de festas e cerimônias.'
       ) returning id, status, submitted_by`,
      [providerA],
    )
  ).rows[0];
  check(
    "sugestão nasce pendente e deriva o autor autenticado",
    suggestion.status === "pending" && suggestion.submitted_by === ownerA,
  );

  await expectError(
    "navegador não aprova a própria sugestão",
    () => ownerAClient.query(
      `insert into public.service_category_suggestions (
         provider_id, proposed_name, rationale, status,
         reviewed_at, moderation_note
       ) values (
         $1, 'Categoria autoaprovada',
         'Tentativa de ignorar a fila de moderação.', 'approved', now(),
         'Aprovação forjada pelo próprio prestador.'
       )`,
      [providerA],
    ),
    "row-level security",
  );

  await expectError(
    "owner não sugere em nome de outro prestador",
    () => ownerBClient.query(
      `insert into public.service_category_suggestions (
         provider_id, proposed_name, rationale
       ) values (
         $1, 'Sugestão alheia',
         'Tentativa de gravar no tenant de outro prestador.'
       )`,
      [providerA],
    ),
    "row-level security",
  );

  const otherOwnerSuggestions = await ownerBClient.query(
    `select id from public.service_category_suggestions where provider_id = $1`,
    [providerA],
  );
  const otherOwnerAreas = await ownerBClient.query(
    `select id from public.provider_service_areas where provider_id = $1`,
    [providerA],
  );
  check(
    "segundo tenant não lê sugestões nem áreas do primeiro",
    otherOwnerSuggestions.rows.length === 0 && otherOwnerAreas.rows.length === 0,
  );

  await expectError(
    "anon não enumera tabela de áreas diretamente",
    () => anonClient.query(`select * from public.provider_service_areas`),
    "permission denied",
  );

  console.log("\n[projeção pública mínima]");

  const disabledProjection = await anonClient.query(
    `select public.get_public_provider_discovery('discovery-a') as value`,
  );
  check(
    "flag desligada fecha a projeção pública",
    disabledProjection.rows[0].value === null,
  );

  await db.query(`
    update public.app_runtime_config
       set deployment_environment = 'test', updated_at = now()
     where singleton = true;
    update public.feature_flags
       set is_enabled = true,
           enabled_environments = array['test'],
           rollout_percentage = 100,
           updated_at = now()
     where flag_key = 'social_discovery';
  `);

  const invalidSlugProjection = await anonClient.query(
    `select public.get_public_provider_discovery('discovery-a/../segredo') as value`,
  );
  check(
    "RPC pública rejeita slug fora do contrato antes da consulta",
    invalidSlugProjection.rows[0].value === null,
  );

  const publicProjection = (
    await anonClient.query(
      `select public.get_public_provider_discovery('discovery-a') as value`,
    )
  ).rows[0].value;
  check(
    "RPC pública retorna somente serviço ativo e área aproximada",
    publicProjection?.services?.some(
      (service) =>
        service.serviceId === customerService &&
        service.deliveryModes.includes("customer_location") &&
        service.category.version === 2,
    ) &&
      publicProjection?.serviceAreas?.length === 1 &&
      publicProjection.serviceAreas[0].city === "Balneário Camboriú" &&
      publicProjection.serviceAreas[0].radiusKm === 20,
    JSON.stringify(publicProjection),
  );

  const serializedProjection = JSON.stringify(publicProjection).toLowerCase();
  const forbiddenPublicKeys = [
    "id",
    "owner_id",
    "source",
    "city_key",
    "ibge",
    "created_at",
    "updated_at",
    "street",
    "address",
    "postal",
    "latitude",
    "longitude",
  ].filter((key) => serializedProjection.includes(`\"${key}\"`));
  check(
    "projeção não contém metadado privado ou endereço exato",
    forbiddenPublicKeys.length === 0,
    forbiddenPublicKeys.join(", "),
  );

  const hiddenProjection = await anonClient.query(
    `select public.get_public_provider_discovery('discovery-b') as value`,
  );
  check(
    "prestador não publicado não possui projeção pública",
    hiddenProjection.rows[0].value === null,
  );

  console.log("\n[compatibilidade, índices e grants]");

  await db.query(
    `update public.service_categories set status = 'retired' where id = $1`,
    [DEFAULT_CATEGORY],
  );
  const updatedLegacy = await ownerAClient.query(
    `update public.services
        set name = 'Serviço legado preservado'
      where id = $1
      returning id, category_id`,
    [legacyService.id],
  );
  check(
    "aposentar categoria não invalida serviço histórico",
    updatedLegacy.rows[0]?.category_id === DEFAULT_CATEGORY,
  );
  await expectError(
    "categoria referenciada não pode ser apagada",
    () => db.query(`delete from public.service_categories where id = $1`, [DEFAULT_CATEGORY]),
    "services_category_id_fkey",
  );
  await db.query(
    `update public.service_categories set status = 'published' where id = $1`,
    [DEFAULT_CATEGORY],
  );

  const expectedIndexes = [
    "provider_service_area_unique_idx",
    "provider_service_area_city_filter_idx",
    "provider_service_area_neighborhood_filter_idx",
    "services_category_active_idx",
    "services_delivery_modes_idx",
  ];
  const observedIndexes = (
    await db.query(
      `select indexname
         from pg_indexes
        where schemaname = 'public'
          and indexname = any($1::text[])`,
      [expectedIndexes],
    )
  ).rows.map((row) => row.indexname);
  check(
    "índices cobrem duplicidade e filtros planejados",
    expectedIndexes.every((index) => observedIndexes.includes(index)),
    observedIndexes.join(", "),
  );

  const grants = (
    await db.query(`
      select
        has_function_privilege(
          'anon', 'public.get_public_provider_discovery(text)', 'EXECUTE'
        ) as anon_projection,
        has_function_privilege(
          'authenticated',
          'public.validate_service_discovery_configuration()', 'EXECUTE'
        ) as browser_validator,
        has_function_privilege(
          'authenticated',
          'public.protect_last_customer_service_area()', 'EXECUTE'
        ) as browser_area_guard,
        has_table_privilege(
          'anon', 'public.provider_service_areas', 'SELECT'
        ) as anon_area_table
    `)
  ).rows[0];
  check(
    "grants expõem só a projeção e mantêm helpers internos",
    grants.anon_projection === true &&
      grants.browser_validator === false &&
      grants.browser_area_guard === false &&
      grants.anon_area_table === false,
    JSON.stringify(grants),
  );

  const newTables = [
    "service_categories",
    "service_category_versions",
    "service_category_aliases",
    "service_category_suggestions",
    "provider_service_areas",
  ];
  const tablesWithoutRls = (
    await db.query(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = any($1::text[])
          and not c.relrowsecurity`,
      [newTables],
    )
  ).rows.map((row) => row.relname);
  check(
    "todas as novas tabelas mantêm RLS habilitada",
    tablesWithoutRls.length === 0,
    tablesWithoutRls.join(", "),
  );

  const publicDefinerGrants = (
    await db.query(`
      select p.oid::regprocedure::text as signature
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(
          coalesce(p.proacl, acldefault('f', p.proowner))
        ) acl
       where n.nspname = 'public'
         and p.prosecdef
         and acl.grantee = 0
       order by signature
    `)
  ).rows.map((row) => row.signature);
  check(
    "nenhuma função definer nova herda EXECUTE de PUBLIC",
    publicDefinerGrants.length === 0,
    publicDefinerGrants.join(", "),
  );
} catch (error) {
  failed += 1;
  console.error("  FAIL erro não tratado no harness de descoberta", error);
} finally {
  await Promise.allSettled(roleClients.map((client) => client.end()));
  if (db) await db.end().catch(() => undefined);
  if (admin) await admin.end().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
}

console.log(`\nresultado discovery: ${passed} passaram, ${failed} falharam`);
process.exitCode = failed === 0 ? 0 : 1;
