# ADR: travas de segurança para demo do feed em Deploy Preview (Issue #132)

- **Status:** Desenho aprovado tecnicamente; implementação bloqueada até o feed social funcional (#90–#95) e autorização/configuração do responsável.
- **Data:** 2026-11-28
- **Escopo:** definir isolamento da demonstração com dados fictícios. Esta ADR não cria rota, fixture, variável ou configuração na Netlify.

## 1. Objetivo e ameaça

A demo deve permitir avaliar a interface do feed em PRs sem criar usuários falsos, inserir conteúdo no banco, tocar Supabase Auth ou expor fixtures no deploy de produção.

A ameaça principal é uma rota/flag habilitada por engano em produção ou branch deploy, ou um fixture estático incluído no bundle de produção mesmo que a rota responda 404. Também não se deve confiar em hostname, query string, header `Host`, `X-Forwarded-Host` ou parâmetro controlado pelo navegador para decidir o ambiente.

## 2. Gate duplo fail-closed

A demo só pode ser compilada/habilitada quando **todas** as condições forem verdadeiras:

1. Flag explícita `MARCOU_DEMO_FEED_ENABLED=true`, configurada somente no contexto Deploy Preview da Netlify.
2. Metadado de build `CONTEXT=deploy-preview`.
3. Metadado `PULL_REQUEST=true`.

Qualquer valor ausente, inválido ou diferente desabilita a demo. `branch-deploy`, `production`, `dev`, Preview Server e builds fora de PR não são elegíveis. O hostname `deploy-preview-N--...` pode ser útil para diagnóstico, mas não substitui os metadados confiáveis do build.

A documentação oficial da Netlify define `CONTEXT` e `PULL_REQUEST` como variáveis de build somente-leitura, e identifica `deploy-preview` como o contexto de builds gerados a partir de PRs:
- [Build environment variables — Netlify](https://docs.netlify.com/build/configure-builds/environment-variables/)
- [Deploy contexts — Netlify](https://docs.netlify.com/deploy/deploy-overview/)
- [Deploy Previews — Netlify](https://docs.netlify.com/deploy/deploy-types/deploy-previews/)

## 3. Impedir fixtures no bundle de produção

Uma simples condição de renderização/404 não basta se os dados forem importados estaticamente pelo código de produção. A implementação deve usar geração condicionada no build:

1. Guardar os fixtures em diretório isolado, por exemplo `fixtures/demo-feed/`, sem import estático por rotas ou componentes normais.
2. Executar um gerador antes do build Next.js. Ele lê fixtures e assets somente quando o gate duplo for verdadeiro.
3. Em Deploy Preview elegível, gerar módulo/asset isolado com os dados fictícios.
4. Em qualquer outro contexto, gerar stub vazio e não copiar assets de demo para `public/` ou output.
5. Fazer a rota server-only consultar a configuração gerada e responder 404 se a demo não estiver habilitada.
6. Não usar `next.config.ts` `env` para injetar objetos/fixtures: valores nessa opção podem ser incorporados aos bundles. A configuração gerada deve ser mínima, server-only e sem conteúdo fictício quando o gate estiver fechado.

O build de produção precisa provar ausência de um marcador textual exclusivo dos fixtures e dos assets de demonstração. O teste deve inspecionar o output final, não apenas testar a resposta 404.

## 4. Isolamento de dados e interações

- Fixtures são perfis, posts, serviços e comentários claramente fictícios, com IDs prefixados `demo_` e conteúdo sem PII real.
- Não criar usuários no Supabase Auth, registros em tabelas, Storage remoto ou contas de prestador.
- Não fazer chamadas ao Supabase para ler ou gravar fixtures.
- Curtidas/comentários simulados ficam em estado efêmero no cliente ou em memória do processo, sem persistência e sem qualquer endpoint de escrita.
- Não aceitar IDs `demo_` em ações reais de booking, perfil, WhatsApp, notificações ou Calendar.
- Imagens são assets locais da demo e só são copiadas no build elegível.
- Mostrar aviso visual inequívoco de que o conteúdo é demonstrativo.

## 5. Testes obrigatórios antes de liberar a demo

### Testes da função pura de gate

| Flag | CONTEXT | PULL_REQUEST | Resultado |
|---|---|---|---|
| `true` | `deploy-preview` | `true` | habilitado |
| `false` / ausente | qualquer | qualquer | desabilitado |
| `true` | `production` | `false` | desabilitado |
| `true` | `branch-deploy` | `false` | desabilitado |
| `true` | `dev` / ausente | ausente | desabilitado |
| `true` | `deploy-preview` | ausente / `false` | desabilitado |

### Testes de rota e build

- A rota responde 404 em produção, branch deploy, dev, preview server e metadados ausentes.
- A rota só retorna fixtures no Deploy Preview com os três gates verdadeiros.
- Nenhuma fixture é importada por rotas normais nem enviada ao Supabase.
- Build de produção não contém marcador, JSON ou asset exclusivo da demo.
- Build elegível de Deploy Preview contém os fixtures esperados e mostra o aviso demonstrativo.
- IDs `demo_` não passam por ações de booking, edição de perfil, WhatsApp ou endpoints reais.

## 6. Ativação, validação e remoção

**Antes de implementar:** feed funcional (#90–#95) deve estar integrado; o responsável decide se deseja habilitar a demo em Deploy Previews.

**Ativação controlada:** configurar `MARCOU_DEMO_FEED_ENABLED=true) apenas para o contexto Deploy Preview na Netlify; manter ausente/false em produção, branch deploy e demais contextos. Validar um Deploy Preview de PR e executar o teste negativo de produção.

**Desativação:** definir a flag como false/ausente, remover assets e fixtures, limpar output/cache de build e confirmar que o build de produção não contém o marcador. Não há limpeza de banco porque a demo nunca deve gravar dados.

## 7. Bloqueios e fora de escopo

- Issue #132 permanece bloqueada até o feed funcional e as issues de schema/posts/interações/consulta/UI (#90–#95).
- Não criar fixtures nem rota de demo nesta etapa.
- Não alterar Netlify, variáveis, Supabase, Auth, banco, Storage ou produção.
- Não incluir dados reais de clientes/prestadores nem usar contas reais para simular interação.
