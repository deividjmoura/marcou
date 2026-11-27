# Fundação de schema, rollout e RLS — Marcou Social

- **Issue:** [#82](https://github.com/deividjmoura/marcou/issues/82)
- **Status:** implementado localmente; configuração remota não aplicada
- **Migration:** `20261123130000_social_rollout_foundation.sql`
- **Princípio central:** feature flag controla lançamento, nunca autorização

Esta fundação permite introduzir os módulos sociais de forma aditiva,
reversível e fail-closed sem alterar o motor atual de reservas. Com todas as
flags desligadas, nenhuma rota ou tabela atual muda de comportamento.

## 1. Componentes

### `app_runtime_config`

Uma linha privada identifica o ambiente do projeto Supabase: `local`, `test`,
`preview`, `staging` ou `production`. O valor inicial é `local`. O ambiente é
lido no banco e não é aceito de formulário, query string, header ou cookie.

Cada projeto Supabase deve representar um ambiente. Alterar essa linha exige o
fluxo administrativo aprovado; `anon` e `authenticated` não possuem grants.

### `feature_flags`

Registro privado dos módulos e seus controles:

- `is_enabled`: kill switch global;
- `enabled_environments`: allowlist explícita de ambientes;
- `rollout_percentage`: coorte determinística entre 0 e 100;
- todas as flags nascem com `false`, allowlist vazia e rollout `0`.

Chaves iniciais:

| Chave | Módulo |
|---|---|
| `social_profile` | perfil social e publicação profissional |
| `social_discovery` | busca e descoberta |
| `social_content` | posts, grafo, interações e feed |
| `social_requests` | solicitações e propostas |
| `social_messaging` | conversas e mensagens contextuais |
| `social_reviews` | avaliações verificáveis |
| `social_moderation` | denúncia, moderação e sanções |

### `feature_flag_overrides`

Override temporário ou permanente para exatamente um `user_id` ou
`provider_id`. O registro exige justificativa, pode expirar e só pode ser
administrado por operação privilegiada. Índices parciais garantem um override
por flag/alvo.

### Avaliadores

- `is_feature_enabled(flag, provider_id?)`: somente para `authenticated`;
  deriva o ator de `auth.uid()`, valida ownership quando recebe provider e nunca
  recebe um user ID do navegador.
- `is_public_feature_enabled(flag)`: disponível para leitura pública, mas só
  retorna `true` quando o rollout é de 100%. Não existe “coorte anônima” baseada
  em cookie controlável pelo navegador.
- `src/server/feature-flags.ts`: helpers server-side que falham fechados em erro,
  resposta inesperada ou provider ID inválido.

A ordem da avaliação autenticada é:

1. ator autenticado;
2. flag existente e kill switch ligado;
3. ambiente atual na allowlist;
4. ownership do provider, se informado;
5. override do provider;
6. override da conta;
7. bucket determinístico da conta/provider;
8. `false` para qualquer falha.

Mesmo quando uma flag retorna `true`, a operação precisa validar sessão,
ownership, estado e RLS. Desligar uma flag não é mecanismo de bloqueio ou
moderação; ligar uma flag não concede acesso a dados.

## 2. Ativação segura

Não execute os exemplos em produção sem autorização, backup e validação prévia
em ambiente não produtivo.

### 2.1 Configurar o ambiente do projeto

```sql
begin;
update public.app_runtime_config
   set deployment_environment = 'staging', updated_at = now()
 where singleton = true;
select * from public.app_runtime_config;
commit;
```

### 2.2 Ligar para uma conta interna

O kill switch e o ambiente precisam estar liberados, mas o percentual pode
continuar em zero:

```sql
begin;
update public.feature_flags
   set is_enabled = true,
       enabled_environments = array['staging'],
       rollout_percentage = 0,
       updated_at = now()
 where flag_key = 'social_profile';

insert into public.feature_flag_overrides (
  flag_key, user_id, is_enabled, reason, expires_at
) values (
  'social_profile',
  '<uuid-da-conta-interna>',
  true,
  'Validação interna autorizada do perfil social',
  now() + interval '7 days'
);
commit;
```

IDs devem vir de consulta administrativa autorizada, nunca de um payload do
navegador. Não registre e-mail, telefone ou outra PII na justificativa.

### 2.3 Expandir e interromper

1. validar conta interna;
2. piloto autenticado com percentual pequeno;
3. observar erros, latência, abuso e conversão;
4. expandir gradualmente;
5. usar 100% somente quando a superfície pública puder ser exposta;
6. para interromper imediatamente, definir `is_enabled = false`.

O kill switch preserva dados. Não apague tabelas ou conteúdo durante rollback de
lançamento.

## 3. Convenção de migrations

Novas migrations devem:

1. usar timestamp UTC único de 14 dígitos:
   `YYYYMMDDHHMMSS_descricao_em_snake_case.sql`;
2. ser aditivas e nunca editar um arquivo já aplicado;
3. criar colunas novas como opcionais/default seguro quando houver linhas
   existentes;
4. separar **expandir → backfill → validar → contrair** em entregas observáveis;
5. habilitar RLS antes de conceder acesso a tabelas expostas pelo Supabase;
6. revogar o grant padrão de `PUBLIC` em toda função `SECURITY DEFINER` e fixar
   `search_path`;
7. conceder somente os privilégios necessários a `anon`, `authenticated` e
   `service_role`;
8. incluir índices alinhados ao filtro de tenant/visibilidade e à ordenação;
9. provar aplicação do zero em `npm run test:db`.

O harness `scripts/social-foundation-check.mjs` descobre e ordena automaticamente
todos os `.sql`, rejeita nomes fora da convenção histórica aceita (12 ou 14
dígitos) e prefixos duplicados. Novas migrations devem usar sempre 14 dígitos.
Ele roda depois do harness de booking em `npm run test:db`, sem disputar a mesma
instância PostgreSQL.

## 4. Backfill reproduzível

Antes do backfill:

- registrar contagem de origem e predicado exato;
- definir chave estável de progresso (`id`, nunca offset);
- definir tamanho de lote, `lock_timeout` e `statement_timeout` compatíveis com o
  ambiente;
- tornar a operação idempotente (`where new_column is null`, upsert ou chave
  única);
- ensaiar em cópia/restauração não produtiva;
- obter autorização explícita para o ambiente alvo.

Durante o backfill:

- processar lotes pequenos em ordem determinística;
- persistir/registrar último cursor e contagens sem PII;
- monitorar locks, erro, duração e diferença origem/destino;
- permitir pausa sem perder o progresso já confirmado.

Depois:

- comparar total, amostra e invariantes;
- manter dual-read/compatibilidade durante a janela acordada;
- validar constraint separadamente quando a tabela for grande;
- só remover coluna/caminho antigo em migration posterior, após backup e janela
  de rollback.

Um rollback de backfill interrompe os lotes e volta o código ao caminho antigo;
não apaga silenciosamente as linhas já migradas. Correções de migration são
sempre forward-fix em um novo arquivo.

## 5. RLS e matriz multi-tenant

Toda tabela social futura deve provar, no mínimo:

| Cenário | Resultado esperado |
|---|---|
| `anon` lê projeção explicitamente pública | somente campos/linhas publicados |
| `anon` lê configuração, rascunho ou dado privado | negado |
| usuário A lê/escreve recurso privado de A | conforme operação autorizada |
| usuário A usa ID do usuário B | negado ou zero linhas |
| owner A usa provider B | negado ou zero linhas |
| participante lê conversa/solicitação própria | permitido |
| seguidor ou terceiro lê conversa/solicitação | negado |
| usuário envia ownership, papel, contador ou estado | valor ignorado/recalculado |
| função privilegiada sem sessão | negado/fail-closed |
| `service_role` executa job aprovado | permitido e auditável |

A suíte atual testa dois usuários e dois providers, leitura/escrita direta da
configuração, grants das RPCs, overrides positivos/negativos, ambiente, kill
switch e tentativa de usar o provider alheio.

## 6. Budgets de consulta e paginação

`src/lib/social-pagination.ts` fixa limites máximos antes de qualquer consulta.
Coleções crescentes usam cursor opaco com `id` como desempate; offset não faz
parte do contrato.

| Superfície | Padrão | Máximo | Ordenação/cursor mínimo |
|---|---:|---:|---|
| descoberta | 24 | 48 | ranking, `published_at`, `id` |
| feed | 20 | 40 | bucket de ranking, `published_at`, `id` |
| comentários | 30 | 60 | `created_at`, `id` |
| conexões | 30 | 60 | `created_at`, `id` |
| mensagens | 40 | 100 | `created_at`, `id` |
| moderação | 50 | 100 | prioridade, `created_at`, `id` |

Regras para cada consulta nova:

- selecionar allowlist de colunas, nunca `select *` em projeção pública;
- filtrar tenant, visibilidade/moderação e cursor antes do `limit`;
- criar índice composto na mesma direção dos filtros/ordenação frequentes;
- evitar N+1 e contagens exatas síncronas em feed;
- medir `EXPLAIN (ANALYZE, BUFFERS)` com volume representativo em staging;
- registrar p50/p95 real antes de afirmar meta cumprida.

Metas iniciais para homologação, ainda **não medidas**: p95 de consulta de leitura
interativa abaixo de 300 ms no banco e nenhuma consulta individual acima de 2 s.
Essas metas são gates futuros, não evidência de desempenho atual.

## 7. Rollback

### Código/UI

1. desligar `is_enabled` no ambiente afetado;
2. confirmar que helpers retornam `false` e rotas antigas continuam funcionais;
3. reverter o código da superfície, se necessário;
4. preservar tabelas e dados para diagnóstico/retomada.

### Migration

- não fazer down migration destrutiva em ambiente com dados;
- corrigir função, policy, índice ou constraint com nova migration;
- revogar grants imediatamente se houver exposição;
- restaurar backup somente conforme runbook aprovado e teste de restore.

### Evidência mínima

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run audit
npm run build
```

A ativação remota exige ainda teste no ambiente, observabilidade e autorização do
responsável. Esta entrega não altera Supabase, Netlify nem produção.
