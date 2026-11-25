# Handoff — integração e dívida técnica

Registro do agente de integração. Não substitui o `AGENT_TASK_MARCOU.md`, que
não foi editado nesta rodada.

## 2026-11-25 — triagem de PRs, B3, B4 e PR #32

### Estado verificado (não presumido)

- `main` = `67bb571` (CI verde em 24/11).
- O `AGENT_TASK_MARCOU.md` da `main` tem 160 linhas e foi atualizado em 23/11.
  As seções "ESTADO ATUAL CONSOLIDADO", o bloco JSON e "AUDITORIA GERAL +
  GOOGLE OAUTH — 16/11/2026" não existem mais na `main`: saíram na PR #49
  (`0f694a1`). A auditoria foi lida pelo histórico (`ec9dc3d`).
- Já mescladas: #45 (auditoria + OAuth, `033b090`), #36 (design system,
  `c6e5f1e`), #42, #4/#37. A #1 foi fechada sem merge.
- B3 e B4 da auditoria de 16/11 continuavam presentes na `main`.

### Entregas

| Item | Onde | Estado |
| --- | --- | --- |
| B3: `toCents` quebrava com `1.234,56` | PR desta branch (`arena/30a92c52-marcou`) | corrigido, com testes |
| B4: dono via ações do cliente em `/reserva/[id]` | mesma PR | corrigido, com testes |
| PR #32 sem a deleção do doc de continuidade e sem `docs/MOTION.md` | patch de 2 commits comentado na PR #32 | validado localmente; aguarda aplicação pelo responsável |

**B3 (`src/lib/money.ts`).** A regra completa está documentada no próprio
arquivo:
- **Vírgula** é sempre decimal (1–2 casas).
- **Ponto com vírgula** é milhar (`1.234,56`).
- **Ponto sem vírgula:** grupos de exatamente 3 dígitos são milhar (`1.234`);
  1–2 dígitos depois de um único ponto são decimal (`12.5`, e o `1234.56` que
  o formulário de edição gera com `toFixed(2)`).
- **Ambiguidade é recusada com mensagem clara**, sem adivinhar: grupo de milhar
  iniciado em zero (`0.500`), separadores trocados (`1,234.56`), grupos de
  tamanho errado e mais de 2 casas.
- O cálculo usa só inteiros.

**Preço** é obrigatório: vazio é recusado. **Sinal** é opcional: vazio ou
ausente vira 0 ("sem sinal"), como já permitiam o schema (`min(0)`) e o banco
(`deposit_cents default 0, check >= 0`). Por isso o input do sinal deixou de
ser `required` e ganhou um placeholder explicativo.

**B4 (`src/app/reserva/[id]/reservation-role.ts`).** Os rótulos e ações por
papel ficam num módulo puro. O cliente mantém exatamente o comportamento
anterior. Para o dono, os **eventos e os status** em que cada ação aparece
são os mesmos do painel (`src/app/painel/page.tsx`). Dois rótulos são **mais
explícitos de propósito**, porque nesta página o dono está vendo a reserva de
outra pessoa:

| Evento | Status | Painel | `/reserva/[id]` (dono) |
| --- | --- | --- | --- |
| `proof_received` | `pending_payment` | "Marcar comprovante" | "Marcar comprovante recebido" |
| `payment_approved` | `pending_review` | "Confirmar pagamento" | "Confirmar pagamento" (igual) |
| `cancel` | `pending_payment`, `pending_review`, `confirmed` | "Cancelar" | "Cancelar reserva do cliente" |

As duas actions antigas
viraram `reservationTransitionAction`, com lista fechada de eventos. A
autorização continua integralmente em `transition_booking`: a interface não
concede nem retira permissão. **O papel nunca vem do formulário:** a action lê
apenas `bookingId` e `event`. O papel é derivado no servidor, em `page.tsx`,
comparando `booking.customer_id`/`provider.owner_id` com o usuário da sessão,
e no componente serve só para escolher rótulos. Um teste envia `role=owner`
forjado e confirma que só `{ bookingId, event }` chega à RPC.

### Não feito (fora do escopo ou impedido)

- **M4** (telefone obrigatório na reserva pública): decisão do responsável.
- **Avisos de status da página da reserva** ("Apresente-se no horário
  marcado", "O prestador precisa validar o sinal") continuam com o texto do
  cliente para o dono. A PR #68 reescreve esse bloco (`RESERVATION_FEEDBACK`);
  o ajuste por papel deve ser feito lá para não gerar conflito.
- **PR #32:** esta sessão só pode publicar na própria branch. Por isso não
  houve push em `feat/30-platform-hardening` nem branch nova. A versão
  corrigida foi comentada na PR #32 como patch aplicável com `git am`.
- Nenhum merge, deploy, migration remota, variável ou segredo foi alterado.

### Validação local desta branch (resultados reais)

Rodada de 25/11/2026, depois dos ajustes de revisão: ver a descrição da PR #124.

### Ordem de merge recomendada (para aprovação do responsável)

Simulada em 25/11/2026 com merge normal (`--no-ff`, como o GitHub faz), em
worktree temporária a partir da `main` `8730118`. Todas as PRs têm merge-base
com a `main` (conferido com `git merge-base` e com a API `compare`). Resultado
final das 5 PRs juntas: lint sem erros, typecheck ok, `npm test` 233/233,
`test:db` verde (incluindo `privileges-check`), audit 0 e build ok.
Depois do merge da #122, a ordem recomendada passou a ser #124 antes da #123.
Conferido com `git merge-tree`: os conflitos da #123 são os mesmos
(`CHANGELOG.md`, `package.json`) nas duas ordens.

1. **#122** (auth/CHANGELOG): **mergeada em 25/11/2026** (`9b92451`).
2. **#124** (esta PR): **já atualizada com a `main` depois da #122**. O
   conflito add/add em `CHANGELOG.md` foi resolvido mantendo tudo da #122 e
   acrescentando as 3 entradas da #124 (+13 linhas, 0 removidas), e
   `npm run check:changelog` passa. Está pronta para revisão. Pode entrar
   antes da #123, que ainda é draft e tem pendências de segurança.
3. **#123** (booking + matriz de privilégios), depois dos ajustes da revisão.
   Contra a `main` + #124, conflita em `CHANGELOG.md` e `package.json`:
   - CHANGELOG: manter cabeçalho e todas as entradas já presentes (#122 e
     #124) e acrescentar as entradas de booking/matriz em `Adicionado` e as de
     `Segurança`. A entrada "Verificação obrigatória de changelog" da #123 é
     duplicada e sai.
   - `package.json`: usar o `test:db` da #123 (com `privileges-check`),
     mantendo `check:changelog`.

   `scripts/changelog-check.mjs` e o teste dele são idênticos aos da `main`.
   As pendências de segurança da revisão da #123 continuam valendo (issue #125).
4. **#40** (#22), depois da #124: merge limpo, mas o `check:changelog` falha
   (`src/app/p/[slug]/actions.ts` sem entrada). Precisa de entrada no
   CHANGELOG. Coordenar com o agente da Issue #21.
5. **#68**, depois da #40: conflitos em `src/app/globals.css` (os dois lados
   acrescentam blocos no fim; manter ambos e fechar o `@media` da `main` com `}`
   antes do bloco da #68) e em `src/app/reserva/[id]/page.tsx` (layout da #68 +
   `role={role}` no `<ReservationActions>`). Também precisa de entrada no
   CHANGELOG.
6. **#32 corrigida** (patch comentado na PR #32): a #122 já entrou.
   Regenerar o patch mantendo os steps novos da #122 em
   `.github/workflows/ci.yml` e acrescentando só concurrency, timeout e nomes.
7. Rebasear antes de revisar: #38, #39 e #67. #69 e #71: o código da #69 não
   está na `main` (a `main` resolve a recuperação por `/auth/confirm` com
   `token_hash`); fechar ou rebasear é decisão do responsável.

A #122 já está na `main`. A partir de agora, o `check:changelog` do CI vale para
toda PR que mexer em `src/`, `scripts/`, `supabase/` etc.: #40, #68, #32 e as
demais precisam de entrada em `## [Unreleased]`.

### Triagem de PRs candidatas a fechamento (evidência; nada foi fechado)

- **#41, superada pela #117.** Revoga e concede EXECUTE para as mesmas 10
  funções (`create_booking`, `transition_booking`, `get_provider_schedule`,
  `expire_stale_bookings`, `create_booking_reminders`, `is_interval_available`,
  `notification_payloads`, `notify_on_booking_event`,
  `mark_notification_read`, `mark_all_notifications_read`), que a migration
  `20261123133000_harden_security_definer_grants.sql` já cobre, com checagem
  genérica de `PUBLIC`. Além disso, a migration da #41
  (`202611160001_harden_…`) usa a mesma versão de
  `202611160001_provider_description.sql`, já na `main`. A descrição da #117
  diz "Supersedes #41".
  *Frase para o responsável:* "A #41 pode ser fechada como substituída pela
  #117, que aplica o mesmo hardening com versão de migration única e cobertura
  para funções futuras."
- **#46, superada pela #60.** Um commit (`2372687`) que só acrescenta uma seção
  ao `AGENT_TASK_MARCOU.md` sobre uma rodada anterior de limpeza no mesmo dia.
  A `main` já tem o registro consolidado da #60 (`dbc9f2a`, seção "Limpeza de
  branches já mergeadas — 16/11/2026"). O texto da #46 também ficou
  incorreto: diz que `design/identidade-visual` foi apagada, mas ela existe de
  novo e é a head da #67.
  *Frase para o responsável:* "A #46 pode ser fechada: o registro da limpeza
  está na main pela #60, e o texto da #46 contém informação já desatualizada."
- **#2, base órfã.** Aponta para `feat/pagina-publica-agendamento`, head da
  PR #1, fechada sem merge em 16/11. São 3 commits sobre
  `src/app/preview/agendamento/` (rota de prévia que nunca existiu na `main`)
  mais `AGENT_TASK_MARCOU.md`, com merge-base `5d07f16` (15/11), 142 commits
  atrás. O fluxo equivalente está em `src/app/p/[slug]/booking-widget.tsx`
  (#49/#51).
  *Frase para o responsável:* "A #2 pode ser fechada: a base é a branch de uma
  PR já fechada e o calendário mobile foi entregue no fluxo público pelas
  #49/#51; se houver algo visual a aproveitar, vale uma PR nova sobre a main."
- **#32 original:** fechar depois de abrir a versão corrigida (item 3 acima).

### Revisão cruzada da PR #123 (somente leitura)

Comentários deixados na própria #123. Resumo: nenhum bloqueante, quatro
itens importantes e algumas sugestões. A verificação de privilégios foi feita
num Postgres embutido local, emulando os default privileges do Supabase, sem
nenhuma ação remota.

Lacuna pré-existente, fora do escopo da #123 e desta PR: privilégios padrão do
Supabase (inclusive TRUNCATE, que ignora RLS) para `anon`/`authenticated` em 8
tabelas de `public`. O diagnóstico, o rascunho de migration validado localmente
e o plano de teste estão na issue **#125** (`[SECURITY]`), não nesta PR. O
hardening deve ir numa PR própria, a partir da `main`.
