# Design System — Marcou

**Status:** fundação visual e migração inicial em revisão (Issue #27). A paleta bege, branco e rosé foi aplicada aos estilos globais existentes por meio dos tokens semânticos.

## Auditoria da base atual

A main já possui uma folha global extensa em src/app/globals.css, com estilos reutilizados para autenticação, painel, serviços, agendamento, reservas e notificações. Entre as classes existentes estão .btn, .btn-ghost, .auth-card, .field, .card, .item-row, .status-pill, .alert, .booking-widget e .notification-row.

A base anterior à PR usava destaque verde e fonte Arial/Helvetica. Nesta entrega, a camada global passa a consumir tokens de tinta ameixa, fundo bege, superfícies brancas, linhas rosadas e acento rosé.

## Identidade visual aplicada

A Issue #27 registra como direção aprovada bege, branco e rosé. A PR aplica essa paleta na folha global compartilhada, cobrindo landing, autenticação, painel, serviços, agendamento, reservas e notificações. As cores semânticas de sucesso, aviso, erro e informação continuam distintas da cor de marca para preservar significado e legibilidade.

## Tokens semânticos

Os tokens estão em `src/styles/design-tokens.css`, carregados pelo layout raiz. Aliases de função evitam que componentes conheçam nomes de paleta ou hex.

| Papel | Tokens | Uso |
|---|---|---|
| Fundo | `--ds-color-background` | Base da página |
| Superfície | `--ds-color-surface-default`, `--ds-color-surface-muted` | Cards, campos e agrupamentos |
| Texto | `--ds-color-text-primary`, `--ds-color-text-secondary` | Conteúdo e texto auxiliar |
| Borda | `--ds-color-border`, `--ds-color-border-strong` | Divisores, campos e separação |
| Destaque | `--ds-color-accent`, `--ds-color-accent-subtle`, `--ds-color-link` | Ações, links e seleção |
| Feedback | `--ds-color-success/warning/danger/info` + tokens `*-bg` | Status e alertas |
| Controles | `--ds-color-control-bg`, `--ds-color-control-text` | Formulários |
| Foco | `--ds-focus-color`, largura e offset | Foco visível |

Também há tokens de tipografia, espaçamento, raio, elevação, movimento e altura mínima de controle. A escala de espaço segue incrementos de 4px.

### Tema claro, escuro e automático (Issue #121)

O seletor global oferece **Claro**, **Escuro** e **Automático**. A preferência é persistida no cookie `marcou-theme` (`Path=/`, `SameSite=Lax`, 1 ano; `Secure` em HTTPS) e lida no servidor no layout raiz. Um script `beforeInteractive` resolve `prefers-color-scheme` antes da hidratação; CSS mantém fallback via media query para Automático. O provider acompanha alterações do sistema quando Automático está selecionado.

O token set `[data-theme="dark"]` e o fallback `[data-theme="system"]` usam `color-scheme: dark`; aliases legados acompanham os papéis semânticos. CSS global, estados de feedback/status, painel, documentos e conta usam tokens para as cores principais. Testes verificam pares texto/fundo AA (4.5:1) e o contrato de preferência. **A cobertura visual ainda deve ser conferida por captura 390/1440 em todos os temas**; hard-coded restantes precisam ser tratados quando identificados.

### Contrato de uso

```css
.component {
  color: var(--ds-color-text-primary);
  background: var(--ds-color-surface-default);
  border-color: var(--ds-color-border);
}
.component a { color: var(--ds-color-link); }
```

Evite valores hex de paleta diretamente em componentes novos. Prefira o papel semântico. Feedback deve combinar cor com texto/ícone/label.

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

## Catálogo de componentes (inventário, não redesign)

As classes são APIs CSS existentes. Use variantes e estados sem duplicar estilos inline.

| Componente/classe | Variantes/estados | Orientação |
|---|---|---|
| `.btn`, `.btn-ghost`, `.btn-small` | Primário, ghost/secundário, compacto, hover, foco, disabled | Uma ação principal por contexto; ghost para secundária; alvo interativo de 44px |
| `.field` + input/select/textarea | Default, focus-visible, erro, disabled | Label visível; erro associado; manter foco |
| `.card`, `.auth-card`, `.booking-widget` | Superfície, borda, conteúdo, título | Agrupar conteúdo; evitar cards aninhados sem necessidade |
| `.item-row`, `.notification-row` | Normal, unread, ações, responsivo | Preservar hierarquia; texto longo deve quebrar |
| `.status-pill` | pending, review, confirmed, cancelled, expired | Status sempre textual; cor não é único sinal |
| `.alert` | error, success, warning, info | Mensagem clara; `role=alert` conforme urgência |
| `.provider-nav-item`, `.provider-utility-link` | active, hover, focus, mobile nav | Indicar página atual além da cor |
| `.slot` | disponível, selected, disabled | Disponibilidade é backend; seleção e foco distintos |
| Dialog/modal | diálogo, confirmação, cancelamento, loading | Foco inicial/restaurado, Esc, nome acessível e scroll contido; inventário não cria modal universal |

### Exemplos

```tsx
<button className="btn">Salvar</button>
<button className="btn btn-ghost">Cancelar</button>
<label className="field">
  <span>Nome</span>
  <input name="name" />
</label>
<div className="card">Conteúdo agrupado</div>
<div className="alert alert-info" role="status">Informação</div>
```

As classes `.btn-primary` e `.btn-danger` não existem na base atual; não use sem implementação. Modal/dialog é um padrão de interação, não uma classe universal.

## Próximos passos

1. Fazer revisão visual por tela em desktop e mobile, incluindo estados de erro, sucesso, aviso e indisponibilidade.
2. Medir contraste WCAG dos pares reais de texto/superfície e corrigir qualquer falha encontrada.
3. Migrar componentes específicos para tokens sem alterar comportamento, em PRs pequenas.
4. Revisar visualmente a dupla Manrope/Lora em desktop e mobile; avaliar ícones animados somente após verificar licença, peso, fallback e acessibilidade.

## Limites desta entrega

Esta fundação não afirma que todo o produto já está em conformidade WCAG. A auditoria completa por tela e testes assistivos permanecem pendentes. O bloco escuro fornece tokens de base, mas não implementa tema nem garante cobertura de todos os componentes. Foram adicionadas duas famílias auto-hospedadas e suas licenças; nenhum ícone animado ou outro asset visual de terceiros foi incluído.


## Migração da paleta — 15/11/2026

- Acento de marca: rosé escuro `#8A4D62`; fundo de acento `#E8C4CF`; superfície suave `#F7E9ED`.
- Contraste calculado (WCAG): rosé escuro sobre branco 6,33:1 e sobre bege 5,75:1; texto secundário `#76686D` sobre bege 4,80:1. Os três pares atendem AA para texto normal. A medição não substitui a revisão de todos os estados e componentes.
- Fundo geral: bege `#F8F3F0`; superfície: branco `#FFFFFF`; tinta: ameixa `#33272B`.
- A folha `src/app/globals.css` preserva as classes atuais e passa a consumir `--ds-*` para cores estruturais. Tons de status permanecem semanticamente separados da marca.
- Nenhuma fonte externa, biblioteca de ícones ou asset animado foi incluído nesta etapa. A escolha depende de análise de licença e desempenho.
- A aprovação visual final ainda exige inspeção humana das telas renderizadas e verificação objetiva de contraste por estado; o CI técnico não substitui essa revisão.
