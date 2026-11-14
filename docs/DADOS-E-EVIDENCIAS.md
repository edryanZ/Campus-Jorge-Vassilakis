# Dados, fotos, privacidade e recuperação

Os registros de auditoria e os Blobs das fotografias ficam no IndexedDB do dispositivo; os registros sincronizados também ficam no Supabase, sujeitos às autorizações do banco. Dado salvo localmente **não equivale** a envio confirmado.

Preservar `auditId`, `environmentId`, `evidenceId`, `mutationId`, revisões e snapshots de conflito. Não apagar registros, fotos, stores nem alterar chaves durante refatoração. O banco local encontra-se na versão 3.

As fotos anexadas pelo aplicativo têm limite de 10 MB por arquivo. O manifesto da auditoria e os bytes da evidência devem ser persistidos e confirmados; uma falha não pode ser mascarada como sincronização completa.

O botão de backup em Minha conta gera ZIP local com manifesto e arquivos disponíveis. O ZIP é **confidencial, sem criptografia**, pode conter dados pessoais e **não restaura automaticamente** o aplicativo. Se uma foto não tiver bytes locais, isso é indicado; não alegar que esse backup cobre arquivos ausentes. Confirmar a sessão antes de fornecer os dados.

Antes de qualquer migração/deploy, conferir o dispositivo original, não limpar dados do navegador e comparar dados no Supabase com as cópias locais.
