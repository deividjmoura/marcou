# Recuperação de senha — origem confiável e preview

Checklist operacional para validar o fluxo de recuperação **sem** enviar e-mail
real nem alterar Supabase/Netlify a partir de agentes.

## Comportamento esperado

1. **Produção:** links usam `https://marcoou.netlify.app` (origem canônica).
2. **Deploy Preview:** só aceita `deploy-preview-<n>--marcoou.netlify.app` com
   `CONTEXT=deploy-preview` e `DEPLOY_PRIME_URL` injetados no **build**
   (`MARCOU_AUTH_DEPLOY_CONTEXT` / `MARCOU_AUTH_DEPLOY_PRIME_URL` via
   `next.config.ts`). Preview falso ou malformado **fecha para produção**.
3. **Local:** `NEXT_PUBLIC_SITE_URL=http://localhost:3000` ou Host localhost.
4. **Nunca** usar `Host`, `X-Forwarded-Host`, `request.nextUrl.origin` ou input
   do formulário para montar o `redirectTo` em produção/preview.
5. Server Action envia `/auth/confirm?next=%2Fredefinir-senha`; o handler valida
   `token_hash` com `type=recovery` e força `/redefinir-senha`.
6. Template Reset Password (Supabase):
   `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`.

## Checklist de aceite (responsável)

- [ ] Site URL no Supabase Auth sem caracteres invisíveis (BOM/ZWSP).
- [ ] Redirect URLs incluem produção e padrão de Deploy Preview.
- [ ] Produção: e-mail de teste abre em `marcoou.netlify.app` e cai em
      `/redefinir-senha` após o confirm.
- [ ] Preview real: link usa o hostname `deploy-preview-…--marcoou.netlify.app`.
- [ ] Preview falso/malformado **não** deve permanecer no preview — deve ir à
      produção (falha, não aprovação).
- [ ] Abrir o link no mesmo navegador em que a recuperação foi solicitada (PKCE).

## Fora de escopo desta entrega

Aplicar variáveis no painel Netlify/Supabase, enviar e-mail real, rotacionar
credenciais OAuth/SMTP. Ver `docs/TESTE-REAL-PRODUCAO.md` (Fase 3).
