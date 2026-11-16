# Dados, fotos, privacidade e recuperação

Os registros de auditoria e os Blobs das fotografias ficam no IndexedDB do dispositivo; os registros sincronizados também ficam no Supabase, sujeitos às autorizações do banco. Dado salvo localmente **não equivale** a envio confirmado.

Preservar `auditId`, `environmentId`, `evidenceId`, `mutationId`, revisões e snapshots de conflito. Não apagar registros, fotos, stores nem alterar chaves durante refatoração. O banco local encontra-se na versão 3.

As fotos anexadas pelo aplicativo têm limite de 10 MB por arquivo. O manifesto da auditoria e os bytes da evidência devem ser persistidos e confirmados; uma falha não pode ser mascarada como sincronização completa.

O botão de backup em Minha conta gera ZIP local com manifesto e arquivos disponíveis. O ZIP é **confidencial, sem criptografia**, pode conter dados pessoais e **não restaura automaticamente** o aplicativo. Se uma foto não tiver bytes locais, isso é indicado; não alegar que esse backup cobre arquivos ausentes. Confirmar a sessão antes de fornecer os dados.

Antes de qualquer migração/deploy, conferir o dispositivo original, não limpar dados do navegador e comparar dados no Supabase com as cópias locais.

## Checkpoints e versões incompletas (v16.5.6)

Toda redução de respostas preenchidas, referências de fotografias ou não conformidades deve preservar a versão anterior em `conflicts`, atomicamente com a nova versão da auditoria. Os checkpoints fazem parte do backup ZIP porque pertencem à mesma coleção de conflitos e devem continuar privados; não removê-los em limpezas de código. Mensagens de interface precisam diferenciar **salvo e relido no dispositivo**, **aguardando Supabase**, **confirmado pelo Supabase** e **divergência**. A proteção não impede perda por exclusão dos dados do navegador, troca de domínio ou dano do aparelho; reforçar cópias externas confidenciais das auditorias críticas.
