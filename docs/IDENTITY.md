# Identidade, autenticação e áreas da conta

O Marcou usa **Supabase Auth** como fonte única de credenciais e identidade. Não há conta Firebase nem uma segunda identidade de aplicação. `auth.users.id` é a chave que relaciona o perfil privado e, quando existir, o negócio profissional.

## Fluxos implementados

- Cadastro e login com e-mail/senha; confirmação do e-mail é feita por token hash em `/auth/confirm`.
- Reenvio da confirmação por `auth.resend({ type: "signup" })`. Para qualquer endereço válido, o retorno é igual, sem indicar se a conta existe, já foi confirmada ou atingiu um limite.
- Google OAuth pelo Supabase Auth usando **PKCE**. O callback da aplicação é `/auth/callback`.
- Troca do code, cookies de sessão, provisionamento de perfil, renovação de sessão no `proxy.ts` e logout com `signOut`.
- Recuperação em `/esqueci-senha` e redefinição em `/redefinir-senha`. O pedido usa uma resposta não enumerável; um token de recuperação válido sempre termina em `/redefinir-senha`, inclusive quando o link é aberto em outro navegador.
- Destinos pós-autenticação validados localmente após decodificação repetida e normalização de URL. URLs absolutas externas, caminhos `//`, barras invertidas, controles e formas codificadas de escapar são recusados.
- As rotas que recebem `code` ou `token_hash` respondem `Cache-Control: private, no-store`, `Pragma: no-cache`, `Expires: 0` e `Referrer-Policy: no-referrer`. O código nunca exibe `error_description` do provedor; mensagens exibidas pela query de login também passam por allowlist.
- Páginas privadas exigem sessão. Se a sessão faltar, `requireUser` envia a pessoa ao login com um `next` seguro.

## Fluxo de e-mail e templates

O cadastro e o reenvio passam `emailRedirectTo` como `/auth/confirm?next=<caminho-local-seguro>`. Em **Supabase Dashboard → Authentication → Email Templates**, personalize os links para que o endereço `RedirectTo` da solicitação seja a rota da aplicação e o token hash seja verificado no servidor.

### Confirm signup

Use este link no template **Confirm signup** (o `RedirectTo` já contém a origem e o `next` da solicitação):

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">
  Confirmar meu e-mail
</a>
```

`/auth/confirm` valida o `token_hash` por `verifyOtp`, cria os cookies de sessão e prepara `profiles`. Se o telefone ainda não estiver preenchido, direciona a pessoa para `/perfil` e depois retorna ao destino local solicitado.

### Reset Password

O pedido de recuperação fixa `RedirectTo` em `/auth/confirm?next=%2Fredefinir-senha`. Use no template **Reset Password**:

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=recovery">
  Redefinir minha senha
</a>
```

A rota verifica o token como `recovery` e ignora qualquer destino alternativo: sempre encaminha a `/redefinir-senha`. Assim, a sessão é criada no navegador que abriu o link, sem depender de um cookie PKCE guardado no navegador que solicitou o e-mail. Depois de atualizar a senha, o Marcou encerra a sessão e pede novo login.

Substitua o link padrão dos templates pelos exemplos acima. Não acrescente `error_description`, token ou code a um destino de login, não copie links completos para tickets e não use o token em logs.

## PKCE, callback e cookies

Os clientes são criados por `@supabase/ssr` em `src/lib/supabase/server.ts` e `src/lib/supabase/client.ts`, com `flowType: "pkce"`. No login Google, o Supabase guarda o `code_verifier` em cookie; o provedor retorna ao callback da aplicação com `code`, e `/auth/callback` troca esse code por uma sessão por meio de `exchangeCodeForSession`. O fluxo implícito com tokens em fragmento não é utilizado.

O entrypoint `src/proxy.ts`, ao lado de `src/app` conforme a estrutura Next.js 16 do projeto, chama `src/lib/supabase/proxy.ts`, que valida claims e propaga os cookies renovados. O callback e a confirmação mantêm a escrita de cookies no adaptador SSR. O logout chama `auth.signOut()` e redireciona para a página pública.

Falhas de consentimento, troca de code, confirmação ou carregamento de perfil resultam em mensagens genéricas escritas pelo Marcou. `error_description` não é lido nem encaminhado. Destinos dos links são restringidos a caminhos da própria aplicação por `safeNextPath`/`safeNextPathFromUrl` em `src/lib/identity.ts`.

## Modelo de identidade, perfil e modos

- **Identidade única:** `auth.users.id` é a identidade da pessoa.
- **Perfil privado:** `public.profiles.id` referencia `auth.users.id` 1:1 e contém `display_name` e telefone. RLS limita a leitura/escrita à própria conta. O nome de Google/cadastro só preenche um perfil sem nome; o telefone não é inferido.
- **Negócio profissional:** `public.providers.owner_id` referencia a mesma identidade e é único. Os campos comerciais ficam em `providers`; a leitura pública continua condicionada às políticas existentes (por exemplo, negócio publicado), e ações profissionais dependem de ownership.
- **Preferência privada de navegação:** `public.account_preferences.preferred_mode` aceita somente `customer` ou `provider`. A migration `20261123140000_account_modes.sql` cria a tabela privada e as RPCs `get_preferred_mode()`/`set_preferred_mode(text)`. Ambas derivam o ator de `auth.uid()`; a leitura retorna `customer` para contas sem provider próprio, e a escrita só grava `provider` se houver `providers.owner_id = auth.uid()`.
- **Preferência não é autorização:** nenhum `role`, `user_id` ou `provider_id` do navegador concede acesso. `/painel` e suas ações continuam buscando o negócio do usuário autenticado no servidor e o banco/RLS continuam sendo a fronteira de autorização.
- **Hub e seletor:** `/inicio` oferece as áreas Cliente e Profissional. O seletor também aparece em `/minha-conta` e `/painel`. Sem provider próprio, a preferência efetiva permanece Cliente; a opção Profissional leva ao setup, sem persistir o modo. Depois da criação, a ação pode salvar a preferência Profissional pela RPC (que valida o ownership no banco). Criar o negócio usa o mesmo `auth.users.id`, não cria outra conta e mantém `/minha-conta` e agendamentos de cliente disponíveis.

A migration `20261123140000_account_modes.sql` é aditiva, usa timestamp UTC único de 14 dígitos posterior a `20261123133000_harden_security_definer_grants.sql` e não altera as flags sociais nem o motor de reservas. Cada RPC nova `SECURITY DEFINER` fixa `search_path = pg_catalog, public`, revoga `EXECUTE` de `public`, `anon` e `authenticated` na própria migration e concede somente a `authenticated`; não depende do hardening anterior. A migration não foi aplicada a nenhum projeto Supabase remoto por esta entrega.

## Configuração de ambiente — ação do responsável

### Netlify

Defina, por site/ambiente, as variáveis públicas já usadas pela aplicação:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Origem HTTPS pública deste ambiente, sem caminho (por exemplo `https://<site-oficial>`). Para desenvolvimento local: `http://localhost:3000`. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase correspondente. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable/anon pública do projeto; nunca use service-role no navegador. |

No Netlify, cadastre os valores em **Site configuration → Environment variables**, considerando os contexts Production, Deploy Previews e Branch Deploys conforme a política do projeto. `NEXT_PUBLIC_SITE_URL` deve apontar para a origem do preview publicado que iniciou o fluxo, para que os links de e-mail voltem ao mesmo ambiente. Os handlers de autenticação não refletem `Host`/`x-forwarded-host` em links ou redirects: se a variável estiver ausente ou inválida, a origem fecha para `http://localhost:3000`; configure-a em todo ambiente publicado.

### Supabase Auth URLs

Em **Authentication → URL Configuration**:

1. Defina **Site URL** como a origem canônica de produção (`https://marcoou.netlify.app`).
2. Permita somente os callbacks da aplicação que serão usados: `/auth/callback` (Google/PKCE) e `/auth/confirm` (e-mail e recuperação) para local e ambientes oficiais.
3. Como `googleLoginAction`, `signupAction`, `resendSignupConfirmationAction` e `requestPasswordResetAction` anexam a query `?next=<caminho-local-seguro>` ao callback, e o Supabase Auth valida `redirect_to` com `glob.MustCompile(uri, '.', '/')` sobre a URL completa (incluindo query string) para qualquer origem fora do `Site URL`, cadastre as entradas da allowlist com sufixo `**` nos dois caminhos autorizados:
   - Produção: `https://marcoou.netlify.app/auth/callback**` e `https://marcoou.netlify.app/auth/confirm**`
   - Localhost: `http://localhost:3000/auth/callback**` e `http://localhost:3000/auth/confirm**`
   - Deploy Previews da Netlify (quando utilizados): entradas exatas `https://deploy-preview-<número>--marcoou.netlify.app/auth/callback**` e `/auth/confirm**`, ou restrito a `https://deploy-preview-*--marcoou.netlify.app/auth/callback**` e `/auth/confirm**` (observe o duplo hífen `--` usado pela Netlify; nunca use wildcard de host genérico).
4. Sem o sufixo `**`, o matcher glob rejeita `?next=...` em origens fora do `Site URL` e faz fallback silencioso para a raiz do `Site URL`.

### Google Cloud e provider Google no Supabase

Não confunda os dois callbacks envolvidos no OAuth 2.0:

- **Callback do Google para o Supabase (`redirect_uri` enviado ao Google):**
  `https://peornypgltuueubmsucm.supabase.co/auth/v1/callback`
  — **este é o único URI de callback que deve estar em Authorized redirect URIs no Google Cloud Console.**
- **Callback final do Supabase para a aplicação Marcou (`redirectTo` enviado ao Supabase):**
  `https://marcoou.netlify.app/auth/callback?next=...` (ou `http://localhost:3000/auth/callback?next=...` em ambiente local)
  — **este fica na allowlist do Supabase Auth (`Redirect URLs`), nunca no Google Cloud Console.**

#### Instruções de conferência manual (Google Cloud Console + Supabase)

1. Acesse **Google Cloud Console → APIs & Services → Credentials** no projeto proprietário do OAuth Client ID `563590504578-mjat63su5ri3seo1d09dbaspkm9vgplk.apps.googleusercontent.com`.
2. Abra essa credencial **OAuth 2.0 Client ID (Web application)** e confira em **Authorized redirect URIs** que consta exatamente (sem barra final `/`, sem espaços e usando `https`):
   ```text
   https://peornypgltuueubmsucm.supabase.co/auth/v1/callback
   ```
   Remova eventuais entradas incorretas que apontem diretamente para `/auth/callback` da Netlify se tiverem sido cadastradas por engano no Google Cloud.
3. Em **Google Auth Platform / OAuth consent screen**, confirme os escopos básicos (`openid`, `email`, `profile`), os domínios autorizados (`supabase.co` e `netlify.app` / domínio próprio futuro) e se o status de publicação da tela de consentimento está em **In production** (ou se as contas de teste estão listadas em **Test users** enquanto em modo Testing).
4. Em **Supabase Dashboard → Authentication → Providers → Google** (projeto `peornypgltuueubmsucm`), confirme que o provider está **Enabled** e que o **Client ID** é exatamente `563590504578-mjat63su5ri3seo1d09dbaspkm9vgplk.apps.googleusercontent.com`, com o respectivo Client Secret vigente.
5. Nunca solicite, copie, imprima ou registre Client Secret, service-role, credenciais SMTP, cookies ou tokens em chat, código, Issues ou PRs. Se um segredo for exposto fora do painel protegido, rotacione-o antes de habilitar o provider.

### SMTP, DNS e entregabilidade

#### Situação diagnosticada (código vs. configuração externa)

- **No código da aplicação:** o Marcou delega o disparo de confirmação e recuperação exclusivamente ao Supabase Auth (`signUp`, `resend`, `resetPasswordForEmail`), construindo `emailRedirectTo` com origem confiável (`NEXT_PUBLIC_SITE_URL`) para `/auth/confirm?next=...`. Não há envio SMTP direto pela aplicação Next.js nem defeito de código causando classificação como spam.
- **Na configuração externa atual (verificada por cabeçalhos RFC de entrega):**
  - O projeto Supabase `peornypgltuueubmsucm` não está mais no SMTP padrão `supabase.io`, mas está configurado com relay `smtp.gmail.com` usando uma caixa pessoal/gratuita `Marcou <appmarcou@gmail.com>` (`Return-Path: <appmarcou@gmail.com>`).
  - Embora `SPF`, `DKIM` e `DMARC` passem tecnicamente para `gmail.com` (`dmarc=pass p=NONE header.from=gmail.com`), o envio automatizado de e-mails transacionais de marca comercial a partir de `@gmail.com` com links apontando para outro domínio (`marcoou.netlify.app` / `peornypgltuueubmsucm.supabase.co`) sofre **desalinhamento cruzado de domínios** e aciona filtros anti-phishing/spam, além de sujeitar a conta Google a limites baixos e bloqueio.
  - O assunto do template **Confirm signup** encontra-se em inglês (`Confirm your email address`) enquanto o corpo HTML está em português (`Confirme seu e-mail...`), e a mensagem sai apenas como `text/html` sem parte texto puro — fatores adicionais de pontuação de spam.

#### Ações externas necessárias para sair do spam de forma definitiva

1. **Domínio próprio do Marcou:** adquirir/utilizar domínio próprio (ex.: `marcou.com.br`), evitando depender de `@gmail.com` como remetente e, idealmente, também associando o domínio próprio à aplicação na Netlify para alinhar marca, remetente e links de confirmação.
2. **Provedor SMTP transacional dedicado:** configurar em **Supabase Dashboard → Project Settings → Authentication → SMTP Settings** um provedor transacional próprio (Resend, Postmark, Amazon SES ou SendGrid) enviando com remetente do domínio do Marcou (ex.: `Marcou <nao-responda@marcou.com.br>` ou subdomínio dedicado `nao-responda@mail.marcou.com.br`). Guardar host, porta, usuário e senha/API key exclusivamente no painel do Supabase.
3. **Autenticação DNS do domínio de envio:**
   - **SPF:** publicar um único registro TXT SPF autorizando o provedor transacional escolhido, sem registros SPF duplicados;
   - **DKIM:** publicar as chaves CNAME/TXT de assinatura DKIM do provedor no domínio do Marcou e validar status verificado;
   - **DMARC:** publicar `_dmarc.<domínio>` alinhado ao `From` (iniciando com `v=DMARC1; p=none; rua=mailto:...` para monitoramento e evoluindo para `p=quarantine` / `p=reject` após validar alinhamento).
4. **Revisão dos Email Templates no Supabase:**
   - padronizar o **Subject** em português coerente com o corpo (ex.: `Confirme seu e-mail no Marcou` e `Redefinição de senha no Marcou`);
   - manter os links apontando para `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` (cadastro) e `type=recovery` (recuperação), sem encurtadores nem domínios divergentes.

## Handoff de coordenação cloud (sem secrets)

Nenhuma configuração de Google Cloud, Supabase remoto, Netlify ou SMTP foi alterada pelo repositório. A tabela consolida o estado verificado de forma somente-leitura e as ações manuais pendentes:

| Item | Valor observado / esperado | Estado |
|---|---|---|
| Supabase project ref | `peornypgltuueubmsucm` | **Confirmado ativo** (`peornypgltuueubmsucm.supabase.co`). |
| `NEXT_PUBLIC_SITE_URL` na Netlify (produção) | `https://marcoou.netlify.app` | **Confirmado configurado** em produção (`/auth/callback` resolve `trustedAppOrigin` para `https://marcoou.netlify.app` com destino padrão `/inicio`). |
| `redirectTo` montado por `googleLoginAction` | `https://marcoou.netlify.app/auth/callback?next=<caminho-seguro>` | **Correto no código** (callback final do Supabase para o Marcou). |
| `redirect_uri` real enviado ao Google OAuth | `https://peornypgltuueubmsucm.supabase.co/auth/v1/callback` | **Confirmado na requisição OAuth real**, mas **ausente/divergente no Google Cloud Console** (causa direta do `Erro 400: redirect_uri_mismatch`). |
| Google OAuth Client ID público em uso | `563590504578-mjat63su5ri3seo1d09dbaspkm9vgplk.apps.googleusercontent.com` | **Confirmado ativo** na requisição OAuth do Supabase; cadastrar nele o URI `https://peornypgltuueubmsucm.supabase.co/auth/v1/callback`. |
| Site URL esperado no Supabase | `https://marcoou.netlify.app` | Conferir em **Authentication → URL Configuration**. |
| Redirect URLs — produção | `https://marcoou.netlify.app/auth/callback**` e `https://marcoou.netlify.app/auth/confirm**` | Conferir no Supabase com `**` para aceitar `?next=...`. |
| Redirect URLs — Netlify Deploy Preview | `https://deploy-preview-*--marcoou.netlify.app/auth/callback**` e `/auth/confirm**` | Preferir preview exato ativo ou restringir ao padrão com duplo hífen `--` da Netlify. |
| Redirect URLs — localhost | `http://localhost:3000/auth/callback**` e `http://localhost:3000/auth/confirm**` | Para desenvolvimento local com `?next=...`. |
| Escopos OAuth | `openid`, `email`, `profile` | Escopos básicos esperados na consent screen. |
| SMTP e remetente atuais | `smtp.gmail.com` com `Marcou <appmarcou@gmail.com>` e assunto em inglês (`Confirm your email address`) | **Causa externa da queda em spam**; migrar para domínio próprio + SMTP transacional dedicado + SPF/DKIM/DMARC + assunto em português. |

### Round-trip publicado ainda necessário

- Cadastro e confirmação por e-mail com template ativo; comparar respostas de endereço novo, existente, confirmado e reenvio sem revelar existência.
- Recuperação enviada por SMTP, aberta em outro navegador, chegada obrigatória a `/redefinir-senha`, troca de senha e novo login; testar token expirado/reutilizado.
- Google OAuth real: consentimento, callback Supabase → `/auth/callback`, sessão PKCE/cookies e cancelamento com retorno local seguro.
- Refresh de sessão e logout no deploy; confirmar `NEXT_PUBLIC_SITE_URL`, allowlist de produção/preview/localhost e cabeçalhos `private, no-store` publicados.
- Aplicação da migration `20261123140000_account_modes.sql` no Supabase alvo e validação do hub/modos contra ownership real.

Não declare Google, confirmação de e-mail, recovery ou SMTP funcionais até esses cenários completarem o round-trip publicado. Não cole Client Secret, senha SMTP, service-role, cookie, code, `token_hash` ou URL integral de e-mail em Issues, PRs ou logs.

## Roteiro de validação publicada

Este roteiro precisa ser executado pelo responsável depois de configurar Netlify, Supabase, Google Cloud, SMTP, DNS e templates. Não se deve declarar os fluxos externos comprovados antes de completar o teste publicado.

1. Em uma janela privada, acesse `/cadastro`, crie uma conta com e-mail/senha e confirme que a resposta não revela existência prévia. Abra o e-mail; o link deve chegar a `/auth/confirm`, criar a sessão e encaminhar para `/perfil` quando o telefone ainda faltar.
2. Saia e tente entrar sem confirmar: a mensagem deve orientar a confirmação, sem expor dados de outras contas. Use **Não recebeu o e-mail de confirmação?** para reenviar; compare o resultado com um endereço inexistente e com um endereço já confirmado — a resposta da ação deve ser a mesma.
3. Em outra sessão, use **Continuar com Google**. Confirme o consentimento, retorno por `/auth/callback`, criação de uma sessão persistente e perfil ligado ao mesmo usuário Supabase. Cancele o consentimento e verifique a mensagem genérica e o retorno ao destino local.
4. Faça login, acesse `/inicio`, alterne Cliente/Profissional. Antes de criar um negócio, a área profissional deve abrir apenas o setup e o modo ativo deve continuar Cliente. Depois de criar o negócio, confirme que o mesmo usuário continua acessando `/minha-conta` e `/painel`.
5. Solicite recuperação em `/esqueci-senha`; a mensagem não deve revelar se o e-mail existe. Abra o e-mail em outro navegador/dispositivo, confirme que o link chega a `/auth/confirm` e depois a `/redefinir-senha`, atualize a senha e faça login novamente com ela.
6. Teste expiração/reuso do link, logout, renovação após expiração do access token e acesso anônimo a `/minha-conta`, `/painel`, `/inicio`, `/meus-agendamentos` e `/notificacoes`.
7. Verifique os cabeçalhos `private, no-store` nos handlers de callback/confirm, as rotas finais e a configuração de allowlist. Não cole URL completa de e-mail, `token_hash`, code ou cookie em ferramentas de diagnóstico.

## Validação automatizada e estado externo

O código inclui testes unitários para redirects/normalização, origens confiáveis, não enumeração de cadastro/reenvio/recuperação, callback, confirmação, no-store e o hub de identidade. `npm run test:db` executa quatro harnesses na ordem: bookings legado (`scripts/db-check.mjs`), fundação social (`scripts/social-foundation-check.mjs`), identidade (`scripts/identity-check.mjs`) e descoberta (`scripts/discovery-check.mjs`). O harness social aplica todas as migrations e falha se qualquer `SECURITY DEFINER` conservar `EXECUTE` para `PUBLIC`; os harnesses de identidade e descoberta também validam RLS, grants e isolamento. A migration `20261123140000_account_modes.sql` precede a migration `20261123143000_discovery_taxonomy_service_areas.sql`.

A validação real publicada de Google, SMTP, confirmação e recovery depende das configurações acima. Nenhuma configuração remota foi alterada ou verificada nesta entrega, nenhum e-mail real foi enviado e nenhum fluxo externo deve ser tratado como comprovado até o roteiro ser executado com evidência segura. Issues relacionadas continuam abertas: [#23](https://github.com/deividjmoura/marcou/issues/23), [#70](https://github.com/deividjmoura/marcou/issues/70) e [#83](https://github.com/deividjmoura/marcou/issues/83). PR #69 foi consultada apenas como referência funcional, sem cherry-pick ou merge.
