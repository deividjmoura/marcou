# Identidade, autenticação e perfil

O Marcou usa exclusivamente **Supabase Auth** para autenticação. O perfil de aplicação fica em `public.profiles`, relacionado 1:1 a `auth.users`. Não configurar Firebase Auth nem manter um segundo cadastro de credenciais.

## Fluxos implementados

- Cadastro por e-mail/senha com nome em metadata e confirmação de e-mail quando habilitada no Supabase.
- Login por e-mail/senha e logout.
- Google OAuth pelo provedor Google do Supabase Auth.
- Callback PKCE em `/auth/callback`, com troca de code por sessão e criação/atualização do perfil.
- Complemento de perfil em `/perfil`; nome e telefone com DDD são obrigatórios para concluir o onboarding.
- Recuperação em `/esqueci-senha` e redefinição autenticada em `/redefinir-senha`.
- Redirecionamentos pós-login limitados a caminhos locais para evitar open redirect.

## Modelo e autorização

A migration inicial já cria `public.profiles(id, display_name, phone)`, com RLS habilitada e policies para que usuário autenticado leia, insira e atualize somente a própria linha (`id = auth.uid()`). As ações usam a sessão Supabase do servidor; nunca aceitam um ID de usuário fornecido pelo navegador. Não foi necessária migration adicional nesta entrega.

A aplicação faz upsert do perfil após cadastro com sessão, login e callback OAuth/e-mail. Se a confirmação de e-mail estiver ativa, o callback conclui o provisionamento. O telefone não é presumido a partir do Google: quando ausente, o usuário é encaminhado ao formulário de perfil.

## Configuração Google Cloud + Supabase (ação do responsável)

1. No Google Cloud Console, crie/seleciona um projeto e configure a tela de consentimento OAuth, domínios autorizados e escopos básicos `openid`, `email` e `profile`.
2. Crie credenciais OAuth do tipo Web application.
3. Em **Supabase Dashboard → Authentication → Providers → Google**, habilite Google e informe Client ID e Client Secret obtidos no Google Cloud.
4. Cadastre no Google Cloud como **Authorized redirect URI** o callback mostrado pelo Supabase para o projeto (formato `https://<project-ref>.supabase.co/auth/v1/callback`). Não use `/auth/callback` da aplicação como redirect URI do Google; esse é o callback final da aplicação após o Supabase.
5. Em **Supabase Dashboard → Authentication → URL Configuration**, defina o Site URL e inclua os Redirect URLs da aplicação para local, Preview e produção, incluindo `/auth/callback`. Configure `NEXT_PUBLIC_SITE_URL` por ambiente para a origem pública da aplicação.
6. Teste cadastro, login Google, confirmação de e-mail e recuperação em cada ambiente configurado. Não registre Client Secret, tokens ou chaves privadas no Git.

**Pendente do responsável:** criar/configurar credenciais no Google Cloud, ativar o provider no Supabase e cadastrar as URLs permitidas. Nenhuma configuração remota foi alterada nesta entrega.

## Limitações e validação

- A disponibilidade real do e-mail depende da configuração SMTP e das políticas de confirmação do projeto Supabase.
- A experiência real do Google OAuth depende das etapas de configuração acima; não é possível declarar funcionamento ponta a ponta sem credenciais/configuração do provedor.
- O telefone é validado por quantidade de dígitos (10–15) e armazenado normalizado; não há validação de posse por SMS nesta issue.
