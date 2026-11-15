# Produto e arquitetura — Marcou

## Fluxo do cliente
1. Acessa a página pública e escolhe um serviço.
2. Visualiza horários livres, considerando duração, intervalo, expediente, bloqueios e reservas pendentes.
3. Faz login com Google ou e-mail e informa nome e WhatsApp.
4. Seleciona horário; o backend cria uma reserva temporária com prazo de expiração.
5. Paga o sinal pelo meio configurado e envia o comprovante pelo WhatsApp ou pelo fluxo integrado.
6. O bot/provedor encaminha o comprovante para validação. O backend confirma a reserva somente após aprovação confiável ou ação explícita do prestador.
7. Cliente e prestador recebem confirmação; eventos são sincronizados com o Google Calendar conforme permissões.

## Painel do prestador
- Cadastro de serviços: nome, descrição, duração, preço total, sinal e intervalo.
- Disponibilidade semanal por dia, múltiplos períodos e exceções por data.
- Bloqueio pontual, folga, férias e indisponibilidade.
- Visualização diária/semanal e status: aguardando sinal, aguardando validação, confirmado, cancelado e expirado.
- Configuração de conta Google, WhatsApp e política de cancelamento.

## Regras de agenda e concorrência
- Gerar horários com base na duração e no intervalo do serviço.
- Não oferecer slots que conflitem com agendamento, bloqueio ou evento ocupado importado do Google Calendar (se habilitado).
- Criar reserva temporária com transação/controle de concorrência para impedir dupla marcação.
- Expirar reservas sem pagamento e liberar o horário automaticamente.
- Alterações futuras não modificam compromissos confirmados; conflitos devem ser destacados.
- Usar idempotência em webhooks e sincronização para evitar duplicidades.

## Dados principais
- users: identidade, papel (cliente/prestador), nome e contatos.
- services: prestador, descrição, duração, preço, sinal, ativo.
- availability_rules: dia da semana, faixas de horário e vigência.
- availability_exceptions: data, tipo (bloqueio/horário especial) e faixas.
- bookings: cliente, serviço, início/fim, status, expiração e referências externas.
- payment_proofs: arquivo protegido, remetente, data e status de validação.
- calendar_connections: tokens protegidos, calendário e estado da sincronização.
- notification_events: tentativas, canal, status e chave de idempotência.

## Arquitetura sugerida (a confirmar)
- Frontend responsivo: Next.js + TypeScript.
- Backend e dados: Firebase Authentication + Cloud Firestore + Cloud Functions.
- Google Calendar: OAuth 2.0 no backend e Calendar API.
- WhatsApp: reaproveitar o provedor/API e webhook do bot existente, se compatível.
- Pagamento: provedor com confirmação via webhook. PIX com conferência manual pode ser etapa inicial, mas imagem isolada não confirma pagamento.

## Segurança e privacidade
- Regras de acesso por papel e por proprietário dos dados.
- Comprovantes em bucket privado, com acesso temporário e auditável.
- Segredos e refresh tokens somente no backend/Secret Manager.
- Validar assinatura dos webhooks, idempotência, upload e tipos de arquivo.
- Consentimento explícito para criar eventos na agenda Google do cliente; alternativa de adicionar evento por link/arquivo quando não houver OAuth.
- Política de retenção e exclusão de dados pessoais e comprovantes.

## Decisões pendentes
1. Confirmar Firebase como backend definitivo ou indicar outra stack.
2. Repositório identificado: `deividjmoura/SEGA_stats_bot`, implementação WhatsApp na branch `feat/nox-agenda-sugestoes-20261015`, diretório `whatsapp-service/`.
3. Definir meio de pagamento do sinal e forma de aprovação (webhook automático ou conferência manual).
4. Confirmar serviços, duração, preços e valor/percentual do sinal a partir do catálogo.
5. Definir se a agenda Google do prestador será fonte de disponibilidade ou apenas receberá cópias dos agendamentos.
6. Definir duração da reserva temporária e política de cancelamento/reembolso.

## Análise do bot WhatsApp existente

Repositório de referência: `deividjmoura/SEGA_stats_bot`, branch `feat/nox-agenda-sugestoes-20261015`.

- O serviço isolado está em `whatsapp-service/`, usa Node.js (ES modules), `@whiskeysockets/baileys` `7.0.0-rc14` e `pino`.
- O README do serviço documenta execução persistente na Railway, autenticação WhatsApp em diretório persistente e chave de criptografia mantida em segredo.
- O bot já contém lógica de agenda de eventos e presença (`agendaAttendance.js`, `agendaTiming.js`), útil como referência de experiência e regras, mas não é um motor de reservas de serviços nem deve ser acoplado diretamente ao domínio Marcou.
- A implementação Baileys é não oficial e pode sofrer mudanças ou restrições. Para um serviço comercial, avaliar a WhatsApp Business Platform oficial antes de produção. Se o responsável optar por manter Baileys no MVP, isolar a conexão num serviço/adapter separado para permitir substituição sem reescrever agendamentos.
- O Marcou deve enviar eventos ao adapter (por exemplo: `booking.pending_payment`, `payment.approved`, `booking.confirmed`, `booking.cancelled`); o adapter envia mensagens e encaminha respostas/mídias recebidas para endpoints autenticados do backend.
- Não compartilhar a sessão WhatsApp, os arquivos de autenticação, o volume Railway ou a chave de criptografia do NOX com o Marcou. A conexão do prestador deve ser própria e autorizada para esse uso.

### Próxima etapa de integração

Criar um contrato independente para o WhatsApp (envio de texto, instrução PIX, recebimento de comprovante/mídia, consulta de status e envio de confirmação), com webhook autenticado, idempotência e correlação por `bookingId`. A validação do pagamento deve ocorrer no backend, nunca por inferência do texto ou da imagem recebida.
