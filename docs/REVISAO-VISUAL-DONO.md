# Revisão visual pelo responsável — Marcou

Este roteiro é uma verificação manual final; não substitui CI nem testes automatizados. Faça-a no Deploy Preview da PR #159 antes de fechar a Issue #121.

## Viewports
- [ ] Mobile: 390 × 844 (e, se possível, 360px de largura).
- [ ] Desktop: 1440 × 900.
- [ ] Sem scroll horizontal, elementos cortados ou controles encobertos.

## Temas
- [ ] Claro: página inicial, login/cadastro, área do cliente, painel do prestador, agenda/calendário, cards, formulários, menus, modais, estados vazio/erro/loading e documentos.
- [ ] Escuro: repetir os mesmos caminhos; texto, bordas, superfícies, alertas e status continuam legíveis.
- [ ] Automático: validar com preferência do sistema clara e escura; mudar preferência do dispositivo enquanto Automático está ativo.
- [ ] Seleção manual Claro/Escuro sobrepõe o sistema e persiste ao recarregar/abrir novamente.
- [ ] Ao carregar ou navegar, não há flash perceptível do tema errado.

## Interação e acessibilidade
- [ ] Seletor acessível por teclado, label compreensível e foco visível.
- [ ] Seletor não cobre navegação/ações (principalmente mobile); alvos de toque confortáveis.
- [ ] Contraste e legibilidade de texto, links, botões, feedback e status em ambos os temas.
- [ ] `prefers-reduced-motion` respeitado; animações não essenciais reduzidas.
- [ ] Console do navegador sem erros de hidratação, CSS ou runtime.

## Evidência
Anote SHA e URL do preview revisado, viewport/tema, resultado e screenshots (home + uma tela autenticada em Claro e Escuro, desktop/mobile). Liste qualquer problema como blocker antes de fechar #121.

## Entregas que compõem a fundação
- #150: tipografia e densidade/spacing.
- #158: tokens semânticos e catálogo.
- #159 / #121: seletor, persistência e aplicação do tema.

A revisão visual deve verificar a experiência integrada, não presumir que CI/contraste dos tokens garante cobertura de todas as telas.
