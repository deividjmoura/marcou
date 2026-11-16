# Ícones (estilo caligráfico com laços e brilhos)

18 ícones em SVG, grade 48×48, traço monoline de 2,75, pontas arredondadas.
Assinatura visual: **curvas de caligrafia nas pontas dos traços** (laços), **argolas** e **brilhos em forma de estrela**.

## Cores via tema (sem hex fixo)

- O traço usa `currentColor`, então herda a cor do texto/ícone do componente.
- Brilhos, pontos e laços de destaque usam `var(--icon-accent, currentColor)`.
  Defina `--icon-accent` com o token de destaque do seu design system.

```css
.icon { color: var(--text-primary); --icon-accent: var(--accent); width: 24px; height: 24px; }
```

> Os ícones precisam estar **inline** (ou via sprite) para herdar cores. Usados em `<img>`, eles perdem `currentColor` e `var()`.

## Uso com o sprite

```html
<svg class="icon" aria-hidden="true"><use href="sprite.svg#ic-agenda"/></svg>
```

## Lista

inicio, agenda, horario, sacola, favoritos, perfil, notificacoes, buscar, ajustes,
confirmar, adicionar, local, mensagens, novidades, modo-escuro, seta-direita, menu, fechar

## Dicas

- Tamanhos que funcionam bem: 24, 32 e 48 px .
- Abaixo de 20 px os brilhos e laços ficam pequenos; use 24 px ou mais para manter o detalhe.
