# Padrão de mídia — imagens de serviços

O padrão de mídia do Marcou usa o bucket público `service-images` para imagens
de serviços e avatares profissionais. Os dois fluxos compartilham o validador
server-side e o mesmo limite; cada tipo usa um prefixo e uma política de
propriedade específicos.

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

## Avatar do profissional (#53)

- Coluna: `public.providers.avatar_path` (caminho relativo, nunca URL).
- Migration: `20261128000600_provider_avatar_storage.sql`, posterior à migration
  de imagens de serviços.
- Caminho: `providers/{provider_id}/avatar/{uuid}.{ext}`.
- Bucket: o mesmo `service-images`; leitura pública intencional para a página
  pública do profissional; escrita/alteração/remoção somente pelo dono do
  registro `providers`.
- Upload, substituição e remoção usam o mesmo validador JPEG/PNG/WebP, limite
  5 MiB, 4096 px por lado e 16 MP. A referência do perfil é atualizada antes
  da tentativa de apagar o objeto anterior; falha de limpeza pode deixar órfão,
  nunca uma referência quebrada.
- A Server Action deriva o prestador por `requireUser()` +
  `getOwnedProvider(user.id)`; não recebe `provider_id` do navegador. A
  política de Storage repete a checagem `providers.owner_id = auth.uid()`.

## Segurança e testes

As políticas de `storage.objects` conferem bucket, formato do caminho e
propriedade do recurso: para serviços, o vínculo serviço/prestador; para avatar,
o registro de `providers`; em ambos os casos `providers.owner_id = auth.uid()`.
A leitura pública é intencional para os recursos exibidos na página pública;
dados privados do prestador não são adicionados aos payloads públicos. O painel
usa preview local e fallback por iniciais; a página pública usa texto alternativo
com o nome do profissional.

O harness PostgreSQL emula somente `storage.buckets`, `storage.objects` e
`storage.foldername()` necessários para exercitar RLS e ownership. Ele **não**
executa nem valida o serviço real Supabase Storage, CDN, upload HTTP, MIME
scanner remoto ou cache. A validação real do Storage permanece pendente para o
responsável no roteiro de produção; nenhuma configuração remota é alterada
nesta PR.

## Rollback

O rollback de código é seguro enquanto `image_path` e `avatar_path` permanecem
nullable: a versão anterior ignora as colunas e os serviços continuam agendáveis. Não remover
bucket, coluna ou objetos automaticamente. Uma remoção completa exige backup,
inventário dos objetos e decisão explícita do responsável; deve ser feita por
nova migration forward-only que remova políticas/bucket/coluna somente depois
de confirmar que nenhum serviço ainda referencia os arquivos.
