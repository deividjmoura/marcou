# Plano de correção — recuperação de senha em produção

Issue: #70  
Branch: `fix/auth-recovery-redirect-production`

## Diagnóstico confirmado até aqui

A ação `requestPasswordResetAction` em `src/app/(auth)/actions.ts` já envia ao Supabase o destino:

```text
/auth/callback?flow=recovery&next=/redefinir-senha
```

A rota `src/app/auth/callback/route.ts` também contém o tratamento específico de recovery e redireciona para `/redefinir-senha` depois da troca do código PKCE pela sessão.

Entretanto, o link de e-mail observado em produção aponta `redirect_to` para a raiz do domínio `https://marcoou.netlify.app`. Isso é compatível com o Supabase não aceitar o redirect solicitado e usar o Site URL como fallback, ou com a aplicação publicada não conter a implementação atual. Ainda não há evidência suficiente para afirmar qual das duas causas é a responsável.

## Checklist operacional

- [ ] Confirmar na Netlify que o deploy de produção está baseado no commit `ed722ecc0f7b3858a346f34123fca97b6b0c1799` ou em descendente dele.
- [ ] No Supabase, conferir Authentication → URL Configuration.
- [ ] Manter o Site URL como `https://marcoou.netlify.app`.
- [ ] Incluir `https://marcoou.netlify.app/auth/callback` na lista de Redirect URLs permitidas.
- [ ] Conferir o template Authentication → Email Templates → Reset Password; o link deve preservar a URL de confirmação gerada pelo Supabase (normalmente `{{ .ConfirmationURL }}`), sem trocar o destino por uma URL fixa da landing page.
- [ ] Solicitar um novo e-mail de recuperação e verificar se `redirect_to` aponta para `/auth/callback?flow=recovery&next=/redefinir-senha`.
- [ ] Confirmar callback PKCE, abertura de `/redefinir-senha`, atualização de senha e login com a nova senha.
- [ ] Criar/ajustar teste automatizado para garantir o `redirectTo` enviado por `requestPasswordResetAction`.

## Cuidados de segurança

Não registrar em issues, PRs, logs ou screenshots o link completo de recuperação, tokens, cookies ou códigos PKCE. Links já compartilhados devem ser descartados; gerar um novo somente após a configuração ser revisada.

## Estado

Esta PR é um rascunho de acompanhamento e runbook. Ela não altera ainda a lógica de autenticação nem configura Supabase/Netlify. A correção só deve ser considerada concluída após o checklist e os testes de ponta a ponta.
