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

1. Defina **Site URL** como a origem canônica de produção.
2. Permita somente os callbacks da aplicação que serão usados: `/auth/callback` (Google/PKCE) e `/auth/confirm` (e-mail e recuperação) para local e ambientes oficiais.
3. Inclua a origem de produção, localhost de desenvolvimento e os domínios de Deploy Preview/Branch Deploy autorizados. Prefira URLs exatas por ambiente; se uma wildcard for necessária, limite-a ao domínio Netlify controlado pelo Marcou e somente aos caminhos necessários. Não use wildcard de qualquer host nem permita domínio externo.
4. A lista precisa incluir os destinos de retorno enviados pelo app (`/auth/confirm` ou `/auth/callback` com query local) antes de testar o fluxo. O Supabase valida esses destinos contra a allowlist.

A documentação histórica registra o ref `peornypgltuueubmsucm`, mas esta entrega não o confirmou no Dashboard. Confirme o projeto/ambiente alvo antes de editar o painel. Nenhuma URL de Site/Redirect foi alterada nesta entrega.

### Google Cloud e provider Google no Supabase

1. No Google Cloud Console, configure a tela de consentimento OAuth e os domínios autorizados; use apenas escopos básicos `openid`, `email` e `profile`.
2. Crie uma credencial OAuth do tipo **Web application**.
3. Em **Supabase Dashboard → Authentication → Providers → Google**, habilite o provider e cadastre o Client ID e o Client Secret nos campos do painel.
4. No Google Cloud, registre como **Authorized redirect URI** o callback do Supabase, no formato `https://<project-ref>.supabase.co/auth/v1/callback` (para o projeto citado acima: `https://peornypgltuueubmsucm.supabase.co/auth/v1/callback`). Não configure `/auth/callback` da aplicação como redirect URI do Google: esse é o callback final, após o Supabase.
5. Nunca solicite, copie, imprima ou registre Client Secret, service-role, credenciais SMTP, cookies ou tokens em chat, código, Issues ou PRs. Se um segredo for exposto fora do painel protegido, rotacione-o antes de habilitar o provider.

### SMTP, DNS e entregabilidade

Em **Supabase Dashboard → Project Settings → Authentication → SMTP Settings**, habilite um SMTP próprio adequado ao volume e domínio de envio do Marcou. Use o painel/gerenciador de segredos para host, porta, usuário e senha SMTP; não os coloque em `.env.example`, no repositório, em Issues, PRs ou logs.

No DNS do domínio de envio:

- publique exatamente os registros SPF indicados pelo provedor, sem criar registros SPF concorrentes;
- configure DKIM e valide a assinatura das mensagens;
- publique uma política DMARC alinhada com o domínio `From` (comece em monitoramento se a política operacional exigir, depois avance conforme os relatórios);
- verifique domínio, remetente, quotas, limites de envio e pastas de spam antes do lançamento.

Personalize os templates **Confirm signup** e **Reset Password** com os links `/auth/confirm` acima. Confira o remetente, assunto, idioma, validade do link e URLs geradas em cada ambiente. Mensagens válidas e inválidas devem receber resposta indistinguível nas ações de reenvio e recuperação.

## Handoff de coordenação cloud (sem secrets)

Nenhuma configuração de Google Cloud, Supabase remoto, Netlify ou SMTP foi alterada. Os valores abaixo são metadados públicos registrados no repositório ou fornecidos como referência histórica; **não foram verificados nos painéis remotos nesta entrega**. A outra frente deve confirmar o projeto/ambiente antes de aplicar mudanças.

| Item | Valor de handoff | Estado |
|---|---|---|
| Supabase project ref | `peornypgltuueubmsucm` | Ref registrada na documentação histórica; confirmação no Dashboard do Supabase ainda pendente. |
| Google Authorized redirect URI esperado | `https://peornypgltuueubmsucm.supabase.co/auth/v1/callback` | Esperado para o ref acima; validar em Google Cloud e no provider Google do Supabase. Este é o callback do Supabase, não `/auth/callback` da aplicação. |
| Google OAuth Client ID público esperado | `563590504578-mjat63su5ri3seo1d09dbaspkm9vgplk.apps.googleusercontent.com` | Referência histórica fornecida; confirmar igualdade nos dois painéis. Nenhum Client Secret foi acessado ou registrado. |
| Site URL de produção esperado | `https://marcoou.netlify.app` | README identifica esta URL como aplicação publicada; confirmar que continua sendo a origem canônica ativa. |
| Redirect URLs — produção | `https://marcoou.netlify.app/auth/callback` e `https://marcoou.netlify.app/auth/confirm` | Allowlist esperada do Supabase; confirmar no projeto correto. |
| Redirect URLs — Netlify Deploy Preview | `https://deploy-preview-<número>--marcoou.netlify.app/auth/callback` e `/auth/confirm` | Preferir entradas exatas por preview ativo. Se usar wildcard, restringir a `https://deploy-preview-*-marcoou.netlify.app/auth/callback` e `/auth/confirm`; não usar wildcard de host genérico. |
| Redirect URLs — localhost | `http://localhost:3000/auth/callback` e `http://localhost:3000/auth/confirm` | Para desenvolvimento local. |
| Escopos OAuth | `openid`, `email`, `profile` | Escopos esperados; a aplicação não solicita escopos adicionais. Confirmar consent screen/provider. |
| Templates de e-mail | Confirm signup deve enviar `RedirectTo` + `TokenHash` + `type=email`; Reset Password deve enviar `RedirectTo` + `TokenHash` + `type=recovery`. | Os snippets estão documentados acima; estado remoto dos templates, SMTP, remetente e entregabilidade não verificado. |

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

O código inclui testes unitários para redirects/normalização, origens confiáveis, não enumeração de cadastro/reenvio/recuperação, callback, confirmação, no-store e o hub de identidade. `npm run test:db` executa `scripts/social-foundation-check.mjs`, que aplica todas as migrations (inclusive as futuras) e falha se qualquer `SECURITY DEFINER` conservar `EXECUTE` para `PUBLIC`, além do harness isolado `scripts/identity-check.mjs` para RLS, isolamento por usuário, grants das RPCs de modo e tentativas de elevação de privilégio.

A validação real publicada de Google, SMTP, confirmação e recovery depende das configurações acima. Nenhuma configuração remota foi alterada ou verificada nesta entrega, nenhum e-mail real foi enviado e nenhum fluxo externo deve ser tratado como comprovado até o roteiro ser executado com evidência segura. Issues relacionadas continuam abertas: [#23](https://github.com/deividjmoura/marcou/issues/23), [#70](https://github.com/deividjmoura/marcou/issues/70) e [#83](https://github.com/deividjmoura/marcou/issues/83). PR #69 foi consultada apenas como referência funcional, sem cherry-pick ou merge.
