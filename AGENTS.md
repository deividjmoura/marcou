# Instruções para agentes — Marcou

Estas instruções se aplicam a agentes de IA e colaboradores que trabalhem neste repositório.

## Releases do GitHub: sempre consultar o responsável

Ao concluir uma tarefa, antes de encerrar o trabalho, o agente deve avaliar se o estado atual da `main` justifica uma nova GitHub Release.

### Quando considerar uma release
Considere sugerir uma release quando:
- uma entrega funcional relevante foi concluída e integrada à `main`;
- os testes aplicáveis passaram;
- a documentação e o `CHANGELOG.md` estão atualizados;
- não há bloqueadores conhecidos que tornem a versão inadequada para ser identificada como entrega.

Não sugira uma release apenas por alterações pequenas, refatorações internas sem impacto relevante ou merges isolados que façam parte de uma entrega ainda incompleta.

### Pergunta obrigatória ao usuário
Quando houver justificativa, pergunte explicitamente ao responsável antes de encerrar:

> Esta entrega (junto com as mudanças acumuladas desde a última release) já justifica publicar uma nova GitHub Release? Quer que eu prepare/publice uma versão agora?

Na pergunta, informe resumidamente:
- o que será incluído;
- a versão sugerida (SemVer);
- se recomenda classificar como alpha, beta ou estável;
- o resultado dos testes e eventuais limitações.

Se não houver justificativa, informe brevemente que não recomenda uma release neste momento e explique por quê.

### Aprovação e publicação
- **Nunca criar tag, GitHub Release ou publicar uma versão sem autorização explícita do responsável.**
- A pergunta não equivale a autorização.
- Se o usuário aprovar, confirme o conteúdo acumulado desde a release anterior, confira o changelog, escolha/valide a tag e prepare as notas da versão.
- Não publique uma versão estável se houver testes obrigatórios falhando ou bloqueadores conhecidos. Explique o impedimento e proponha uma pré-release somente se fizer sentido.
- Não reescreva ou apague releases existentes sem autorização.

## Relação com o changelog
Toda alteração relevante integrada à `main` deve estar registrada no `CHANGELOG.md`. As notas da GitHub Release devem resumir as mudanças acumuladas desde a release anterior, sem inventar funcionalidades ou testes.
