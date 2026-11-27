# Relatório — atualização de segurança do Next.js 16.4.0 → 16.4.6

Agente 4. Escopo estritamente de dependência: **nenhuma** alteração funcional do
Calendar, migration, banco, Netlify config ou variável de ambiente foi incluída.

## 1. Versão instalada e advisories aplicáveis

- Instalada no `main` (`9b92451`): `next@16.4.0`, `eslint-config-next@16.4.0`.
- `npm audit` em `16.4.0`: **1 critical**, `fixAvailable: next@16.4.6`
  (RCE não autenticado na Image Optimization API com SVG).
- GitHub Advisory DB consultado com `affects=next@16.4.0`:

| GHSA | Severidade | Correção | Descrição |
|---|---|---|---|
| GHSA-673q-mjm6-r5xr | **critical** | 16.4.1 | RCE não autenticado em funções `use cache` que retornam typed arrays (`16.0.0 – 16.4.0`) |
| GHSA-pc58-hwjq-p385 | medium | 16.4.5 | Injeção/divulgação de resposta entre clientes ao encaminhar respostas (`16.0.0 – 16.4.4`) |
| GHSA-rhh4-g77r-r9qj | medium | 16.4.5 | Divulgação/envenenamento de cache em `use cache` com argumentos binários (`16.0.0 – 16.4.4`) |
| GHSA-vvgp-ww4w-46vf | medium | 16.4.5 | Envenenamento de shells de fallback em Cache Components (`16.4.0 – 16.4.4`) |
| GHSA-vc7v-qv4w-wrv8 | medium | 16.4.5 | Vazamento de cache entre root params em `use cache` aninhado (`16.2.0 – 16.4.4`) |
| GHSA-mfr8-8qww-v76h | medium | 16.4.5 | Divulgação entre root params via `unstable_cache()` (`16.3.0 – 16.4.4`) |

## 2. Versão corrigida recomendada

- **`16.4.6`** — é o `latest` da linha 16 e da série 16.4.x (16.4.0 → 16.4.6).
- Consulta `affects=next@16.4.6` → **0 advisories**; `affects=next@16.4.5` → 0.
- Mínimo que zera os advisories conhecidos: **16.4.5**; recomendado **16.4.6**
  (última correção da linha, sem mudança de major/minor).
- `eslint-config-next` acompanha na mesma versão (`16.4.6`), como já era em 16.4.0.

## 3. Compatibilidade

| Item | Situação |
|---|---|
| React | `react`/`react-dom` `^19.2.0` — peer de `next@16.4.6` é `^18.2.0 || ^19.0.0` → compatível, **sem mudança** |
| TypeScript | `typescript ^5.9.3` — `tsc --noEmit` sem erros com 16.4.6 |
| Turbopack | `next build` usa Turbopack por padrão na linha 16; build de produção concluído em ~8 s, sem warnings novos |
| Netlify | Repositório não tem `netlify.toml` nem `@netlify/plugin-nextjs`; deploy usa o runtime OpenNext zero-config da Netlify, que suporta Next 16 (App Router, SSR, RSC, Server Actions, streaming, Turbopack). Nenhuma config foi alterada nesta entrega. **Observação para o operador:** se o build da Netlify parar de gerar o handler Next, o ajuste recomendado é pinar `@netlify/plugin-nextjs` e declarar o plugin em `netlify.toml` — tarefa separada, fora deste escopo |
| Node | `engines: >=20.9.0` (Next 16.4.6) — CI e Netlify já usam Node 22 |
| ESLint | `eslint ^9.39.0` + `eslint-config-next 16.4.6`; `legacy-peer-deps=true` já está no `.npmrc` — mesmos 3 warnings pré-existentes de `<img>`, 0 erros |

## 4. Dependências e lockfile

- Única alteração: `dependencies.next` **16.4.0 → 16.4.6** e
  `devDependencies.eslint-config-next` **16.4.0 → 16.4.6**.
- **O repositório não versiona lockfile** (`package-lock.json`, `pnpm-lock.yaml`
  e `yarn.lock` não estão no Git), então não há lockfile a regenerar no patch.
  `npm install` resolve as versões na hora (pin exato em `package.json`).
- `npm install` com 16.4.6: `added 5 packages, changed 5 packages` — nenhuma
  dependência transitiva nova de runtime além do que a linha 16.4 já usava.
- **Recomendação (fora do escopo):** versionar `package-lock.json` para tornar a
  resolução reproduzível entre CI e Netlify.

## 5. Mudanças incompatíveis e avisos de migração

- Nenhuma: 16.4.0 → 16.4.6 é patch release da mesma minor. Sem codemods, sem
  mudança de `next.config.ts` (`poweredByHeader: false` permanece válido), sem
  alteração de `runtime = "nodejs"` nas rotas, sem mudança em Server Actions,
  middleware/proxy ou `next/image`.
- Sem depreciações novas observadas no build; nenhum warning além dos 3 de
  `<img>` já existentes.

## 6. Resultados verificados

Base `main` `9b92451` + patch (clone isolado em `/tmp`):

- `npm run lint` → 0 erros, 3 warnings pré-existentes;
- `npm run typecheck` → ok;
- `npm test` → 18 arquivos, **150 testes** ok;
- `npm run build` → ok (Turbopack, todas as rotas geradas);
- `npm run test:db` → 69 + 47 + 32 + 40 = **188 checagens** ok;
- `npm audit` → **1 critical → 0 vulnerabilidades**.

Base `0c67473` (branch com Calendar) + o mesmo patch, para checar interação:

- `npm run build` → ok, incluindo as 5 rotas `/api/calendar/*`;
- `vitest` → **169 testes** ok;
- `scripts/calendar-state-check.mjs` → 25/25 — o Calendar não é afetado.

## 7. Aplicação

```bash
git switch -c chore/next-16.4.6-security 9b92451   # ou origin/main atualizado
git apply --3way patches/next-upgrade/next-16.4.6-security-upgrade.patch
npm install          # .npmrc já aplica legacy-peer-deps
npm run lint && npm run typecheck && npm test && npm run test:db && npm run build
npm audit            # deve retornar 0 vulnerabilidades
git commit -am "chore(deps): atualiza Next.js para 16.4.6 (correções de segurança)"
```

O patch aplica limpo em `main` (`9b92451`) e também sobre `0c67473`
(branch do Calendar), porque só toca `package.json`.

## 8. Limitações

- O ambiente desta sessão só permite commits na branch `arena/9c0da280-marcou`,
  então **não foi criada a branch independente** pedida: entrega-se o patch +
  este relatório (pasta `patches/next-upgrade/`), separados do código do Calendar.
- Nada foi mergeado, deployado, publicado na Netlify, commitado em `main` ou
  aplicado em ambiente remoto; `npm install`/`build` rodaram apenas em clones
  descartáveis em `/tmp`.
