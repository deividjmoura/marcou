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
`next.config.ts` os captura no build e os injeta no bundle do servidor como
`MARCOU_AUTH_DEPLOY_CONTEXT` e `MARCOU_AUTH_DEPLOY_PRIME_URL`. São valores
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
