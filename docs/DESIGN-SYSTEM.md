# Design System — Marcou

**Status:** fundação visual e migração inicial em revisão (Issue #27). A paleta bege, branco e rosé foi aplicada aos estilos globais existentes por meio dos tokens semânticos.

## Auditoria da base atual

A main já possui uma folha global extensa em src/app/globals.css, com estilos reutilizados para autenticação, painel, serviços, agendamento, reservas e notificações. Entre as classes existentes estão .btn, .btn-ghost, .auth-card, .field, .card, .item-row, .status-pill, .alert, .booking-widget e .notification-row.

A base anterior à PR usava destaque verde e fonte Arial/Helvetica. Nesta entrega, a camada global passa a consumir tokens de tinta ameixa, fundo bege, superfícies brancas, linhas rosadas e acento rosé.

## Identidade visual aplicada

A Issue #27 registra como direção aprovada bege, branco e rosé. A PR aplica essa paleta na folha global compartilhada, cobrindo landing, autenticação, painel, serviços, agendamento, reservas e notificações. As cores semânticas de sucesso, aviso, erro e informação continuam distintas da cor de marca para preservar significado e legibilidade.

## Tokens iniciais

Os tokens estão em src/styles/design-tokens.css e são carregados pelo layout raiz.

| Grupo | Convenção |
|---|---|
| Cores | --ds-color-* por função semântica |
| Tipografia | --ds-font-* e --ds-line-height-* |
| Espaçamento | escala de 4px: --ds-space-1 até --ds-space-16 |
| Bordas | --ds-radius-* |
| Elevação | --ds-shadow-* |
| Foco e controles | --ds-focus-*, --ds-control-min-height |

A folha global mantém as classes e APIs CSS existentes, mas seus valores estruturais agora apontam para os tokens semânticos. A migração de componentes específicos e a remoção gradual de valores legados podem ocorrer em PRs menores.

## Acessibilidade e movimento

- Foco visível padronizado para links, botões, campos e elementos com tabulação.
- Controles mantêm fonte coerente com o sistema.
- prefers-reduced-motion: reduce reduz animações e transições globalmente.
- Alvos interativos devem buscar altura mínima de 44px; revisar componentes individualmente durante a migração.
- Estados de erro, sucesso, aviso e informação devem usar texto além da cor.

## Tipografia e licenças

Nenhuma fonte externa foi adicionada nesta etapa. A base permanece em Arial/Helvetica, sem download de arquivos ou dependência nova. Uma fonte de marca só deve ser escolhida após avaliar licença, cobertura de caracteres portugueses, legibilidade mobile, peso e carregamento.

## Ícones e animações

Nenhuma biblioteca ou asset animado foi adicionado. Ícones animados devem ser pontuais, ter alternativa estática, respeitar prefers-reduced-motion e não carregar conteúdo remoto sem necessidade. Antes de incorporar arquivos da LottieFlow/LottieFiles, registrar origem e licença do asset.

## Próximos passos

1. Fazer revisão visual por tela em desktop e mobile, incluindo estados de erro, sucesso, aviso e indisponibilidade.
2. Medir contraste WCAG dos pares reais de texto/superfície e corrigir qualquer falha encontrada.
3. Migrar componentes específicos para os tokens sem alterar comportamento e criar catálogo de exemplos.
4. Avaliar fonte de marca e ícones animados somente após verificar licença, peso, fallback e acessibilidade.

## Limites desta entrega

Esta fundação não afirma que todo o produto já está em conformidade WCAG. A auditoria completa por tela e testes assistivos permanecem pendentes. Não foram adicionadas dependências, fontes externas ou assets de terceiros.


## Migração da paleta — 15/11/2026

- Acento de marca: rosé escuro `#8A4D62`; fundo de acento `#E8C4CF`; superfície suave `#F7E9ED`.
- Fundo geral: bege `#F8F3F0`; superfície: branco `#FFFFFF`; tinta: ameixa `#33272B`.
- A folha `src/app/globals.css` preserva as classes atuais e passa a consumir `--ds-*` para cores estruturais. Tons de status permanecem semanticamente separados da marca.
- Nenhuma fonte externa, biblioteca de ícones ou asset animado foi incluído nesta etapa. A escolha depende de análise de licença e desempenho.
- A aprovação visual final ainda exige inspeção humana das telas renderizadas e verificação objetiva de contraste por estado; o CI técnico não substitui essa revisão.
