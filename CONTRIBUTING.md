# Guia de Contribuição — Marcou

Este documento define as regras obrigatórias para contribuições no repositório
`deividjmoura/marcou`, válidas para pessoas desenvolvedoras e agentes.

## 1. Fluxo de branches e Pull Requests

- Crie sua branch a partir da `main` atualizada (ou utilize exclusivamente a
  branch atribuída pelo ambiente do agente).
- Nunca faça commit direto nem merge automático na `main` sem revisão.
- Mantenha cada PR focada em uma única entrega ou leaf issue; não misture
  refatorações amplas fora do escopo.
- Nunca aplique migrations em produção nem altere configurações remotas de
  Supabase, Google Cloud ou Netlify sem autorização explícita.

## 2. Atualização obrigatória do `CHANGELOG.md`

Toda Pull Request que introduza mudanças **funcionais**, **visuais**,
**estruturais** ou de **banco de dados** **deve** adicionar uma entrada clara em
[`CHANGELOG.md`](CHANGELOG.md), dentro de `## [Unreleased]`, na subseção adequada:

- `### Adicionado` — novas funcionalidades, scripts, rotas, contratos ou fluxos.
- `### Alterado` — melhorias de desempenho, ajustes visuais ou evolução de comportamento existente.
- `### Corrigido` — correções de bugs ou inconsistências.
- `### Segurança` — endurecimento de autorização, RLS, validação, sessão ou privacidade.

### Regras do changelog

1. **Registre apenas o que foi realmente implementado no código da PR.** Não
   registre pendências externas nem configurações manuais ainda não aplicadas
   como se estivessem concluídas.
2. **Sem dados sensíveis:** nunca inclua credenciais, tokens, `code`,
   `token_hash`, senhas SMTP, segredos OAuth ou dados pessoais.
3. **Verificação no CI:** o job de qualidade executa `npm run check:changelog`.
   PRs que alterem arquivos em `src/` (exceto arquivos exclusivos de teste),
   `public/`, `supabase/`, `scripts/`, `.github/workflows/` ou arquivos raiz de
   configuração falham automaticamente se `CHANGELOG.md` não receber uma entrada
   correspondente **dentro da seção `## [Unreleased]`** (e sob uma subseção `###`
   válida).
4. Alterações exclusivamente documentais (`docs/`, `README.md`,
   `CONTRIBUTING.md`, `AGENT_TASK_MARCOU.md`) ou restritas a arquivos `*.test.ts`
   são dispensadas da exigência automática, podendo ainda registrar notas quando
   relevante.

Para validar localmente antes de abrir a PR:

```bash
npm run check:changelog -- --base origin/main
```

## 3. Verificações obrigatórias antes de abrir PR

Execute localmente e reporte apenas resultados reais na descrição da PR:

```bash
npm run check:changelog
npm run lint
npm run typecheck
npm run test
npm run test:db
npm run audit
npm run build
```

## 4. Guardrails de domínio e segurança

- O backend e o PostgreSQL/RLS são a única autoridade para identidade
  (`auth.uid()`), ownership (`providers.owner_id`), preço, duração, ocupação e
  transições de agendamento.
- O cliente Supabase deve sempre vir de `@supabase/ssr` (fluxo PKCE).
- Novas funções `SECURITY DEFINER` devem fixar `search_path = pg_catalog, public`,
  revogar `EXECUTE` de `PUBLIC`, `anon` e `authenticated` na própria migration e
  conceder permissão mínima por papel.
