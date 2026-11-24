# Dados, fotos, privacidade e recuperação

Os registros de auditoria e os Blobs das fotografias ficam no IndexedDB do dispositivo; os registros sincronizados também ficam no Supabase, sujeitos às autorizações do banco. Dado salvo localmente **não equivale** a envio confirmado.

Preservar `auditId`, `environmentId`, `evidenceId`, `mutationId`, revisões e snapshots de conflito. Não apagar registros, fotos, stores nem alterar chaves durante refatoração. O banco local encontra-se na versão 3.

As fotos anexadas pelo aplicativo têm limite de 10 MB por arquivo. O manifesto da auditoria e os bytes da evidência devem ser persistidos e confirmados; uma falha não pode ser mascarada como sincronização completa.

O botão de backup em Minha conta gera ZIP local com manifesto e arquivos disponíveis. O ZIP é **confidencial, sem criptografia**, pode conter dados pessoais e **não restaura automaticamente** o aplicativo. Se uma foto não tiver bytes locais, isso é indicado; não alegar que esse backup cobre arquivos ausentes. Confirmar a sessão antes de fornecer os dados.

Antes de qualquer migração/deploy, conferir o dispositivo original, não limpar dados do navegador e comparar dados no Supabase com as cópias locais.

## Restaurar backup local (v16.5.6)

A área **Minha conta** oferece importação explícita de arquivos ZIP gerados pelo CJV. O aplicativo valida cabeçalhos, diretório, CRC-32 de todos os arquivos, manifesto e vínculos entre auditorias/fotografias/conflitos, antes de gravar. Apenas ZIP sem compressão, de uma única parte e dentro dos limites aceitos; falhas abortam sem importar dados.

A importação exige conta autorizada e confirmação humana; considera o proprietário de cada auditoria. Registros já existentes no dispositivo **não são sobrescritos**; apenas auditorias ausentes e suas fotografias/conflitos são acrescentadas em uma única transação IndexedDB. Falha da transação impede importação parcial. Fotografias ausentes no arquivo são indicadas explicitamente.

Auditorias importadas recebem estado **CONFLICT**, exigindo conferência manual; não são enviadas automaticamente ao Supabase. Nenhuma restauração altera o banco remoto, publica dados ou vincula contas antigas sem permissão. Não apagar o ZIP original, limpar dados do dispositivo de origem ou assumir que um backup local representa toda a base do Supabase.

## Revisão da estabilidade — v16.5.7 (etapa 6)

Além de auditorias ausentes, o importador pode acrescentar **registros de fotografias ausentes** a uma auditoria já cadastrada no dispositivo, desde que o ID da fotografia esteja referenciado pela auditoria existente, e haja correspondência de ambiente e proprietário. Arquivos de evidências já existentes jamais são substituídos. Fotografias inexistentes no ZIP não provocam alteração no registro existente.

A recuperação de fotografia em auditoria já existente coloca essa auditoria no estado `CONFLICT` e mantém `restoreReviewRequired=true`, dentro da mesma transação de inserção da fotografia. **É uma alteração de metadados de proteção, não dos campos coletados**, e impede sincronização automática. A verificação e atualização ocorrem na mesma transação IndexedDB, para não regravar um snapshot anterior sobre mudanças novas. Confirmações remotas tardias preservam a quarentena da restauração.

O sistema ainda não substitui um registro de evidência já cadastrado sem bytes; essa recuperação específica exige procedimento futuro de comparação e consentimento para preservar a evidência existente.
