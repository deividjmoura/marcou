# Auditoria e relatório parcial — Agente 6, rodada 9 (`dispatch.wave_4`)

Data: 2026-11-27 (UTC). Branch de trabalho: `arena/3938e7c2-marcou`.
Referências: `docs/FECHAMENTO-AGENTES.md` (§0, §4, §7, §8), `docs/PADRAO-DE-ESCOPO.md`.

## 1. Estado de referência (reconfirmado)

- `origin/main` = `994cf1c` (#153, atalhos WhatsApp E.164). CI push `994cf1c`: success.
- `origin/coordination/agents` = `f296025` (lido com `git show`).
- Clone local: estava shallow de novo; refeito com `git fetch --unshallow` antes da auditoria (sem reescrita de histórico).

## 2. W4-A6-T1 — Auditoria de merges

14 PRs mergeadas auditadas: #127, #136, #137, #138, #140, #141, #142, #143, #145, #146, #147, #151, #152, #153.

Critérios: SHA do merge, check `quality` no SHA de merge, presença na `main`, arquivos da PR iguais a `git diff --name-only <merge>^ <merge>`, vínculo com issue (`Closes`/`Refs`).

| PR | Merge | Head | Na main | Arquivos | CI no merge | Vínculo |
|----|-------|------|---------|----------|-------------|---------|
| #127 | 82af750 | f8977ca | sim | iguais | quality success | Issue #70 (título) |
| #136 | 09c744e | f89f261 | sim | iguais | quality success | Issue #125 (título) |
| #137 | 90b05aa | c5d03e5 | sim | iguais | quality success | sem issue (docs de coordenação) |
| #138 | 44ed540 | 39855f0 | sim | iguais | quality success | Refs #30 |
| #140 | cd30f00 | 4510cbb | sim | iguais | quality success | Refs #72 |
| #141 | cd6065a | 979e43f | sim | iguais | quality success | Refs #29 |
| #142 | 4badea4 | e41a89d | sim | iguais | quality success | Refs #21 |
| #143 | 03eb70c | 112483b | sim | iguais | quality success | Refs #50 |
| #145 | d1e0c2f | 7bcf70f | sim | iguais | quality success | sem issue no corpo |
| #146 | 13d67f6 | 191fff3 | sim | iguais | quality success | Refs #68 |
| #147 | 539035b | d942b94 | sim | iguais | quality success | sem issue (docs de coordenação) |
| #151 | 6042275 | 343b40b | sim | iguais | quality success | Refs #26 |
| #152 | 5538a44 | 6ada559 | sim | iguais | quality success | sem issue (arquivamento) |
| #153 | 994cf1c | 73f7e0f | sim | iguais | quality success; `expire-stale-bookings` skipped (scheduler não ativado) | Closes #57 |

Correção à rodada 8: a ressalva sobre #151 (sem `quality` no merge) não se confirma agora; o check `quality` aparece com sucesso no SHA `6042275`.

**Bug P0 do WhatsApp (introduzido pela #153):** verificado no código da `main` (`src/lib/whatsapp.ts`): a regra "evita NANP" rejeita com `null` todo número de 11 dígitos com DDD 12–19. **Ainda não corrigido na `main`.** A correção está na PR #155 (`fix/whatsapp-ddd-12-19-r7`, Agente 1), que está aberta, `CLEAN`, com `quality` success no head `b3c9e83`. Quando for mergeada, a verificação deve repetir a checagem no SHA de merge e confirmar o teste de regressão DDD 11–19 (W4-A1-T1). Pendente.

## 3. W4-A6-T2 — Issues #8, #21, #22, #29, #57, #125

- **#8 — mantida aberta.** Não há seção "Escopo refinado" na issue; os critérios de aceite seguem sem evidência completa (datas/fusos e limites de antecedência, revalidação no backend, testes de componente). Matriz publicada na rodada 8 (comentário na #8): sem alteração nesta rodada, pois a #153 não tocou o calendário. Não fechada.
- **#57 — reaberta pelo Agente 6.** Foi fechada automaticamente pelo `Closes #57` da #153. O critério "Testes cobrem normalização de números" não tem evidência válida por causa do bug de DDD 12–19. Comentário com a evidência publicado; fechará quando a #155 for mergeada e o teste de regressão estiver verde no SHA de merge.
- **#21 — fechamento sem evidência (rodada 8), mantida fechada, pendente.** A evidência de rejeição de colisão viva em `booking_services` continua ausente. Reavaliar com o responsável.
- **#22 — fechamento sem evidência de payload público, pendente.** Verificação de campos privados no payload público não concluída. Reavaliar com o responsável.
- **#29 — evidência suficiente** (#135, #141). Escopo V1 unidirecional Marcou → Google.
- **#125 — evidência suficiente** (matriz de privilégios no `test:db`, #136).

## 4. W4-A6-T3 — Limpeza de branches

Regra aplicada: apagar só com PR MERGED confirmada e tip igual ao head, ou prova de superação/integração; preservar `main`, `coordination/agents`, branches de PR aberta e trabalho exclusivo.

**Nenhuma branch foi apagada nesta rodada.** Nenhuma remanescente tem PR MERGED com tip igual ao head (as que tinham foram apagadas pelo coordenador). Para as branches de PR fechada sem merge, não há prova de superação: o conteúdo da branch continua diferente da `main` nos arquivos que ela altera.

Inventário (28 branches remotas, excluindo `main`, `coordination/agents` e a própria branch do Agente 6):

- **Preservar — PR aberta:** `agent5/w2-design-system-main-current` (#150, DRAFT, `fc92a8b` no momento da leitura), `fix/auth-recovery-preview-origin` (#130, DRAFT, DIRTY), `agent4/w3-service-media` (#154, CLEAN, `96f1490`), `fix/whatsapp-ddd-12-19-r7` (#155, CLEAN).
- **Preservar — trabalho em andamento sem PR:** `agent4/w4-counterparty-phone-isolation` (W4-A4-T2 do Agente 4), `agent5/w4-design-system-reconciled` (W4-A5-T2 do Agente 5, tip `85d3dcb`).
- **Preservar — coordenação:** `arena/3938e7c2-marcou` (esta branch).
- **Preservar — PR fechada, sem prova de superação (conteúdo diferente da `main`):** `agent5/w2-design-system-current-main` (#148), `agent5/w2-design-system-main-latest` (#149), `agent5/w2-design-system-reconciled` (#144); `arena/116298da-marcou` (#46); `arena/30a92c52-marcou` (#124); `arena/4017109f-marcou` (#123); `arena/9e68c2bb-marcou` (#126; `21-booking.md` difere do arquivado na `main`, conforme rodada 8); `arena/f074e752-marcou` (#133); `design/identidade-visual` (#67); `feat/booking-flow-confirmation-success` (#68); `feat/30-platform-hardening` (#32); `feat/calendario-mobile` (#2); `feat/customer-account-area` (#48); `feat/pagina-publica-agendamento` (#1); `fix/auth-recovery-redirect-production` (#71); `fix/booking-multiple-services-pr123` (#131); `fix/security-definer-execute-grants` (#41); `fix/131-multi-services-r7` (#139; 2 migrations exclusivas).
- **Preservar — sem PR, com commits à frente da `main`:** `arena/9c0da280-marcou` (54 commits; dono desconhecido), `arena/29-calendar-integration` (40), `fix/29-oauth-state-atomic` (41), `feat/29-google-calendar-sync` (3), `feat/21-booking-multiple-services` (2), `cc212db` (10), `fix/booking-transition-concurrency-incremental` (1), `arena/6f3a9b1f-marcou` (1), `arena/3b7c9d2f-marcou` (1; Agente 3 marcou APAGAR, falta confirmação de ausência de trabalho exclusivo).

## 5. W4-A6-T4 — Relatório parcial e pergunta de release

**PRs abertas e classificação**

| PR | Situação | Próximo passo |
|----|----------|---------------|
| #155 | OPEN, CLEAN, quality success (`b3c9e83`) — correção do P0 de DDD | Agente 1 integra conforme autonomia de merge (não é integração do Agente 6). Após o merge: verificar o SHA e fechar #57 com evidência |
| #154 | OPEN, CLEAN, quality success (`96f1490`) — imagens de serviço | Agente 4 (W4-A4-T1) |
| #150 | DRAFT, UNSTABLE, checks pendentes (`fc92a8b`) — design system | Agente 5 conclui pela regra `desbloqueio_150` do state; responsável confere visualmente no preview |
| #130 | DRAFT, DIRTY (`852f1dc`) — recuperação de senha | Responsável; não tocar (validação real pendente) |

**Pendências do responsável (runbook §7)**
1. Validação real de recuperação de senha e Supabase Auth (#130/#70); rotação de credenciais OAuth/SMTP.
2. Conexão real do Google Calendar e ativação de schedulers (sem ativar `BOOKING_EXPIRATION_ENABLED` nem lembretes).
3. Provisionamento Supabase/cron/deploy (#30, #20).
4. Escopo Marcou Social #72–#112: priorização (OWNER_DECISION). Comentários de status publicados nas #72–#79 na rodada 8.
5. Ordem das migrations da #142 (`20261125120000`, `130000` após `140000`/`153000`; não editar migration mergeada; ver `docs/BOOKING-OPS.md`).
6. #21 e #22: evidência ou reabertura.
7. #8: decisão sobre antecedência máxima e fechamento após as lacunas.
8. Inspeção visual desktop/mobile da #150 no preview (regra `desbloqueio_150`).

**Pergunta de GitHub Release:** publicar tag/GitHub Release para a `main` atual (`994cf1c`)? **Pergunta obrigatória (AGENTS.md): sem autorização. Nenhuma tag ou release foi criada.**

## 6. Registro na entrada `agent_6` do `state.json`

Esta sessão só escreve na própria branch `arena/3938e7c2-marcou`; não há push para `coordination/agents`. As tarefas W4-A6-T1 a T4 estão registradas aqui. Para o `state.json`, o coordenador deve copiar este relatório. Status:

- W4-A6-T1: concluída; bug P0 de DDD pendente de verificação após o merge da #155.
- W4-A6-T2: concluída; #57 reaberta; #8 mantida aberta; #21 e #22 pendentes.
- W4-A6-T3: concluída sem remoções (nenhuma prova suficiente).
- W4-A6-T4: parcial; atualizar quando #155, #154 e #150 terminarem.

Nenhum token, senha, link de recuperação ou dado pessoal foi registrado.
