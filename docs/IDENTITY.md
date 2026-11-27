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

No Netlify, configure `NEXT_PUBLIC_SITE_URL` como `https://marcoou.netlify.app` em Production e `http://localhost:3000` apenas no desenvolvimento local. Para Deploy Previews, não defina uma origem por requisição nem sobrescreva os metadados de sistema: `CONTEXT` e `DEPLOY_PRIME_URL` são lidos durante o build e capturados por `next.config.ts` em `MARCOU_AUTH_DEPLOY_CONTEXT` e `MARCOU_AUTH_DEPLOY_PRIME_URL`. Esses valores são metadados públicos do deployment, não secrets. A Netlify não disponibiliza `CONTEXT`/`DEPLOY_PRIME_URL` como variáveis read-only às Functions em runtime; a captura no build é necessária. Não refletem `Host`/`X-Forwarded-Host`; preview inválido fecha para a origem canônica de produção.

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

#### O que foi comprovado na requisição vs. o que depende de conferência manual no Google Cloud

- **Comprovado diretamente (requisição pública e código):**
  - `NEXT_PUBLIC_SITE_URL` está configurada em produção na Netlify como `https://marcoou.netlify.app` (verificado pelo redirecionamento de `/auth/callback` via `trustedAppOrigin`).
  - `googleLoginAction` monta `redirectTo = https://marcoou.netlify.app/auth/callback?next=<caminho-local-seguro>` (callback final Supabase → Marcou).
  - Ao iniciar `/auth/v1/authorize?provider=google` no projeto `peornypgltuueubmsucm`, o Supabase redireciona ao Google enviando `client_id = 563590504578-mjat63su5ri3seo1d09dbaspkm9vgplk.apps.googleusercontent.com` e `redirect_uri = https://peornypgltuueubmsucm.supabase.co/auth/v1/callback`, e o Google devolve `Erro 400: redirect_uri_mismatch` indicando esse `redirect_uri`.
- **Não consultado diretamente (depende de conferência nos painéis externos):**
  - A lista cadastrada em **Authorized redirect URIs** no Google Cloud Console **não foi consultada diretamente**. O erro `redirect_uri_mismatch` comprova que o `redirect_uri` enviado na requisição não coincide com uma entrada autorizada naquela credencial hoje, mas confirmar se o URI está ausente, com grafia/barra final/protocolo divergente ou se foi cadastrado o `/auth/callback` da Netlify exige conferência direta no Google Cloud Console.
  - O estado da **OAuth consent screen** (*Testing* vs. *In production*, *Test users* e escopos) e os valores internos do **Supabase Dashboard** (`Site URL`, entradas em `Redirect URLs` e Client Secret vigente) também dependem de conferência direta pelo responsável.

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

#### 1. Evidências observadas (código e cabeçalhos RFC somente-leitura)

- **No código da aplicação:** o Marcou delega o disparo de confirmação e recuperação exclusivamente ao Supabase Auth (`signUp`, `resend`, `resetPasswordForEmail`), construindo `emailRedirectTo` com origem confiável (`NEXT_PUBLIC_SITE_URL`) para `/auth/confirm?next=...` e respostas não enumeráveis. Não há envio SMTP direto pela aplicação Next.js nem exposição de credenciais no repositório.
- **Nos cabeçalhos RFC de uma mensagem real de confirmação (inspeção somente-leitura de metadados, sem ler corpo completo nem expor tokens):**
  - Disparo originado pelo projeto `peornypgltuueubmsucm` via `smtp.gmail.com` (`UTF8SMTPSA`), com `From: Marcou <appmarcou@gmail.com>` e `Return-Path: <appmarcou@gmail.com>`.
  - Autenticação no destino: `spf=pass`, `dkim=pass (header.d=gmail.com)` e `dmarc=pass (p=NONE header.from=gmail.com)`.
  - Cabeçalhos de template/formato: `Subject: Confirm your email address` (em inglês) e `Content-Type: text/html; charset=UTF-8` (sem parte `text/plain`).
- **Alcance da evidência:** `SPF`, `DKIM` e `DMARC` passando atestam apenas que a mensagem transitou legitimamente pelo `gmail.com` e **não garantem entrega na caixa de entrada**; por outro lado, os cabeçalhos públicos não revelam o score interno do filtro anti-spam do provedor destinatário e **não comprovam que o uso do SMTP Gmail seja isoladamente a única causa** da queda em spam.

#### 2. Hipóteses técnicas plausíveis (fatores combinados de filtragem)

- **Desalinhamento entre remetente, marca e links de ação:** envio automatizado de e-mails transacionais exibindo nome comercial (`Marcou`) a partir de conta gratuita `@gmail.com`, disparado de infraestrutura em nuvem e apontando links CTA para domínios distintos (`marcoou.netlify.app` / `peornypgltuueubmsucm.supabase.co`).
- **Reputação/histórico de envio e limites operacionais:** baixo histórico de engajamento positivo (aberturas/cliques/respostas) ou marcações anteriores como spam no endereço remetente, além dos limites rígidos de envio automatizado em contas pessoais no `smtp.gmail.com`.
- **Sinais de template e formato MIME:** divergência de idioma entre o assunto em inglês (`Confirm your email address`) e o corpo em português, envio somente em `text/html` sem `text/plain` e presença de URLs longas de confirmação.

#### 3. Recomendações práticas (ações externas pendentes)

1. **Domínio próprio do Marcou:** adotar domínio próprio (ex.: `marcou.com.br`), alinhando gradualmente o domínio remetente e o domínio da aplicação na Netlify.
2. **Provedor SMTP transacional dedicado:** configurar em **Supabase Dashboard → Project Settings → Authentication → SMTP Settings** um provedor transacional próprio (Resend, Postmark, Amazon SES ou SendGrid) enviando com remetente do domínio do Marcou (ex.: `Marcou <nao-responda@marcou.com.br>` ou subdomínio dedicado `nao-responda@mail.marcou.com.br`). Guardar host, porta, usuário e senha/API key exclusivamente no painel do Supabase.
3. **Autenticação DNS alinhada ao domínio próprio:**
   - **SPF:** publicar um único registro TXT SPF autorizando o provedor transacional escolhido, sem registros SPF duplicados;
   - **DKIM:** publicar as chaves CNAME/TXT de assinatura DKIM do provedor no domínio do Marcou e validar status verificado;
   - **DMARC:** publicar `_dmarc.<domínio>` alinhado ao `From` (iniciando com `v=DMARC1; p=none; rua=mailto:...` para monitoramento e evoluindo para `p=quarantine` / `p=reject` após validar alinhamento).
4. **Revisão dos Email Templates e teste em múltiplos provedores:**
   - padronizar o **Subject** em português coerente com o corpo (ex.: `Confirme seu e-mail no Marcou` e `Redefinição de senha no Marcou`);
   - manter os links apontando para `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` (cadastro) e `type=recovery` (recuperação), sem encurtadores, e validar entrega real em Gmail, Outlook/Hotmail e Yahoo.

## Handoff de coordenação cloud (sem secrets)

Nenhuma configuração de Google Cloud, Supabase remoto, Netlify ou SMTP foi alterada pelo repositório. A tabela consolida o estado verificado de forma somente-leitura e as ações manuais pendentes:

| Item | Valor observado / esperado | Estado |
|---|---|---|
| Supabase project ref | `peornypgltuueubmsucm` | **Confirmado ativo** (`peornypgltuueubmsucm.supabase.co`). |
| `NEXT_PUBLIC_SITE_URL` na Netlify (produção) | `https://marcoou.netlify.app` | **Confirmado configurado** em produção (`/auth/callback` resolve `trustedAppOrigin` para `https://marcoou.netlify.app` com destino padrão `/inicio`). |
| `redirectTo` montado por `googleLoginAction` | `https://marcoou.netlify.app/auth/callback?next=<caminho-seguro>` | **Correto no código** (callback final do Supabase para o Marcou). |
| `redirect_uri` real enviado ao Google OAuth | `https://peornypgltuueubmsucm.supabase.co/auth/v1/callback` | **Comprovado na requisição OAuth real** (Google retorna `Erro 400: redirect_uri_mismatch` para esse URI). A lista cadastrada em **Authorized redirect URIs** no Google Cloud **não foi consultada diretamente** e precisa ser conferida manualmente. |
| Google OAuth Client ID público em uso | `563590504578-mjat63su5ri3seo1d09dbaspkm9vgplk.apps.googleusercontent.com` | **Comprovado na requisição OAuth do Supabase**; conferir no Google Cloud Console que `https://peornypgltuueubmsucm.supabase.co/auth/v1/callback` está autorizado nessa credencial. |
| Site URL esperado no Supabase | `https://marcoou.netlify.app` | **Depende de conferência direta** em **Authentication → URL Configuration**. |
| Redirect URLs — produção | `https://marcoou.netlify.app/auth/callback**` e `https://marcoou.netlify.app/auth/confirm**` | **Depende de conferência direta** no Supabase com `**` para aceitar `?next=...`. |
| Redirect URLs — Netlify Deploy Preview | `https://deploy-preview-*--marcoou.netlify.app/auth/callback**` e `/auth/confirm**` | Preferir preview exato ativo ou restringir ao padrão com duplo hífen `--` da Netlify. |
| Redirect URLs — localhost | `http://localhost:3000/auth/callback**` e `http://localhost:3000/auth/confirm**` | Para desenvolvimento local com `?next=...`. |
| Escopos e consent screen OAuth | `openid`, `email`, `profile` | **Depende de conferência direta** na OAuth consent screen (*Testing*/*In production* e *Test users*). |
| SMTP e cabeçalhos observados | `smtp.gmail.com` com `Marcou <appmarcou@gmail.com>`, `SPF/DKIM/DMARC pass` em `gmail.com`, assunto em inglês (`Confirm your email address`) e `text/html` puro | **Evidência observada nos cabeçalhos** (sem provar causa única isolada). Recomendação externa: domínio próprio + SMTP transacional dedicado + SPF/DKIM/DMARC alinhados + assunto em português. |

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

## Medição de desempenho sem PII ou credenciais

- **Escopo do benchmark PostgreSQL local (`scripts/identity-check.mjs`):** mede exclusivamente as operações SQL em `public.profiles` sob RLS (`3 queries` sequenciais com `UPSERT` vs. `1 SELECT` no caminho rápido de login recorrente). Ele serve como evidência da redução de consultas e escritas redundantes no banco, **e não representa o tempo total de login em produção** (que inclui latência do navegador até a Netlify, `signInWithPassword`/bcrypt no Supabase Auth, HTTP/TLS do PostgREST e RTT WAN até `us-east-1`).
- **Medição do fluxo completo no servidor (`src/server/identity.ts`):** `measureAuthFlow` e `withAuthFlowCollector` medem o ciclo completo de cada requisição no servidor (`password_login`, `oauth_callback`, `email_confirm` e `account_bootstrap` nas páginas pós-redirect `/inicio`, `/minha-conta` e `/painel`). Quando a variável de servidor `AUTH_TIMING_LOG=1` é habilitada em ambiente controlado, o sistema emite JSON sanitizado por allowlist (`event: "marcou.auth_timing"`) contendo apenas `{ flow, outcome, totalMs, steps: [{ step, durationMs, profileWritten? }] }` — sem jamais serializar e-mail, senha, `user_id`, telefone, `code`, `token_hash`, cookies ou URLs.
- **Fronteira de rede do navegador:** como o login por Server Action responde com redirecionamento HTTP para a rota de destino, o tempo total percebido pela pessoa usuária em ambiente publicado soma duas requisições (`POST` da ação + `GET` da página destino) mais o RTT entre navegador e borda da Netlify; em homologação publicada, esse trecho externo pode ser aferido por teste sintético/Navigation Timing combinado a `AUTH_TIMING_LOG=1`, sem capturar campos de formulário.

## Validação automatizada e estado externo

O código inclui testes unitários para redirects/normalização, origens confiáveis, não enumeração de cadastro/reenvio/recuperação, callback, confirmação, no-store e o hub de identidade. `npm run test:db` executa quatro harnesses na ordem: bookings legado (`scripts/db-check.mjs`), fundação social (`scripts/social-foundation-check.mjs`), identidade (`scripts/identity-check.mjs`) e descoberta (`scripts/discovery-check.mjs`). O harness social aplica todas as migrations e falha se qualquer `SECURITY DEFINER` conservar `EXECUTE` para `PUBLIC`; os harnesses de identidade e descoberta também validam RLS, grants e isolamento. A migration `20261123140000_account_modes.sql` precede a migration `20261123143000_discovery_taxonomy_service_areas.sql`.

A validação real publicada de Google, SMTP, confirmação e recovery depende das configurações acima. Nenhuma configuração remota foi alterada nesta entrega (o diagnóstico limitou-se à requisição pública e a metadados RFC somente-leitura, sem acesso direto aos painéis do Google Cloud ou Supabase), e nenhum fluxo externo deve ser tratado como concluído até as configurações manuais e o roteiro publicado serem executados com evidência segura. Issues relacionadas continuam abertas: [#23](https://github.com/deividjmoura/marcou/issues/23), [#70](https://github.com/deividjmoura/marcou/issues/70) e [#83](https://github.com/deividjmoura/marcou/issues/83). PR #69 foi consultada apenas como referência funcional, sem cherry-pick ou merge.


## Redirects de recuperação por ambiente

Consulte [`docs/AUTH-RECOVERY-PREVIEW-ORIGIN.md`](AUTH-RECOVERY-PREVIEW-ORIGIN.md) para a política de origem confiável, captura dos metadados `CONTEXT`/`DEPLOY_PRIME_URL` durante o build da Netlify, contrato do template Reset Password e allowlist restrita de Deploy Previews. O fluxo não reflete `Host`, `x-forwarded-host` ou `request.nextUrl.origin`.
