# Changelog

Todas as mudanças funcionais, visuais, estruturais, de segurança ou de banco de
dados do Marcou são registradas neste arquivo. As entradas abaixo descrevem o
trabalho das PRs em andamento; a aplicação em ambiente remoto depende de
validação separada pelo responsável.

## [Unreleased]

### Adicionado

- Motor de reservas com múltiplos serviços (`booking_services`, RPCs de
  agregação, compatibilidade com reservas de serviço único e backfill) na
  migration `20261125120000_booking_multiple_services.sql`.
- Matriz canônica de privilégios de tabelas/views em
  `scripts/privileges-check.mjs`, com handoff em
  `docs/handoffs/privilegios-tabelas.md` e inclusão de `booking_services` e da
  tabela futura de tokens do Calendar (`calendar_connections`).
- Verificação obrigatória de changelog (`scripts/changelog-check.mjs`,
  `npm run check:changelog`) e sua suíte unitária, necessárias para a validação
  desta entrega.

### Segurança

- Migration aditiva `20261125130000_table_privileges_matrix.sql`: remove o
  `UPDATE` direto de `authenticated` em `notifications` (a aplicação usa apenas
  as RPCs de leitura) e reafirma os grants mínimos de `booking_services`, sem
  alterar `bookings`, `booking_events`, dados, RLS ou assinaturas.
- `npm run test:db` agora falha se uma tabela ou view nova em `public` surgir
  sem entrada na matriz de privilégios; os 43 fluxos são executados antes e
  depois da migration para comprovar que a única diferença é o grant removido.
