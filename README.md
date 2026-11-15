# Marcou

Plataforma de agendamento online para prestadores de serviços.

## Objetivo
Permitir que clientes consultem horários disponíveis, solicitem um agendamento e paguem um sinal para garantir a reserva. O prestador administra serviços, preços e disponibilidade em painel próprio.

## Escopo funcional
- Catálogo público de serviços com descrição, duração, preço e valor do sinal.
- Login de clientes por Google ou e-mail.
- Painel do prestador para configurar expediente, pausas, bloqueios, folgas e exceções por data.
- Agenda com horários calculados a partir da disponibilidade e dos agendamentos existentes.
- Reserva temporária durante o pagamento, com expiração configurável.
- Envio de comprovante pelo WhatsApp e confirmação após validação do pagamento.
- Integração Google Calendar para eventos e lembretes, mediante autorização.
- Área do cliente com próximos agendamentos e status.

## Regras essenciais
1. Alterações na disponibilidade não apagam agendamentos confirmados.
2. A reserva e a checagem de conflito devem ser atômicas no backend.
3. O horário fica temporariamente reservado durante o pagamento e só é confirmado após validação do sinal.
4. Comprovante enviado não significa pagamento aprovado.
5. Armazenar datas em UTC e exibir no fuso configurado (inicialmente America/Sao_Paulo).
6. Tokens OAuth, credenciais do WhatsApp e chaves de pagamento ficam somente no backend.

## Integrações planejadas
- Google Identity / Firebase Authentication para login.
- Google Calendar API para sincronização de eventos e lembretes.
- WhatsApp Business Platform ou o provedor já usado pelo bot existente.
- Provedor de pagamento a definir, com confirmação via webhook sempre que possível.

## Estado do projeto
Repositório inicialmente vazio. Esta documentação registra o escopo antes da implementação. As integrações externas dependem da confirmação do stack, do provedor do bot e do meio de pagamento.
