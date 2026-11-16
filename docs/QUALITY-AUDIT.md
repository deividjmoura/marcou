# Auditoria de qualidade — Issue #31

Registro das verificações de qualidade executadas em 16/11/2026, com medições
reais e reproduzíveis. Nada aqui é estimativa: cada número foi obtido pelos
comandos listados em "Como reproduzir".

## Como reproduzir

```bash
npm run lint
npm run typecheck
npm test            # inclui a auditoria de contraste
npm run test:db     # inclui a seção [segurança e RLS]
npm run audit       # segredos + guarda de configuração (sem banco)
npm run build
```

## 1. Segurança e isolamento

Verificações automatizadas na seção `[segurança e RLS]` de `scripts/db-check.mjs`
(PostgreSQL real, migrations aplicadas do zero):

| Verificação | Resultado |
| --- | --- |
| Todas as tabelas de `public` com RLS habilitada | ok |
| Toda função `SECURITY DEFINER` fixa `search_path` | ok |
| `anon` sem privilégios de escrita | ok |
| `authenticated` não insere/apaga reservas, eventos ou notificações | ok |
| Prestador A não atualiza o negócio de B (RLS em escrita) | ok |
| Prestador A não cria serviço em B | ok |
| Políticas de `notifications` usam `auth.uid()` | ok |
| `with check` das políticas de update de `notifications` usa `auth.uid()` | ok |

O harness completo ficou em **53/53** (45 anteriores + 8 novos).

### Achados de segurança

| # | Severidade | Achado | Estado |
| --- | --- | --- | --- |
| S1 | Baixa | `/perfil` e `/redefinir-senha` quebram (HTTP 500) quando o Supabase não está configurado, por não usarem `isSupabaseConfigured()`. Detectado por `npm run audit` e confirmado em `next dev`. | **Não corrigido nesta issue** — páginas da Issue #23 (IDENTITY). Registrado aqui e no `AGENT_TASK_MARCOU.md`. |
| S2 | Informativa | `authenticated` tem `UPDATE` direto em `notifications`; a política RLS limita ao próprio `recipient_id` (com `with check`). Não é falha, mas é permissão maior que o mínimo. | Aceito; monitorar. |
| S3 | Informativa | `create_booking`/`transition_booking` são `SECURITY DEFINER` e recebem `slug`/`serviceId` do cliente. A autorização é validada dentro da função. | Aceito. |

`npm run audit` não encontrou padrões de segredo nos arquivos rastreados.

## 2. Acessibilidade

### Contraste (medição real)

`src/styles/design-tokens.test.ts` lê os CSS publicados, resolve os tokens e
mede a razão de contraste WCAG. Valores atuais:

| Par | Razão | AA (4.5:1) |
| --- | --- | --- |
| texto principal no papel | 13.01 | ok |
| texto principal no cartão | 14.33 | ok |
| texto auxiliar no cartão | 5.65 | ok |
| texto auxiliar no papel | 5.14 | ok |
| texto auxiliar no fundo rosé (agenda) | 4.80 | ok |
| texto auxiliar no fundo neutro (tags) | 4.94 | ok |
| cor de marca no fundo rosé | 5.37 | ok |
| cor de marca no cartão | 6.33 | ok |
| erro/aviso/sucesso/informação nos respectivos fundos | 6.52 / 5.75 / 5.54 / 6.73 | ok |
| botão primário (papel sobre tinta) | 13.01 | ok |
| `.card-footnote` (texto de 10px) | 5.65 no cartão, 5.14 no papel | ok |

### Correções aplicadas

| # | Severidade | Achado | Correção |
| --- | --- | --- | --- |
| A1 | Média | `.card-footnote` usava `#9b8b91` (3.23:1 no cartão, 2.94:1 no papel) — abaixo até do limite para texto grande. | Cor trocada para `var(--muted)`. |
| A2 | Baixa | `--ds-color-muted` (`#76686d`) resultava em 4.49:1 sobre `--ds-color-brand-soft` (texto de 10px em `.schedule-event small`), marginalmente abaixo de 4.5:1. | Token ajustado para `#736368` (4.80:1). |

Ambas as correções são automatizadas: o teste falha se algum par cair abaixo de
4.5:1.

### Verificado por inspeção (sem ferramenta de leitor de tela nesta sessão)

- Foco visível global via `:focus-visible` (`design-tokens.css` e `globals.css`).
- Alvos de toque com `min-height: 44px` (`--ds-control-min-height`).
- `prefers-reduced-motion` desligando animações/transições.
- Campos visíveis envolvidos por `<label>` (associação implícita).
- Estados assíncronos com `role="status"`/`aria-live="polite"` e `role="alert"`.

**Não verificado:** navegação real por teclado e leitor de tela. Requer sessão
assistida ou ferramenta como axe/VRT — ver pendências.

## 3. Performance

**Bloqueado nesta sessão.** Medição real de Core Web Vitals/Lighthouse exige a
aplicação publicada e um navegador; não houve deploy autorizado. O que foi feito:

- `npm run build` executado com sucesso; rotas e tamanhos reportados pelo Next.
- Imagens: a aplicação não usa `<Image>`/assets de imagem; o Landau usa CSS.
- JS inicial: sem dependências pesadas além de Next/React/Supabase SDK.

Para medir quando houver ambiente:

```bash
npx lighthouse https://<preview> --only-categories=performance,accessibility --output=json
```

## 4. Testes E2E

**Bloqueado.** E2E real precisa de Supabase configurado (login, cadastro, reserva)
e de um navegador; não há credenciais de ambiente nem harness de E2E no repositório
(não há Playwright/Cypress). Cobertura alternativa existente:

- `npm run test:db` cobre o fluxo de reserva no banco: criação, conflito,
  concorrência, expiração, transições, idempotência, isolamento e notificações.
- `src/app/p/[slug]/actions.test.ts` cobre carregamento, agenda vazia, erro e retry.

Pendência: introduzir Playwright e um ambiente com Supabase (Issue #30/#31).

## 5. Rate limiting

**Não implementado.** A aplicação não tem limitação de taxa; as rotas são estáticas
e a escrita passa pelas RPCs do Supabase. Rate limiting deve ser definido na
Issue #30 (PLATFORM), com o Supabase/Edge ou a infraestrutura de hospedagem, antes de expor a aplicação.

## 6. Tratamento de erros e estados de carregamento

- Consulta de disponibilidade: distingue erro de agenda vazia, com retry (Issue #8/PR #37).
- Páginas com Supabase: a maioria usa `isSupabaseConfigured()`; as duas exceções
  estão em S1.
- Notificações: RPC de marcar como lida com falha silenciosa e revalidação.

## 7. Cobertura

Não foi medida cobertura de código (o Vitest não está configurado com `--coverage`
e não há relatório gerado). Os testes existentes são de comportamento, não de
cobertura — não há número de cobertura para reportar.

## 8. Pendências

1. Corrigir S1 (guard de configuração em `/perfil` e `/redefinir-senha`) — Issue #23.
2. E2E com Playwright + ambiente Supabase — depende de #30.
3. Medição de Core Web Vitals/Lighthouse — depende de deploy autorizado.
4. Revisão assistida de teclado/leitor de tela.
5. Rate limiting — Issue #30.
6. Medição de cobertura de testes.
7. Ligar `npm run audit` ao pipeline de CI (a Issue #30 também altera `ci.yml`;
   coordenar para evitar conflito).

---

# Adendo — auditoria geral + Google OAuth (16/11/2026)

Atualização do estado dos achados e das verificações.

## S1 — corrigido

O guard de configuração foi estendido para todas as páginas e ações de servidor
que alcançam o Supabase:

- `src/app/(auth)/perfil/page.tsx`, `src/app/(auth)/redefinir-senha/page.tsx`,
  `login`, `cadastro` e `esqueci-senha` agora respondem com aviso em vez de 500.
- `src/app/(auth)/actions.ts`, `src/app/p/[slug]/actions.ts`,
  `src/app/painel/actions.ts`, `src/app/reserva/[id]/actions.ts`,
  `src/app/notificacoes/actions.ts` e `src/app/auth/callback/route.ts` validam
  `isSupabaseConfigured()` antes de usar o cliente.

Verificação em `next dev` sem env: `/login`, `/cadastro`, `/esqueci-senha`,
`/perfil` e `/redefinir-senha` respondem **200** com o aviso de configuração;
antes, `/perfil` e `/redefinir-senha` respondiam 500.

## Novas verificações em `npm run audit`

- `[guarda de entrada]`: ações de servidor (`**/actions.ts`) e rotas
  (`**/route.ts`) que usam Supabase precisam tratar a ausência de env.
- `[oauth]`: nenhum arquivo de `src/` pode importar `createClient` direto de
  `@supabase/supabase-js` (o `@supabase/ssr` é quem garante `flowType: "pkce"`).

Resultado atual: **0 falhas, 0 avisos**.

## Novos testes

- `src/app/auth/callback/route.test.ts` (6 testes): cancelamento do Google
  preserva `next`, falha da troca do code preserva `next`, destino com telefone,
  encaminhamento para `/perfil` sem telefone, nome do usuário não sobrescrito e
  nome do provedor preenchido só quando o perfil está vazio.
- `src/lib/identity.test.ts`: `loginRedirectUrl` e `oauthErrorMessage`.
- `src/app/p/[slug]/actions.test.ts`: erro amigável sem Supabase configurado.

`npm test` — **64/64** (7 arquivos). `npm run test:db` — **53/53**.

## Correções de OAuth

- O destino (`next`) deixou de ser perdido quando o consentimento é cancelado
  ou o link expira: o callback volta para `/login?error=...&next=...`.
- O nome escolhido pelo usuário em `/perfil` não é mais sobrescrito pelo nome
  do Google a cada login.

## Continua bloqueado

- Round-trip real com o Google e com o Supabase (requer credenciais/painel).
- E2E com navegador; Core Web Vitals/Lighthouse; revisão assistida por teclado
  e leitor de tela; medição de cobertura; rate limiting (Issue #30).
