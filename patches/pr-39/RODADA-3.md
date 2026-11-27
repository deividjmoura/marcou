# PR #39 — rodada `2026-11-27-round-3`: revisão final após atualização

Revisão somente leitura do diff. Nenhum arquivo de código foi alterado nesta
rodada; a única escrita no remoto foi a **descrição da PR #39** (seção de
validação/recomendação), conforme a atribuição (“atualizar o relatório”). Não
houve merge, close, remoção de Draft, deploy nem alteração de outras PRs.

## 1. Estado remoto verificado (ao vivo)

| Item | Valor |
|---|---|
| PR #39 | `OPEN`, **Draft**, `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN` |
| head | `7a1e270e369023020f27ea6afddb07df76a014d7` (merge commit) |
| base | `main` = `69d02173653384e082476e7879ee9f33672dec72` |
| árvore | `3f8890e1a097069b2a3cc224c8b88dcdead3b101` |
| `potentialMergeCommit` | `92fb554035cdf648b4eb4ea74b887385818d6eec` |
| diff vs main | 9 arquivos, +765/−115 |

## 2. CI corresponde exatamente ao HEAD

- Check-run `quality` em `7a1e270…` → run **#46048421298**, `event=pull_request`,
  criado 18:18:05Z, `conclusion=success`; job `quality` com **todos** os steps
  verdes: `check:changelog`, `lint`, `typecheck`, `npm test`, `test:db`, `build`.
- `head_sha` do run = `7a1e270e369023020f27ea6afddb07df76a014d7` — coincide com o
  head da PR (nenhuma validação de SHA antigo foi reaproveitada).
- Netlify: `Redirect rules`, `Header rules` e `netlify/marcoou/deploy-preview`
  `success` no mesmo SHA; `Pages changed` `neutral`/`skipping` (padrão do plugin).
  Status combinado do commit: `state=success`.
- URL do preview: https://deploy-preview-39--marcoou.netlify.app

## 3. Revisão do diff (arquivo por arquivo)

| Arquivo | Revisão |
|---|---|
| `src/domain/agenda/agenda.ts` (novo, 134) | funções puras; `now` sempre do chamador (nenhuma leitura de relógio); não muta a entrada; data inválida descartada; agrupamento por dia local com `Intl` e fuso IANA (lança em fuso inválido, em vez de agrupar errado) |
| `src/domain/agenda/agenda.test.ts` (novo, 197) | busca (acento/caixa/espaço, telefone formatado, serviço), borda `now` em próximos×anteriores, ordenação, não-mutação, data inválida, fusos diferentes e lista vazia |
| `src/app/painel/booking-agenda.tsx` (novo, 237) | filtros/busca/agrupamento; **ações preservadas** (`proof_received`, `payment_approved`, `cancel`) pela mesma Server Action; estado de falha com `role="alert"`; contagem com `aria-live`; `aria-pressed` nos filtros; títulos de dia acessíveis |
| `src/app/painel/page.tsx` (mod., −116) | tabela inline substituída por `BookingAgenda` injetada em `bookingsContent` (prop já existente em `painel-client.tsx`); passou a distinguir falha de agenda vazia |
| `src/server/bookings.ts` (mod., +30) | `listProviderBookingsForPanel` devolve `{ bookings, failed }`; consulta mantém `.eq("provider_id", provider.id)` e RLS; `listProviderBookings` mantido como compatibilidade |
| `src/server/bookings.test.ts` (mod., +55) | cobre filtro por provider, `failed: true` (erro) × `failed: false` (vazio) e retorno normal |
| `src/app/globals.css` (+10) | apenas estilos da lista agrupada e layout em coluna ≤640px |
| `docs/AGENDA-PRESTADOR.md` (novo) | arquitetura, isolamento/autorização, limites e decisões |
| `CHANGELOG.md` (+14) | entradas em `[Unreleased]` (Adicionado/Alterado) |

Verificações negativas: nenhum marcador de conflito, `TODO`, `FIXME`,
`console.log`, `debugger`, `.only(` ou teste pulado no diff.

## 4. Gates reproduzidos nesta árvore

`check:changelog` ok · `lint` **0 erros / 3 warnings** (todos pré-existentes em
`src/app/page.tsx` e `src/app/(auth)/layout.tsx`; **nenhum** em arquivo da PR) ·
`typecheck` ok · `npm test` **19 arquivos / 165 testes** · `test:db`
69/0 · 47/0 · 32/0 · 40/0 · `audit` 0 falhas/0 avisos · `build` ok com `ƒ /painel`.

## 5. Achados

Bloqueantes: **nenhum**.

Não bloqueantes (observações para decisão do responsável):

1. Filtro padrão é **Todos** com ordem crescente; a tabela anterior mostrava o
   mais recente primeiro. Se o uso esperado é “o que vem agora”, `Próximos` como
   padrão tende a ser melhor.
2. Agrupamento usa o fuso **gravado em cada reserva** (snapshot). Mudança de fuso
   do prestador faz reservas antigas caírem em dias diferentes do fuso atual —
   documentado, mas é decisão de produto.
3. `listProviderBookings` ficou sem uso interno (compatibilidade) e a PR #131
   também altera `bookings.ts` → risco de conflito futuro entre as duas.
4. Agenda carrega tudo (`.select("*")` sem paginação) e passa a filtrar no
   cliente — igual ao comportamento anterior, mas volumes grandes pediriam
   paginação.
5. Sem teste de componente/E2E para a agenda (cobertura de domínio + servidor),
   consistente com o restante do repositório.

## 6. Veredito

**Pronta (tecnicamente) para revisão e merge.** Branch sincronizada sem force
push, CI e Preview verdes no SHA exato, diff restrito ao escopo da Issue #24 e
nenhum achado bloqueante.

Depende do responsável: (a) tirar do Draft; (b) fazer o merge; (c) opcionalmente
definir filtro padrão e política de fuso do agrupamento.

## 7. Atualização feita na PR

Descrição da PR #39 atualizada: seção “Validação” substituída pelos dados do SHA
`7a1e270` (merge commit, CI #46048421298, Netlify preview) e novas seções
“Revisão final (rodada 2026-11-27-round-3)” e “Recomendação”. Título, labels,
estado Draft e commits permaneceram intactos (head continua `7a1e270`).
