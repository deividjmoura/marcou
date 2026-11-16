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

A primeira combinação tipográfica foi aplicada com arquivos servidos pelo próprio app, sem requisições a serviços externos:

- **Interface e textos:** Manrope Variable, pesos variáveis, pacote `@fontsource-variable/manrope@5.3.0`.
- **Títulos e destaques editoriais:** Lora, pesos 400–600 e itálico 400, pacote `@fontsource/lora@5.3.0`.
- As duas famílias usam SIL Open Font License 1.1; os avisos e textos integrais estão em `LICENSES/MANROPE-OFL.txt` e `LICENSES/LORA-OFL.txt`.
- Ambas incluem subconjuntos Latin e Latin Extended, necessários para os caracteres em português. O fallback de sistema permanece definido nos tokens.
- O arquivo de marca `public/branding/marcou-logo.svg` foi preservado; a tipografia não redesenha nem substitui o logotipo.

A escolha é uma primeira versão revisável, não uma aprovação visual final. Evitar adicionar uma terceira família sem necessidade comprovada.

## Ícones e animações

Nenhuma biblioteca ou asset animado foi adicionado. Ícones animados devem ser pontuais, ter alternativa estática, respeitar prefers-reduced-motion e não carregar conteúdo remoto sem necessidade. Antes de incorporar arquivos da LottieFlow/LottieFiles, registrar origem e licença do asset.

## Densidade de interface — 16/11/2026

Ajuste incremental para reduzir áreas vazias sem sacrificar leitura ou toque:

- Reduzidos os degraus maiores da escala de espaçamento (tokens 8, 10, 12 e 16).
- Compactados os paddings e intervalos da landing, autenticação e painel do prestador.
- Reduzida a altura mínima visual do painel; navegação lateral e cabeçalho ocupam menos espaço.
- Mantida a altura mínima de 44px dos controles interativos para preservar alvos de toque.
- Nenhuma rota, ação, permissão, regra de agendamento ou migration foi alterada.

## Próximos passos

1. Fazer revisão visual por tela em desktop e mobile, incluindo estados de erro, sucesso, aviso e indisponibilidade.
2. Medir contraste WCAG dos pares reais de texto/superfície e corrigir qualquer falha encontrada.
3. Migrar componentes específicos para os tokens sem alterar comportamento e criar catálogo de exemplos.
4. Revisar visualmente a dupla Manrope/Lora em desktop e mobile; avaliar ícones animados somente após verificar licença, peso, fallback e acessibilidade.

## Limites desta entrega

Esta fundação não afirma que todo o produto já está em conformidade WCAG. A auditoria completa por tela e testes assistivos permanecem pendentes. Foram adicionadas duas famílias auto-hospedadas e suas licenças; nenhum ícone animado ou outro asset visual de terceiros foi incluído.


## Migração da paleta — 15/11/2026

- Acento de marca: rosé escuro `#8A4D62`; fundo de acento `#E8C4CF`; superfície suave `#F7E9ED`.
- Contraste calculado (WCAG): rosé escuro sobre branco 6,33:1 e sobre bege 5,75:1; texto secundário `#76686D` sobre bege 4,80:1. Os três pares atendem AA para texto normal. A medição não substitui a revisão de todos os estados e componentes.
- Fundo geral: bege `#F8F3F0`; superfície: branco `#FFFFFF`; tinta: ameixa `#33272B`.
- A folha `src/app/globals.css` preserva as classes atuais e passa a consumir `--ds-*` para cores estruturais. Tons de status permanecem semanticamente separados da marca.
- Nenhuma fonte externa, biblioteca de ícones ou asset animado foi incluído nesta etapa. A escolha depende de análise de licença e desempenho.
- A aprovação visual final ainda exige inspeção humana das telas renderizadas e verificação objetiva de contraste por estado; o CI técnico não substitui essa revisão.
