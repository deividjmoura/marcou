# Design System — Marcou

**Status:** fundação inicial em revisão (Issue #27). Esta entrega não troca a identidade visual existente; organiza tokens e regras para adoção gradual.

## Auditoria da base atual

A main já possui uma folha global extensa em src/app/globals.css, com estilos reutilizados para autenticação, painel, serviços, agendamento, reservas e notificações. Entre as classes existentes estão .btn, .btn-ghost, .auth-card, .field, .card, .item-row, .status-pill, .alert, .booking-widget e .notification-row.

A base visual efetivamente presente na main usa:
- tinta #20211f;
- fundo #f7f7f2;
- superfície branca #ffffff;
- linhas #e6e8df;
- destaque verde #b9e36a e verde escuro #7aa52e;
- fonte Arial/Helvetica.

## Divergência de identidade a resolver

A Issue #27 registra a direção bege, branco e rosé, enquanto a folha global atualmente integrada usa verde como cor de destaque. Esta PR mantém as cores atuais para evitar uma alteração visual abrangente sem validação explícita da direção final. A paleta rosé deve ser aprovada e aplicada numa etapa visual dedicada, com revisão das telas públicas, autenticação e painel.

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

Os tokens espelham os valores atuais quando há equivalência. A migração das classes antigas deve ocorrer gradualmente, sem substituir toda a folha global de uma vez.

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

1. Confirmar a paleta final bege/branco/rosé versus o verde atualmente presente.
2. Migrar gradualmente componentes existentes para os tokens sem alterar comportamento.
3. Criar exemplos visuais dos botões, campos, cards, alertas, badges e estados.
4. Verificar contraste WCAG, foco por teclado e navegação com leitor de tela por componente.
5. Avaliar fonte e ícones com licença/peso documentados.

## Limites desta entrega

Esta fundação não afirma que todo o produto já está em conformidade WCAG. A auditoria completa por tela e testes assistivos permanecem pendentes. Não foram adicionadas dependências, fontes externas ou assets de terceiros.
