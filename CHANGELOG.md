# Changelog

Todas as mudanças funcionais, visuais, estruturais, de segurança ou de banco de
dados do Marcou são registradas neste arquivo.

O formato segue os princípios de [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).
Toda Pull Request com mudanças relevantes deve atualizar a seção `## [Unreleased]`
(consulte [CONTRIBUTING.md](CONTRIBUTING.md)).

## [Unreleased]

### Adicionado

- Modal nativo (`<dialog>`) para criar e editar serviços no painel (Issue `#56`): foco devolvido ao gatilho, Esc e clique fora fecham, erros de validação/salvamento permanecem no modal sem perder o digitado, fechamento só após sucesso, folha em mobile com ações fixas e campo de imagem da `#154` preservado. Lógica de fechamento em `service-form-state.ts` coberta por teste unitário.

