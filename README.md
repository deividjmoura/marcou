# Marcou

Plataforma de agendamento online para prestadores de serviços.

## Stack inicial

- Next.js 16 + React + TypeScript.
- Supabase Auth e PostgreSQL.
- Supabase Storage (comprovantes privados, a configurar).
- Vitest para testes do domínio.

A stack está registrada na proposta técnica e a fundação começa nesta branch. Nenhum projeto Supabase ou integração externa foi provisionado.

## Requisitos

- Node.js 22 ou superior.
- npm 10 ou superior.
- Projeto Supabase próprio para habilitar autenticação e persistência.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local
npm run dev
```

Preencha `.env.local` com a URL e a publishable key do projeto Supabase. Não coloque chaves secretas ou service-role no navegador nem no repositório.

## Comandos

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## Banco de dados

A migration inicial está em `supabase/migrations/`. Ela define perfis, prestadores, serviços, regras e exceções de disponibilidade, agendamentos, eventos de auditoria, RLS e uma constraint GiST para impedir intervalos ativos sobrepostos por prestador.

Antes de habilitar reservas reais, falta implementar a operação transacional server-side que:
1. valida autorização e serviço;
2. expira reservas vencidas que conflitam com o intervalo solicitado;
3. cria a reserva temporária com snapshot do serviço;
4. converte conflitos de exclusão em resposta de horário indisponível.

Não inserir reservas diretamente pelo cliente. As políticas RLS permitem leitura autorizada; não existe política de escrita direta para agendamentos. Isso impede que o navegador forje preço, expiração ou status confirmado. A criação e as transições deverão passar por operações server-side/RPC autorizadas.

## Domínio

O módulo `src/domain/bookings/booking.ts` contém regras puras de intervalos, ocupação e transições. Ele não substitui transação no banco, autenticação, autorização ou idempotência.

## Estado

Fundação inicial em andamento. Catálogo real, autenticação de usuário, painel do prestador, criação transacional de reservas, pagamento, WhatsApp e Google Calendar ainda não foram implementados.
