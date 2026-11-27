# Taxonomia, modalidades e áreas de atendimento

- **Issue:** [#87](https://github.com/deividjmoura/marcou/issues/87)
- **Migration:** `20261123143000_discovery_taxonomy_service_areas.sql`
- **Feature flag:** `social_discovery`
- **Estado remoto:** migration não aplicada; nenhuma configuração de produção foi alterada

## 1. Objetivo e limites

Esta entrega cria a base de descoberta sem antecipar a busca/ranking da #88. Ela
permite classificar serviços, declarar como são prestados e informar regiões
aproximadas de atendimento.

O domínio de área **não armazena**:

- rua ou logradouro;
- número/complemento;
- CEP;
- latitude/longitude ou coordenada residencial exata;
- endereço privado do profissional ou do cliente.

Locais privados necessários a uma contratação pertencem ao fluxo futuro da #97
e devem continuar autorizados pelo contexto da contratação, nunca reutilizados
como dados públicos de descoberta.

## 2. Modelo

### Categorias versionadas

`service_categories` guarda a identidade estável (`id` e `stable_key`). Nome e
descrição ficam em `service_category_versions`; apenas uma versão pode ser
corrente. `service_category_aliases` fornece termos normalizados sem trocar a
identidade da categoria.

Estados possíveis:

- `draft`: em preparação, não pode ser atribuída a um serviço;
- `published`: disponível no catálogo;
- `retired`: não recebe novas atribuições, mas continua preservada para dados
  existentes.

Categorias referenciadas usam `ON DELETE RESTRICT`. Uma mudança de nome cria
nova versão em transação; não altera IDs nem reservas históricas. O catálogo
inicial é pequeno e deliberadamente geral. Evoluções passam pelo fluxo de
moderação abaixo.

### Modalidades

Cada serviço possui uma lista não vazia e sem duplicatas:

| Valor | Exibição |
|---|---|
| `provider_location` | No espaço do profissional |
| `customer_location` | No local do cliente |
| `remote` | Online ou remoto |

`customer_location` exige pelo menos uma área ativa do mesmo prestador. O banco
impede apagar/desativar a última área enquanto algum serviço ainda anuncia essa
modalidade.

### Áreas aproximadas

`provider_service_areas` aceita três precisões:

- `city`: cidade/UF;
- `neighborhood`: bairro, cidade e UF;
- `radius`: raio entre 1 e 200 km ao redor da cidade ou do bairro informado.

A fonte (`provider_declared`, `ibge_catalog` ou `geocoded_approximate`) fica no
registro interno. Chaves normalizadas e índices evitam duplicatas e preparam
filtros por UF, cidade, bairro e modalidade. Nenhuma geocodificação exata é
feita nesta entrega.

Como os nomes declarados podem aparecer publicamente, a validação é
conservadora: cidade e bairro rejeitam algarismos, separadores típicos de
endereço e tokens de logradouro, inclusive abreviações. Um bairro legítimo com
numeral deve ser escrito por extenso ou representado pela cidade/raio. Essa
restrição evita que número residencial seja disfarçado em um campo de região.

## 3. Autorização e exposição pública

- categorias publicadas são catálogo público sem PII;
- sugestões e áreas são gerenciadas somente pelo owner derivado de
  `providers.owner_id` e `auth.uid()`;
- outro prestador recebe zero linhas por RLS;
- `anon` não possui `SELECT` direto em `provider_service_areas`;
- a leitura pública ocorre somente por
  `get_public_provider_discovery(provider_slug)`;
- a RPC exige prestador publicado e rollout público de 100% da flag
  `social_discovery`;
- a resposta inclui somente o identificador público já usado no agendamento,
  categoria atual por slug/nome/versão, modalidades e cidade/bairro/raio
  aproximado;
- UUID interno da categoria, source, chaves normalizadas, timestamps e dados de
  ownership não entram na resposta.

Feature flag é controle de lançamento, não autorização. RLS, ownership,
constraints e projeção mínima continuam válidos quando a flag está ligada.

## 4. Moderação de novas categorias

O painel não cria categorias diretamente. Ele insere uma solicitação `pending`
em `service_category_suggestions`; o navegador não pode atualizar, aprovar ou
rejeitar essa linha.

Até o painel administrativo da #108 existir, uma operação privilegiada deve:

1. consultar a fila sem copiar PII para tickets ou logs;
2. verificar se uma categoria/alias equivalente já existe;
3. escolher parent e `stable_key` normalizado;
4. em uma transação, criar a identidade e a versão corrente ou adicionar alias;
5. marcar a sugestão como `approved` ou `rejected`, com nota objetiva;
6. registrar o operador e o horário de revisão;
7. validar o catálogo e os serviços afetados antes do commit.

Não conceder escrita de taxonomia a `anon` ou `authenticated`. Operações
administrativas usam papel aprovado e auditável; não criam chave de serviço no
navegador.

## 5. Compatibilidade e rollout

A migration faz backfill de todos os serviços existentes para:

- categoria `Serviços gerais` (`10000000-0000-4000-8000-000000000001`);
- modalidade `provider_location`.

Esses também são os defaults de compatibilidade para uma versão antiga do app.
O código novo só envia categoria/modalidade quando a flag autenticada está
liberada; com a flag desligada, o fluxo atual de cadastro e agendamento permanece
inalterado.

Sequência recomendada, sempre com autorização explícita para o ambiente alvo:

1. aplicar e validar a migration em ambiente não produtivo;
2. executar `npm run test:db` e inspecionar grants/RLS;
3. habilitar `social_discovery` para uma conta interna por override;
4. testar gestão do painel, constraints e página de agendamento;
5. validar que nenhum endereço exato aparece em rede, logs ou HTML;
6. ampliar a coorte autenticada;
7. liberar 100% somente quando a projeção pública puder aparecer;
8. medir consultas com volume real antes de afirmar metas de desempenho.

## 6. Rollback

Para interromper a superfície:

1. definir `is_enabled = false` para `social_discovery`;
2. confirmar que a RPC pública retorna `null`;
3. manter as colunas/tabelas e voltar o código ao fluxo anterior, se necessário.

Não remover enums, categorias, áreas ou colunas em rollback operacional. Dados
podem estar referenciados por serviços. Correções de schema devem ser uma nova
migration forward-only. Aposentar categoria é preferível a apagá-la.

## 7. Evidências locais

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

`npm run test:db` executa quatro harnesses em sequência: booking legado,
fundação social, identidade/account modes e descoberta. `discovery-check.mjs`
cobre catálogo/versionamento, defaults legados, constraints de categoria e
modalidade, duplicatas, filtros por região, proteção concorrente da última área,
RLS entre dois tenants, moderação, grants, índices e a projeção pública sem
campos de endereço exato ou UUID interno de categoria. A migration de identidade
`20261123140000_account_modes.sql` é aplicada antes da migration de descoberta
`20261123143000_discovery_taxonomy_service_areas.sql`.
