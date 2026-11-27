# Segurança dos redirects de autenticação por ambiente

## Fonte de origem confiável

Os redirects e links de e-mail são construídos com `trustedAppOrigin()` em
`src/lib/identity.ts`. Nenhuma rota usa `request.nextUrl.origin`, `Host`,
`x-forwarded-host` ou origem fornecida pelo formulário para definir o domínio
de recuperação.

- **Production:** origem canônica `https://marcoou.netlify.app`.
- **Netlify Deploy Preview:** somente quando `MARCOU_AUTH_DEPLOY_CONTEXT=deploy-preview`, usa
  `MARCOU_AUTH_DEPLOY_PRIME_URL` e aceita exclusivamente HTTPS com hostname
  `deploy-preview-<número>--marcoou.netlify.app`. Hostname, protocolo, porta,
  userinfo, caminho, query e fragmento são validados.
- **Desenvolvimento local:** `NEXT_PUBLIC_SITE_URL=http://localhost:3000`;
  localhost pode ser usado como fallback somente fora de production.
- Preview sem URL válida ou qualquer origem de configuração não autorizada
  retorna à origem canônica de produção (fail closed).

Os metadados internos `CONTEXT` e `DEPLOY_PRIME_URL` existem durante o build da
Netlify, mas não são variáveis read-only disponíveis às Functions em runtime.
`next.config.ts` os captura no build e os injeta pelo recurso `env` do Next.js
como `MARCOU_AUTH_DEPLOY_CONTEXT` e `MARCOU_AUTH_DEPLOY_PRIME_URL`. Esse recurso
pode embutir os valores em bundles JavaScript; por isso só são usados dados
públicos de deployment, nunca secrets. Não copie `Host`, `X-Forwarded-Host` ou
valores do navegador para essas variáveis.

## Variáveis

| Variável | Fonte/uso |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Desenvolvimento local; produção deve usar a origem canônica. Não é usada para escolher o domínio em Deploy Preview. |
| `CONTEXT` | Metadado read-only da Netlify no build; capturado por `next.config.ts`. |
| `DEPLOY_PRIME_URL` | Metadado read-only da Netlify no build; capturado por `next.config.ts`. |
| `MARCOU_AUTH_DEPLOY_CONTEXT` | Valor de `CONTEXT` injetado pelo Next.js no bundle do servidor. |
| `MARCOU_AUTH_DEPLOY_PRIME_URL` | Valor de `DEPLOY_PRIME_URL` injetado pelo Next.js no bundle do servidor. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase usado no ambiente. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública do projeto Supabase. |

Configure o contexto Production e Deploy Previews no Netlify e deixe os metadados
de contexto gerenciados pela plataforma intactos. Não cadastre valores derivados
de requisição nem substitua os metadados de build.

## Recuperação de senha — contrato do código e do template

A Server Action `requestPasswordResetAction` sempre envia
`redirectTo=<origem confiável>/auth/confirm?next=%2Fredefinir-senha`.
O endpoint `/auth/confirm` verifica `token_hash` com `type=recovery` e ignora
qualquer destino `next` alternativo; a origem do redirect final é resolvida
novamente pela configuração confiável.

No template **Reset Password** do Supabase, use exatamente este padrão
(HTML-escape do `&` é necessário no atributo):

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">
  Redefinir minha senha
</a>
```

O template usa `RedirectTo` gerado pela solicitação, sem substituir por Site URL,
URL hardcoded, `request origin` ou `Host`. O token hash é passado ao endpoint
de confirmação e não deve ser colocado em logs, tickets ou URLs de analytics.

O template remoto do Supabase não é versionado neste repositório e não foi
consultado/alterado por esta entrega. A configuração real deve ser conferida
manualmente no painel Supabase. Templates Confirm signup devem seguir o mesmo
contrato, usando `type=email`.

## Redirect allowlist do Supabase Auth

Em Authentication → URL Configuration, mantenha a URL de produção como Site URL
e autorize os endpoints `/auth/confirm**` e `/auth/callback**` para produção,
localhost e previews Netlify conforme a política. Para previews, use o padrão
restrito do site `https://deploy-preview-*--marcoou.netlify.app/auth/confirm**`
e `/auth/callback**` ou allowlists de URLs específicas. Não use wildcard de
host amplo. A aplicação falha para a origem canônica quando a origem preview
não é validada; Supabase deve ter a allowlist do preview para evitar fallback
silencioso para Site URL.

## Testes de segurança

Os testes automatizados cobrem:
- origem canônica de produção mesmo se o request origin for manipulado;
- deploy preview Netlify válido;
- domínio preview não pertencente ao site e preview URL adulterada;
- configuração de produção não autorizada;
- Server Action de recuperação emitindo o callback com origem de preview e
  caminho fixo `/redefinir-senha`.

Não altere configurações remotas do Supabase durante os testes.


## Checklist operacional do responsável

### 1. Supabase Auth — URL Configuration

- **Onde:** Supabase Dashboard → Authentication → URL Configuration.
- **Site URL esperado:** `https://marcoou.netlify.app` (sempre produção, não um preview).
- **Redirect URLs permitidas:**
  - `https://marcoou.netlify.app/auth/confirm**`
  - `https://marcoou.netlify.app/auth/callback**`
  - `https://deploy-preview-*--marcoou.netlify.app/auth/confirm**`
  - `https://deploy-preview-*--marcoou.netlify.app/auth/callback**`
  - Opcional, apenas desenvolvimento: `http://localhost:3000/auth/confirm**` e `http://localhost:3000/auth/callback**`.
- **Como validar:** conferir literalmente o Site URL e os quatro padrões; não aceitar wildcard genérico como `https://**.netlify.app/**`.
- **Evidência correta:** produção e preview oficial são aceitos; URLs externas, outro site Netlify e hosts com sufixos adicionais não são permitidos. A query `next` não provoca fallback para Site URL.

### 2. Supabase Auth — Reset Password template

- **Onde:** Supabase Dashboard → Authentication → Email Templates → Reset Password.
- **Valor esperado:** o link deve usar `{{ .RedirectTo }}` seguido de `&amp;token_hash={{ .TokenHash }}&amp;type=recovery`, conforme o snippet acima.
- **Como validar:** revisar o HTML salvo sem gerar e-mail de teste; confirmar que não há `{{ .SiteURL }}` hardcoded, domínio fixo, nem remoção do caminho/query de `RedirectTo`.
- **Evidência correta:** quando um pedido autorizado for feito, o link deve conter `/auth/confirm?next=%2Fredefinir-senha`, `token_hash` e `type=recovery`; não deve conter token em logs ou analytics.

### 3. Netlify — domínio e Deploy Preview

- **Onde:** Netlify → Site configuration → Domain management; e Deploys → Deploy Previews.
- **Valor esperado:** domínio de produção do site `marcoou.netlify.app`; preview no formato `https://deploy-preview-<número>--marcoou.netlify.app`.
- **Como validar:** abrir um Deploy Preview oficial da PR e conferir o hostname completo; confirmar que o preview é do mesmo site Netlify.
- **Evidência correta:** o domínio de produção continua canônico e o preview oficial usa o hostname numerado exato; domínio de outro site ou suffix malicioso não passa na validação.

### 4. Netlify — variáveis por ambiente

- **Onde:** Netlify → Site configuration → Environment variables.
- **Esperado:** `CONTEXT` e `DEPLOY_PRIME_URL` são metadados read-only do build; não criar overrides manuais. `next.config.ts` os captura em cada build. `NEXT_PUBLIC_SITE_URL` deve ser `https://marcoou.netlify.app` em Production e `http://localhost:3000` somente em desenvolvimento local. `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` devem apontar para o projeto correto.
- **Escopo:** variáveis de aplicação necessárias ao build devem incluir Builds; qualquer variável lida por Functions em runtime também precisa incluir Functions. As variáveis `MARCOU_AUTH_DEPLOY_CONTEXT` e `MARCOU_AUTH_DEPLOY_PRIME_URL` são produzidas pelo Next.js no build, não devem ser preenchidas manualmente.
- **Segredos:** não copiar nem solicitar valores secretos em PR, chat ou checklist. Nunca usar service-role no cliente; mantenha credenciais exclusivamente nos consoles protegidos.
- **Como validar:** revisar nomes, contexts Production/Deploy Previews e scopes; depois de qualquer alteração de variável, gerar um novo Deploy Preview/build para aplicar.
- **Evidência correta:** produção resolve para `https://marcoou.netlify.app`; Deploy Preview resolve para seu próprio hostname oficial. A função não depende de `Host` nem `X-Forwarded-Host`.

### 5. Teste funcional — produção e preview

- **Onde:** páginas `/esqueci-senha` e `/redefinir-senha` do domínio de produção e de um Deploy Preview oficial.
- **Como validar:** somente após aprovação do responsável para enviar um e-mail real, solicitar recuperação com uma conta de teste controlada, abrir o link no mesmo ambiente que iniciou a solicitação, confirmar a nova senha e entrar com ela. Repetir separadamente em produção e preview; nunca compartilhar o link ou token.
- **Evidência correta:** produção termina em `https://marcoou.netlify.app/redefinir-senha`; preview termina no hostname do próprio preview em `/redefinir-senha`; a senha atualiza e o login com a nova senha funciona. Token expirado/reutilizado deve falhar com mensagem segura.
- **Limite desta entrega:** nenhum e-mail foi enviado e nenhuma configuração externa foi alterada; o teste funcional permanece pendente de execução autorizada pelo responsável.

## Relação com as PRs #71 e #127

- **#71** é somente um runbook WIP baseado no fluxo antigo `/auth/callback?flow=recovery`; não altera código e não cobre a origem de Deploy Preview.
- **#127** adiciona o fallback de `code`/`token_hash` órfãos, a classificação do callback PKCE e testes de regressão. Sua branch permanece preservada e não foi modificada por esta PR.
- **#130** acrescenta o vínculo da origem confiável ao deployment, o tratamento do contexto de preview e o checklist de configuração/template.
- **Conclusão:** o conteúdo operacional da #71 fica coberto e atualizado por #130, enquanto a lógica de fallback que ela não implementava está na #127. Recomenda-se encerrar a #71 como substituída após revisão do responsável; não é necessário mesclar nem alterar sua branch.
