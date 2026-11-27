# Patch — consumo atômico do OAuth State (Google Calendar, Issue #29)

Deliverável gerado a partir do commit `41e4e5e1bcb2c6fefebc7ad5b78954f69b21623c`
(repositório `deividjmoura/marcou`, branch `arena/9c0da280-marcou`) para
aplicação no repositório `deividjmoura/marcou-google`.

## Base de aplicação

- Repositório de destino: `deividjmoura/marcou-google`
- Branch de referência: `work/google-calendar-setup`
- SHA base: `26baee930cc48e1ec38561903337d5148d5274c7`
- O patch é o diff `26baee9..41e4e5e` **restrito** aos arquivos da correção:
  nenhum outro arquivo da integração Calendar e nenhuma alteração da `main` do
  `marcou` (identidade, `CHANGELOG.md`, `scripts/changelog-check.mjs`,
  `.github/workflows/ci.yml`, `.env.example`, `src/app/painel/page.tsx`,
  `src/server/identity.ts` etc.) foi transportado.

## Arquivos do patch

`29-calendar-oauth-state-atomic.patch` (obrigatório, 6 arquivos):

| Arquivo | Ação | Delta |
|---|---|---|
| `src/app/api/calendar/callback/route.ts` | alterado | +16/−7 (consome o state antes de `exchangeOAuthCode()`) |
| `src/app/api/calendar/callback/route.test.ts` | novo | 240 linhas (10 testes) |
| `scripts/calendar-state-check.mjs` | novo | 464 linhas (25 verificações em PostgreSQL real) |
| `supabase/migrations/20261127120000_calendar_oauth_state_consumption.sql` | nova | 32 linhas (RPC `consume_calendar_oauth_state`) |
| `package.json` | alterado | 1 linha (`test:db` + `scripts/calendar-state-check.mjs`) |
| `docs/CALENDAR-INTEGRATION.md` | alterado | +10 (seção “Consumo do state”) |

`29-calendar-oauth-state-atomic-docs.patch` (opcional, 1 arquivo):
`docs/handoffs/29-calendar-pendencias.md` — registro das cinco pendências
adiadas pela auditoria (escopo concedido, cache/rotação de refresh token,
URI/HTTPS, `SUPABASE_SERVICE_ROLE_KEY`, testes de rotas/worker).

Não há entrada de `CHANGELOG.md` porque esse arquivo não existe em `26baee9`
(ele foi introduzido na `main` do `marcou` pela PR #122).

## Dependências

- **Migration anterior obrigatória:** `20261125153000_google_calendar_sync.sql`
  (já presente em `26baee9`), que cria `provider_calendar_connections`. A nova
  migration é aditiva e só cria a RPC.
- **Grants:** a RPC concede `EXECUTE` apenas a `service_role`; o papel precisa
  existir no ambiente (é o caso do Supabase e do harness local).
- **Ambiente:** nenhuma variável nova. Continuam necessárias as já documentadas
  (`GOOGLE_CALENDAR_ENABLED`, `GOOGLE_CALENDAR_CLIENT_ID`,
  `GOOGLE_CALENDAR_CLIENT_SECRET`,
  `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_WORKER_SECRET`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`).
- **Código:** depende apenas dos módulos já existentes em `26baee9`
  (`@/server/bookings`, `@/server/calendar/{admin,crypto,google,oauth}`).
  Nenhuma alteração de worker, cifragem, escopos ou sincronização de eventos.
- **Deploy:** a RPC precisa ser aplicada no banco **junto** com o código; o
  callback antigo não funciona sem a RPC e a RPC não é usada pelo código antigo.
  O patch **não** aplica migration remota nem ativa `GOOGLE_CALENDAR_ENABLED`.

## Aplicação (sem tocar na branch de referência)

```bash
git clone https://github.com/deividjmoura/marcou-google.git
cd marcou-google
git fetch origin work/google-calendar-setup
git switch -c fix/29-oauth-state-atomic origin/work/google-calendar-setup   # branch nova
git apply --check /caminho/patches/29-calendar-oauth-state-atomic.patch
git apply --3way /caminho/patches/29-calendar-oauth-state-atomic.patch
git apply --3way /caminho/patches/29-calendar-oauth-state-atomic-docs.patch   # opcional
git diff --stat            # confira: 7 arquivos, ~810 inserções
git commit -am "security(calendar): consome o OAuth state de forma atômica e de uso único"
```

Alternativa sem copiar arquivos: `git am` não se aplica (os arquivos são um diff
sem cabeçalho de commit); use `git apply` como acima.

## Verificação

```bash
npm install --no-audit --no-fund --legacy-peer-deps
npm run lint
npm run typecheck
npx vitest run src/app/api/calendar/callback/route.test.ts src/server/calendar
node scripts/calendar-state-check.mjs     # ou: npm run test:db (se os harnesses existirem)
npm run build
```

Verificado em clone limpo de `26baee9` (simulação de `marcou-google`):

- `git apply --check` e `git apply` → sem conflitos, sem `.rej`;
- `tsc --noEmit` → ok;
- `vitest` (callback + suíte Calendar) → 5 arquivos, 19 testes, todos passando;
- `scripts/calendar-state-check.mjs` → 25/25 verificações (state válido,
  expirado, inexistente, malformado, replay sequencial, 2 e 8 callbacks
  simultâneos, isolamento entre providers, grants e `search_path`).

## Conflitos esperados

- Contra `26baee9` **não há conflitos** (verificado). `src/server/calendar/*`,
  rotas `connect/disconnect/status/worker`, page do painel e a migration do
  Calendar são reaproveitados sem qualquer alteração.
- Se `work/google-calendar-setup` avançou: os pontos frágeis são
  `package.json` (linha `test:db`) e `docs/CALENDAR-INTEGRATION.md` (seção
  “OAuth e armazenamento”). Nesse caso use `git apply --3way`; se o hunk do
  `test:db` já não casar, acrescente manualmente
  `&& node scripts/calendar-state-check.mjs` ao final da linha.
- Se o repositório de destino já possuir `src/app/api/calendar/callback/route.test.ts`,
  o arquivo novo conflita: renomeie para `route.state.test.ts` (nenhum outro
  arquivo referencia esse caminho).

## Estado deste repositório

Nada foi commitado, enviado, mergeado ou aplicado remotamente para produzir estes
arquivos: eles são artefatos **não rastreados** (`patches/`), gerados a partir de
um clone descartável em `/tmp`. A branch `arena/9c0da280-marcou` permanece em
`41e4e5e` e a branch `work/google-calendar-setup` não foi tocada.
