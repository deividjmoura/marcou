# Padrão de mídia — imagens de serviços

A primeira entrega de mídia do Marcou usa o bucket público `service-images`.
Ele armazena somente imagens de serviços; a foto do profissional (#53) deve
reutilizar o mesmo validador e o mesmo modelo de autorização, mas usa o prefixo
separado `providers/{provider_id}/avatar/{uuid}.{ext}`.

## Contrato

- Coluna: `public.services.image_path` (caminho relativo, não URL).
- Bucket: `service-images`, leitura pública, escrita/alteração/remoção somente
  pelo dono do prestador.
- Caminho: `providers/{provider_id}/services/{service_id}/{uuid}.{ext}`.
- Formatos aceitos: JPEG, PNG e WebP, identificados por magic bytes e dimensões;
  SVG e formatos desconhecidos são rejeitados.
- Limites no servidor: 5 MiB, 4096 px por lado e 16 megapixels.
- O cliente pode filtrar formatos no seletor, mas não é autoridade de validação.
- Substituição atualiza primeiro a referência do serviço; só depois tenta apagar
  o objeto anterior. Falha de limpeza pode deixar objeto órfão, nunca referência
  quebrada. Remoção limpa a referência antes de apagar o arquivo.

## Segurança e testes

As políticas de `storage.objects` conferem bucket, formato do caminho, vínculo
do serviço com o prestador e `providers.owner_id = auth.uid()`. A leitura
pública é intencional para cards públicos; dados privados do prestador não são
expostos pelo caminho.

O harness PostgreSQL emula somente `storage.buckets`, `storage.objects` e
`storage.foldername()` necessários para exercitar RLS e ownership. Ele **não**
executa nem valida o serviço real Supabase Storage, CDN, upload HTTP, MIME
scanner remoto ou cache. A validação real do Storage permanece pendente para o
responsável no roteiro de produção; nenhuma configuração remota é alterada
nesta PR.

## Rollback

O rollback de código é seguro enquanto `image_path` permanece nullable: a
versão anterior ignora a coluna e os serviços continuam agendáveis. Não remover
bucket, coluna ou objetos automaticamente. Uma remoção completa exige backup,
inventário dos objetos e decisão explícita do responsável; deve ser feita por
nova migration forward-only que remova políticas/bucket/coluna somente depois
de confirmar que nenhum serviço ainda referencia os arquivos.
