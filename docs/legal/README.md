# Documentos legais e de comunidade — Marcou

**Status:** minutas internas, não vigentes e não aprovadas para aceite
**Issue:** [#106](https://github.com/deividjmoura/marcou/issues/106)
**Atualização:** 23/11/2026

## Fonte canônica das minutas exibidas

O conteúdo público versionado está em
`src/content/legal-documents.json` e é exibido nas rotas:

- `/termos`;
- `/privacidade`;
- `/diretrizes-da-comunidade`;
- `/politica-de-conteudo-e-avaliacoes`;
- `/documentos`, como índice de situação e versões.

As minutas são deliberadamente marcadas como `draft`, usam a versão
`0.1-draft` e têm `requiresAcceptance: false`. Elas não devem ser promovidas nem
exigidas de usuários sem revisão jurídica e sem cumprir o checklist desta pasta.

## O que esta entrega implementa

- manifesto validado, versão e hash SHA-256 do conteúdo canônico;
- páginas públicas com aviso explícito de minuta;
- metadata persistida em `legal_documents`;
- recibo imutável em `legal_acceptances` com usuário, documento, versão, hash e
  instante;
- RPC que aceita apenas a versão publicada, vigente e de hash exato;
- fluxo acessível com uma caixa não marcada por documento e opção de recusar e
  encerrar a sessão;
- nova versão material volta a ficar pendente; versão informativa pode ser
  publicada sem bloquear;
- RLS para que cada usuário leia apenas os próprios recibos.

A migration apenas semeia minutas e não ativa obrigação de aceite. O fluxo de
consentimento ficará inativo no uso normal enquanto não houver documento
`published`, efetivo e marcado como obrigatório.

## Atenção jurídica

Estes arquivos e telas não são parecer jurídico. Antes de publicar uma versão
vigente, é necessário confirmar a operação real e obter revisão de profissional
brasileiro com experiência em proteção de dados, tecnologia, consumo e
marketplaces.

A documentação da Zelora foi usada como referência de temas. A redação do Marcou
foi reduzida ao comportamento observável neste repositório e diferencia recursos
atuais de módulos ainda planejados.

## Arquivos operacionais

- [Checklist de publicação](CHECKLIST-PUBLICACAO.md)
- [Modelo de versionamento e aceite](MODELO-VERSIONAMENTO-E-ACEITE.md)
- [Decisão Marcou Social](../DECISAO-ARQUITETURA-MARCOU-SOCIAL.md)
- [Roadmap Marcou Social](../ROADMAP-MARCOU-SOCIAL.md)
