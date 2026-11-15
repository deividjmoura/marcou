# Motion & transições — regras do projeto Marcou

**Status:** regras canônicas de movimento para **todo** o produto.  
**Escopo:** qualquer tela web (público, prestador, admin, auth).  
**Origem de referência:** linguagem de motion de reels UI premium em Figma (Smart Animate): suave, spring leve, sem hard cuts.  
**Não copiar:** layout de e-commerce/fashion — apenas o **sistema de movimento**.

Qualquer implementação de UI (incluindo Design System #27, fluxo público, booking #21) deve seguir este documento. Em caso de conflito com animação ad-hoc, **este arquivo prevalece**.

---

## 1. Princípios (obrigatórios)

1. **Sem hard cuts** — mudanças de estado usam fade, slide e/ou scale; nunca sumir/aparecer instantâneo sem transição (exceto `prefers-reduced-motion`).
2. **Suave e premium** — easing ease-out ou spring leve; **proibido** linear e bounce exagerado.
3. **Rápido o bastante** — interações de toque ≤ 200ms de feedback; transições de tela 300–450ms; entradas de hero ≤ 600ms.
4. **Stagger com moderação** — listas e grids entram em cascata (≈ 50–80ms entre itens); não atrasar a percepção de resposta.
5. **Motion serve à UX** — animação nunca é necessária para entender a ação; sempre há fallback estático.
6. **Acessibilidade primeiro** — respeitar `prefers-reduced-motion: reduce` (só fade curto ou nenhuma animação de deslocamento).
7. **Uma linguagem só** — mesmos tokens em público, painel e auth; não inventar curvas por tela.

---

## 2. Tokens canônicos

Usar estes valores (ou tokens CSS/JS equivalentes). Não espalhar magic numbers.

### Duração

| Token | Valor | Uso |
|-------|-------|-----|
| `motion.duration.fast` | **180ms** | Tap, press, hover in/out |
| `motion.duration.normal` | **320ms** | Texto, cards, chips, feedback |
| `motion.duration.slow` | **450ms** | Troca de etapa, sheet, modal |
| `motion.duration.enter` | **550ms** | Primeira entrada de bloco/hero |

### Easing

| Token | Valor | Uso |
|-------|-------|-----|
| `motion.ease.out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Padrão de saída (maioria das UI) |
| `motion.ease.inOut` | `cubic-bezier(0.45, 0, 0.55, 1)` | Só se ida e volta simétricos |
| `motion.spring` | spring **stiffness 320**, **damping 28** | Shared layout, pills, sheets |

**Proibido:** `linear`, bounce alto, elastic exagerado.

### Distâncias e escala

| Token | Valor | Uso |
|-------|-------|-----|
| `motion.offset.slideY` | **12px** | Entrada de texto/card (de baixo) |
| `motion.offset.slideX` | **16px** | Entrada lateral (evitar em mobile se possível) |
| `motion.scale.press` | **0.97** | `whileTap` / `:active` em botões e cards clicáveis |
| `motion.scale.hover` | **1.02** | Hover discreto (desktop); opcional |
| `motion.hoverLift` | **-6px** | Elevação de card no hover (desktop) |
| `motion.stagger` | **60ms** | Delay entre filhos em listas/grids |

### Opacidade

- Entrada: `0 → 1`
- Saída: `1 → 0`
- Scrim de modal/sheet: fundo **40–50%** preto (ou token de overlay do DS), fade na mesma duração do painel

---

## 3. Padrões de transição (o que usar onde)

### 3.1 Entrada de página / bloco
- **Fade + slideY (12px)** com `ease.out`, duração `enter` ou `slow`.
- Stagger nos filhos se forem cards/lista.

### 3.2 Troca de etapa no fluxo de agendamento
(serviço → data → horário → dados → confirmação)
- Preferir **shared element / layout transition** quando o mesmo componente muda de lugar.
- Senão: **fade cruzado** ou slide horizontal curto (16px) + fade, `slow`.
- **Não** usar page reload visual brusco.

### 3.3 Cards (serviços, horários, prestador)
- Entrada: stagger + fade + slideY.
- Hover (desktop): lift -6px + sombra um passo acima no DS.
- Tap: scale **0.97** por ~120–180ms.

### 3.4 Botões e CTAs
- Tap/press: scale 0.97 (`fast`).
- Estado loading: trocar label/spinner **com** fade (`fast`/`normal`), sem pular layout se possível (reservar min-width).

### 3.5 Bottom sheet / modal
- Painel: `y` de 100% → 0 (ou 24px → 0) + fade, `slow` ou spring.
- Backdrop: fade de opacidade.
- Fechar: inverso, mesma curva.

### 3.6 Navegação / abas / passos
- Indicador ativo (pill/underline): **layoutId compartilhado** deslizando entre itens (`spring` ou `normal` + ease.out).
- Ícones: fade ou morph suave; sem rotação gratuita.

### 3.7 Imagens
- Zoom máximo **1.05** em hover ou troca; duração ≤ `slow`.
- Nunca zoom agressivo que cause crop confuso.

### 3.8 Feedback (sucesso, erro, toast)
- Entrada: slideY + fade (`normal`).
- Saída: fade (`fast`/`normal`).
- Erro: pode usar leve shake **horizontal ≤ 4px**, no máximo 2 ciclos; opcional e desligado em reduced-motion.

---

## 4. O que é proibido

- Hard cut entre estados importantes do fluxo
- Bounce / elastic chamativo
- Animações > 600ms em interação recorrente
- Stagger total > ~400ms para o último item em listas curtas (máx. ~8 itens staggerados; o resto entra junto)
- Motion que bloqueia input (exceto loaders explícitos)
- Dependência de animação para legibilidade (texto deve ser legível com motion off)
- Parallax 3D, glitch, partículas, blur de movimento pesado
- Curvas e durações diferentes por feature sem atualizar este doc

---

## 5. `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  /* global */
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Em JS (Framer Motion etc.):
- Se `useReducedMotion() === true`: apenas `opacity` em ≤ 150ms, **sem** `x`/`y`/`scale` (ou scale fixo 1).

---

## 6. Implementação de referência

### CSS variables (sugerido)

```css
:root {
  --motion-fast: 180ms;
  --motion-normal: 320ms;
  --motion-slow: 450ms;
  --motion-enter: 550ms;
  --motion-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --motion-slide-y: 12px;
  --motion-stagger: 60ms;
  --motion-press: 0.97;
}
```

### Framer Motion (exemplo de tokens)

```ts
export const motionTokens = {
  duration: { fast: 0.18, normal: 0.32, slow: 0.45, enter: 0.55 },
  ease: { out: [0.22, 1, 0.36, 1] as const },
  spring: { type: "spring" as const, stiffness: 320, damping: 28 },
  stagger: 0.06,
  slideY: 12,
  press: 0.97,
};

export const fadeSlideUp = {
  initial: { opacity: 0, y: motionTokens.slideY },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: motionTokens.duration.normal, ease: motionTokens.ease.out },
};
```

Variantes de lista: `container` com `staggerChildren: motionTokens.stagger`; filhos usam `fadeSlideUp`.

---

## 7. Checklist de PR (motion)

Antes de mergear UI:

- [ ] Usa tokens deste doc (duração/ease/offset)?
- [ ] Sem hard cut em troca de etapa ou feedback importante?
- [ ] Tap com scale ~0.97 em controles primários?
- [ ] Listas com stagger ≤ 60–80ms?
- [ ] `prefers-reduced-motion` testado (ou variante reduzida garantida)?
- [ ] Nenhuma animação impede leitura ou clique?
- [ ] Mesma linguagem no mobile e desktop (hover só onde há ponteiro)?

---

## 8. Relação com outras áreas

| Área | Como aplica |
|------|-------------|
| **Design System (#27)** | Tokens de motion devem viver no DS (CSS vars ou theme); componentes Button, Card, Modal, Tabs já nascem com estes comportamentos |
| **Booking (#21)** | Multi-serviço, slots e confirmação usam fade/slide/stagger e shared layout entre etapas |
| **Público / preview** | Entrada de serviços e calendário seguem §3 |
| **Platform (#30)** | Sem impacto em deploy; este doc é só produto |

Alterações a estes tokens = atualizar **este arquivo** na mesma PR.

---

## 9. Resumo em uma frase

> Tudo no Marcou se move com **fade + slide/scale suaves**, **180–450ms**, **ease-out ou spring leve**, **stagger de ~60ms**, **press 0.97**, **sem hard cuts**, e **respeitando reduced-motion**.
