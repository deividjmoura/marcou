# Marcou

Plataforma de agendamento online para prestadores de serviços.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript.
- Supabase Auth (e-mail/senha e Google) + PostgreSQL.
- Supabase Storage (comprovantes privados, a configurar).
- Vitest para testes de domínio e PostgreSQL embutido para integração.

## Requisitos

- Node.js 22 ou superior.
- npm 10 ou superior.
- Projeto Supabase próprio para habilitar autenticação e persistência.

## Desenvolvimento local

```bash
npm install --no-audit --no-fund --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

Preencha `.env.local` com a URL e a publishable key do projeto Supabase. Não
coloque chaves secretas ou service-role no navegador nem no repositório.

## Comandos

```bash
npm run dev        # ambiente de desenvolvimento
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run test       # testes de domínio (vitest)
npm run test:db    # testes de integração em PostgreSQL real (embedded-postgres)
npm run build      # build de produção
```

## Banco de dados

As migrations estão em `supabase/migrations/`:

1. `202611150001_initial_schema.sql` — perfis, prestadores, serviços, regras e
   exceções de disponibilidade, agendamentos, eventos de auditoria, RLS e a
   constraint GiST que impede intervalos ativos sobrepostos por prestador.
2. `202611150002_booking_operations.sql` — operações transacionais
   (`create_booking`, `transition_booking`, `expire_stale_bookings`,
   `get_provider_schedule`), grants e a configuração de expiração por prestador.
3. `202611150003_notifications.sql` — notificações no aplicativo: tabela,
   RLS, trigger sobre `booking_events`, RPC de lembrete e RPCs para marcar como
   lida. Detalhes em `docs/NOTIFICACOES.md`.

As regras de escrita ficam no banco, em funções `security definer` com
verificações explícitas de autorização. As políticas RLS permitem leitura
autorizada, mas não existem políticas de escrita direta para agendamentos: o
navegador não consegue forjar preço, expiração ou status confirmado.

Não aplique migrations em produção sem autorização.

## Motor de reservas

O núcleo é descrito em `docs/MOTOR-RESERVAS.md`. Resumo:

- A disponibilidade é projetada por `generateSlots` (domínio puro, testado) e
  confirmada no banco por `create_booking`, que valida expediente, expira
  reservas vencidas conflitantes e insere a reserva com snapshot do serviço.
- A constraint de exclusão GiST + `pg_advisory_xact_lock` por prestador impedem
  dupla marcação, inclusive sob requisições simultâneas.
- Transições de estado (`pending_payment`, `pending_review`, `confirmed`,
  `cancelled`, `expired`) são aplicadas por `transition_booking`, com
  autorização, validade e auditoria.
- A expiração libera o horário sem apagar o histórico e é registrada em
  `booking_events`.

## Fluxo implementado

1. Cadastro e login do prestador (e-mail/senha e Google).
2. Criação e configuração do negócio (nome, slug, fuso, prazo da reserva).
3. Cadastro de serviços (duração, preço, sinal, intervalo).
4. Expediente semanal, vigências e exceções (bloqueio/horário especial).
5. Página pública `/p/[slug]` com os serviços do negócio.
6. Escolha de serviço, data e horário pelo cliente.
7. Criação da reserva temporária e página de acompanhamento `/reserva/[id]`.
8. Painel do prestador com agendamentos, confirmação e cancelamento.
9. Notificações no aplicativo (`/notificacoes`) para cliente e prestador,
   geradas pelos eventos de agendamento.

## Notificações

Cada mudança de estado do agendamento gera notificações para os destinatários
corretos (criação, comprovante, confirmação, cancelamento, expiração e
lembretes). As mensagens ficam em `/notificacoes`, com contador de não lidas no
painel, em "Meus agendamentos" e na página da reserva. O acesso é isolado por
RLS: cada usuário só lê e marca as próprias notificações.

Lembretes são criados por `create_booking_reminders()`; ainda não há cron
configurado. E-mail não está implementado: nenhuma infraestrutura de envio está
configurada e nenhuma credencial foi criada.

## Plataforma e operação

Inventário de ambientes, matriz de variáveis, CI, deploy, rollback, backup e
observabilidade estão documentados em **[docs/PLATFORM.md](docs/PLATFORM.md)**
(Issue #30).

Resumo rápido:

- Variáveis públicas obrigatórias: `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ver `.env.example`).
- CI em GitHub Actions: lint, typecheck, testes de domínio, `test:db` e build.
- Deploy e aplicação de migrations em produção exigem autorização explícita do
  responsável; não há deploy automático de produção versionado neste repositório.
- Não commitar secrets. Não aplicar migrations remotas sem revisão.

## Pendências

- Provisionar o projeto Supabase e rodar as migrations em ambiente de
  desenvolvimento.
- Definir provedor de pagamento e fluxo real de comprovante (upload/validação).
- Definir provedor de WhatsApp e integração com Google Calendar.
- Configurar tarefa agendada para `expire_stale_bookings()` (a criação de
  reservas já expira conflitos imediatos).
- Configurar tarefa agendada para `create_booking_reminders()` (lembretes de
  agendamentos confirmados).
- Implementar e-mail de notificações quando houver provedor configurado.
- Revisar política de cancelamento/reembolso e prazo da reserva temporária.
