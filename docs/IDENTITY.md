# Identidade, autenticação e perfil

O Marcou usa exclusivamente **Supabase Auth** para autenticação. O perfil de aplicação fica em `public.profiles`, relacionado 1:1 a `auth.users`. Não configurar Firebase Auth nem manter um segundo cadastro de credenciais.

## Fluxos implementados

- Cadastro por e-mail/senha com nome em metadata e confirmação de e-mail quando habilitada no Supabase.
- Login por e-mail/senha e logout.
- Google OAuth pelo provedor Google do Supabase Auth, em **PKCE**.
- Callback OAuth em `/auth/callback`, com troca de code por sessão e criação/atualização do perfil.\n- Confirmação de cadastro por e-mail em `/auth/confirm`, com `token_hash` via `verifyOtp` no fluxo PKCE e provisionamento do perfil.
- Complemento de perfil em `/perfil`; nome e telefone com DDD são obrigatórios para concluir o onboarding.
- Recuperação em `/esqueci-senha` e redefinição autenticada em `/redefinir-senha`.
- Redirecionamentos pós-login limitados a caminhos locais para evitar open redirect.
- Falha de OAuth (consentimento cancelado, link expirado, erro do provedor) devolve o usuário ao login **com o destino original preservado** e mensagem específica.

## Confirmação de e-mail no fluxo PKCE

O cadastro SSR usa PKCE. O endpoint OAuth `/auth/callback` recebe `code`, mas o link de confirmação de cadastro deve usar `token_hash` e `verifyOtp`; não se deve enviar o link de confirmação diretamente ao callback OAuth.

No Supabase Dashboard → Authentication → Email Templates → **Confirm signup**, configurar o link:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">
  Confirmar meu e-mail
</a>
```

O cadastro envia `emailRedirectTo` como o destino final permitido no próprio domínio. A rota `/auth/confirm` valida o token, cria a sessão nos cookies, provisiona o perfil e encaminha para completar o telefone quando necessário. A URL final precisa estar na lista de Redirect URLs do Supabase; em produção/preview, permitir somente os domínios oficiais do Marcou com wildcard de caminhos, sem liberar domínios externos.

## PKCE (verificado em código)

O cliente Supabase é criado sempre por `@supabase/ssr` (`src/lib/supabase/server.ts` e `src/lib/supabase/client.ts`). A versão instalada (`@supabase/ssr@0.7.0`) fixa `auth.flowType: "pkce"` e `detectSessionInUrl: false` no cliente de servidor, então o callback recebe `?code=...` e a troca usa o `code_verifier` guardado em cookie (`*-code-verifier`). O fluxo implícito (token no fragmento) não é usado: ele não funcionaria com um callback em rota de servidor.

`npm run audit` passou a falhar se algum arquivo de `src/` importar `createClient` direto de `@supabase/supabase-js`, que tem `flowType: "implicit"` como padrão.

## Modelo e autorização

A migration inicial já cria `public.profiles(id, display_name, phone)`, com RLS habilitada e policies para que usuário autenticado leia, insira e atualize somente a própria linha (`id = auth.uid()`). As ações usam a sessão Supabase do servidor; nunca aceitam um ID de usuário fornecido pelo navegador. Não foi necessária migration adicional nesta entrega.

A aplicação faz upsert do perfil após cadastro com sessão, login e callback OAuth/e-mail. O nome vindo do provedor (Google) ou do cadastro só é gravado **quando o perfil ainda não tem nome**: um nome escolhido pelo usuário em `/perfil` não é sobrescrito a cada login. O telefone não é presumido a partir do Google: quando ausente, o usuário é encaminhado ao formulário de perfil.

## Tratamento de erro no callback

`src/app/auth/callback/route.ts`:

- sem `code` → redireciona para `/login?error=<motivo>&next=<destino>`; `error=access_denied` (consentimento cancelado) gera mensagem própria;
- falha na troca do code → mesmo destino, mensagem genérica de autenticação;
- sem sessão após a troca → `/login?next=<destino>`;
- falha ao carregar o perfil → `/login?error=Não foi possível carregar seu perfil.&next=<destino>`;
- perfil sem telefone → `/perfil?next=<destino>`.

O destino é sempre passado por `safeNextPath` (`src/lib/identity.ts`), que rejeita `//`, `\` e URLs absolutas.

## Configuração Google Cloud + Supabase (ação do responsável)

Projeto Supabase: `peornypgltuueubmsucm` (São Paulo). Client ID público: `563590504578-mjat63su5ri3seo1d09dbaspkm9vgplk.apps.googleusercontent.com`.

1. No Google Cloud Console, crie/selecione um projeto e configure a tela de consentimento OAuth, domínios autorizados e escopos básicos `openid`, `email` e `profile`.
2. Crie credenciais OAuth do tipo **Web application**.
3. Em **Supabase Dashboard → Authentication → Providers → Google**, habilite Google e informe o Client ID e o **Client Secret** obtidos no Google Cloud.
4. **Rotacione o Client Secret antes de ativar** se ele já tiver sido compartilhado por chat, e-mail ou qualquer registro. O Client Secret não deve ser solicitado, reproduzido, registrado ou armazenado no repositório, em issues, em PRs ou neste documento.
5. Cadastre no Google Cloud como **Authorized redirect URI** o callback do Supabase: `https://peornypgltuueubmsucm.supabase.co/auth/v1/callback`. Não use `/auth/callback` da aplicação como redirect URI do Google; esse é o callback final da aplicação, depois do Supabase.
6. Em **Supabase Dashboard → Authentication → URL Configuration**, defina o Site URL e inclua os Redirect URLs da aplicação para local, Preview e produção, incluindo `/auth/callback` (por exemplo `http://localhost:3000/auth/callback`, `https://deploy-preview-<pr>--marcoou.netlify.app/auth/callback`, `https://<prod>/auth/callback`). O Supabase valida a URL final contra essa lista, então a entrada precisa existir antes do primeiro login.
7. Defina `NEXT_PUBLIC_SITE_URL` por ambiente com a origem pública da aplicação. Sem ela, `getAppOrigin()` (`src/app/(auth)/actions.ts`) usa o header `x-forwarded-host`, que depende do proxy; em Preview/produção é recomendável fixar a variável.
8. Teste cadastro, login Google, confirmação de e-mail e recuperação em cada ambiente configurado.

**Pendente do responsável:** concluir as etapas acima no Google Cloud e no Supabase. Nenhuma configuração remota foi alterada por este agente, e nenhum Client Secret foi solicitado, lido, reproduzido ou armazenado. O status de provedor habilitado **não foi verificado** (a API pública `/auth/v1/settings` do projeto exige chave; a publishable key não está no repositório).

## Testes executados nesta entrega (resultados reais)

- `npm run lint`, `npm run typecheck`, `npm run build` — sem erros.
- `npm test` — 64/64 (7 arquivos), incluindo 6 testes do callback e 4 de `identity`.
- `npm run test:db` — 53/53 em PostgreSQL embutido.
- `npm run audit` — 0 falhas, 0 avisos.
- Servidor local com Supabase não configurado: `/login`, `/cadastro`, `/esqueci-senha`, `/perfil`, `/redefinir-senha` respondem 200 com aviso; antes, `/perfil` e `/redefinir-senha` respondiam 500.
- Servidor local com env preenchida (projeto fictício): `/auth/callback?error=access_denied&next=...` → 307 para `/login?error=O+login+com+Google+foi+cancelado...&next=...`.

**Não executado nesta entrega:** round-trip real com o Google (requer credenciais e painel), verificação do provider no Supabase, PKCE callback contra o Supabase real, e E2E com navegador. Nenhuma dessas etapas foi dada por concluída.

## Limitações e validação

- A disponibilidade real do e-mail depende da configuração SMTP e das políticas de confirmação do projeto Supabase.
- A experiência real do Google OAuth depende das etapas de configuração acima; não é possível declarar funcionamento ponta a ponta sem credenciais/configuração do provedor.
- O telefone é validado por quantidade de dígitos (10–15) e armazenado normalizado; não há validação de posse por SMS nesta issue.
