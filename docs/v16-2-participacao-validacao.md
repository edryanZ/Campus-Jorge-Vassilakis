# Validação da prévia v16.2 — participação controlada por auditoria

**Escopo:** implementação apenas na branch `preview-v16-1-acessos`. A `main` não deve ser alterada automaticamente. O Supabase é compartilhado com a aplicação publicada: as duas migrações v16.2 foram aditivas, sem atualizar registros reais.

## Comportamento esperado

1. Auditor aprovado vê, na lista do bloco e na Central de Auditorias, que a Sala 1 (Mini Auditório) possui auditoria em andamento e o nome do responsável.
2. A auditoria ativa de outro usuário **não aparece como conteúdo privado**. O auditor consegue apenas solicitar participação na auditoria existente.
3. A solicitação aparece no painel do administrador, que pode **Autorizar participação** ou **Revogar participação** separadamente da aprovação da conta.
4. Após a autorização, o auditor pode clicar **Continuar auditoria compartilhada**. O registro permanece com o mesmo ID e proprietário. Alterações usam `sync_shared_audit`, com verificação da revisão remota.
5. Se duas pessoas tentarem iniciar auditorias ao mesmo tempo, o índice único por `environment_id` impede a segunda auditoria ativa. Sem rede e sem rascunho existente, o sistema não inicia um novo registro.
6. Uma autorização revogada bloqueia novas leituras e edições compartilhadas no Supabase. Dados locais pendentes são preservados para diagnóstico, **não são apagados automaticamente**.
7. Novas fotografias pelo participante estão temporariamente desativadas. Evidências já existentes permanecem vinculadas ao registro; o proprietário original faz inclusões.
8. Visitantes e contas pendentes continuam sem consultar dados privados ou metadados de ocupação.

## Migrações (já aplicadas)

- `supabase/migrations/20261021_v16_2_occupancy.sql`: índice global e função de ocupação com metadados mínimos.
- `supabase/migrations/20261021_v16_2_participation.sql`: tabela de solicitações com RLS e sem acesso direto à tabela; RPCs com checagem interna de conta ativa, aprovação de administrador e permissão para a auditoria exata.

A tabela de solicitações tem RLS habilitada **sem política de acesso direto, de propósito**. O acesso se dá exclusivamente pelas funções autorizadas. Avisos do advisor sobre `SECURITY DEFINER` refletem RPCs explicitamente protegidas por checagens internas, e requerem revisão adicional antes de produção; não devem ser ignorados automaticamente. Proteção contra senhas vazadas permanece desativada no painel de Auth (consultar https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Testes sem dados reais

- Parse JavaScript dos módulos alterados: aprovado.
- Mock de abertura de auditoria compartilhada e sincronização: apenas `sync_shared_audit` invocada, dono original mantido.
- Mock de troca de conta: sincronização de outro editor bloqueada.
- Mock de revogação: leitura negada.
- Inspeção SQL somente leitura: um registro de auditoria, 33 revisões, uma evidência, zero publicações e zero solicitações de participação antes do teste humano; seis funções de participação e índice único global presentes.

**Ainda pendentes de teste manual:** solicitação pela nova conta, aprovação pelo administrador, abertura da Sala 1 por participante, salvamento de uma alteração inofensiva e revogação, sempre após verificar backup e consentimento para editar a auditoria real. Não afirmar que estes passos já foram validados. Não realizar gravações na auditoria real de forma automatizada.

## Recuperação e limitações

- Não mudar `main`, `owner_id`, geometria do campus ou fotos existentes.
- Se surgir conflito de revisão 40001, preservar o rascunho e exigir resolução; nunca sobrescrever a versão remota silenciosamente.
- Auditorias compartilhadas requerem conexão para abertura e autorização; edição offline compartilhada não está validada.
- Inclusão de evidências por colaboradores está bloqueada até revisão do Storage e das permissões de metadados.
- A migração do Supabase permanece aplicada mesmo que a branch de testes seja descartada; qualquer reversão exige plano próprio e validação, sem remoção de dados.

## Envio para prévia

Em 2026-10-22 foi solicitado novo envio do commit pela branch de testes para acionar a integração GitHub → Vercel. Este registro é apenas documental e não altera a aplicação nem promove a produção. A implantação deve ser confirmada pelo SHA publicado na Vercel antes de qualquer promoção para o domínio principal.
