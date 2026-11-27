# Modelo de versionamento e aceite

## Objetivo

Comprovar qual texto uma pessoa aceitou sem presumir concordância, sem misturar
aceite contratual com consentimento LGPD e sem confiar em versão/hash enviados
pelo navegador.

## Estados do documento

- `draft`: minuta pública para revisão. Não possui datas de publicação/efeito e
  nunca pode exigir aceite.
- `published`: versão corrente daquele `document_key`. Possui datas de publicação
  e efeito. Só uma versão pode estar publicada por chave.
- `retired`: versão anteriormente publicada, preservada para auditoria. Não volta
  a ser apresentada como corrente.

A troca de versão deve retirar a atual e publicar a sucessora na mesma transação.
O índice parcial no banco impede duas versões correntes da mesma chave.

## Conteúdo canônico e hash

`src/content/legal-documents.json` é validado no build/teste. A serialização
canônica cobre chave, título, versão, data textual, resumo material, aviso e
seções. O SHA-256 correspondente é persistido na metadata do banco.

A tela de aceite só aceita uma linha retornada pelo banco quando chave, versão,
hash, título e rota correspondem ao manifesto local publicado. Divergência falha
fechada: nenhum aceite é presumido ou gravado.

## Recibo

`legal_acceptances` registra:

- usuário autenticado;
- identificador do documento;
- chave, versão e hash como snapshot protegido por chave estrangeira composta;
- instante gerado pelo banco;
- origem controlada (`web`).

O navegador não insere diretamente. A RPC `record_legal_acceptances` valida o
JWT, o documento corrente/efetivo/obrigatório e o hash. A constraint única torna
a repetição idempotente. RLS permite que cada usuário leia apenas os próprios
recibos.

Não são coletados IP, user-agent ou localização para o recibo nesta fase, pois
não houve necessidade demonstrada. Qualquer expansão exige análise de finalidade
e retenção.

## Experiência sem dark pattern

- uma caixa separada e inicialmente desmarcada por documento;
- link direto para o texto, versão e hash;
- resumo da mudança material;
- botão explícito para aceitar e continuar;
- alternativa “não aceitar e sair” com consequência explicada;
- erro não resulta em aceite parcial presumido;
- versão nova publicada durante o fluxo obriga nova revisão.

## Recusa e revogação

### Documento contratual obrigatório

A pessoa pode recusar e encerrar a sessão. Sem aceite não acessa funcionalidades
autenticadas que dependam daquele contrato. A recusa não cria recibo.

Depois de aceito, “revogar os Termos” não é tratado como consentimento LGPD. A
pessoa pode deixar de usar o serviço e solicitar encerramento; retenções
necessárias e consequências deverão ser explicadas no fluxo de direitos e
retenção previsto no roadmap. O histórico de qual versão regeu operações
anteriores não deve ser reescrito.

### Consentimento de privacidade opcional

Preferências baseadas em consentimento terão finalidade e controle próprios,
com revogação tão simples quanto a concessão, sem invalidar tratamentos
anteriores lícitos. Elas não devem ser modeladas como aceite genérico dos Termos.
A implementação pertence ao módulo de direitos e retenção previsto no roadmap.

## Nova versão

- **Material e obrigatória:** `requires_acceptance = true`; todo usuário sem
  recibo da nova `document_id` fica pendente.
- **Informativa/não material:** `requires_acceptance = false`; permanece visível
  sem bloquear.

O sistema não considera um aceite antigo suficiente apenas porque a chave do
documento é igual. O recibo precisa apontar para a versão/hash corrente.

## Ativação gradual

A migration desta entrega semeia somente drafts. O gate obrigatório deve ser
ligado somente pela futura entrega de baseline e feature flag depois de:

1. revisão e aprovação;
2. manifesto e migration da versão publicada;
3. aplicação em desenvolvimento/homologação;
4. testes de banco e UI;
5. autorização explícita de produção.

Desativar o gate não apaga documentos nem recibos. Isso permite rollback da
interface sem falsificar o histórico.
