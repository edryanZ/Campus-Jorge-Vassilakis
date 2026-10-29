# Histórico de alterações

## 2026-10-28 — Revisão v16.2.4: proteção de salvamento, sincronização e evidências

- Nova branch isolada `fix-auditoria-sincronizacao-v16-2`; `main` e o domínio principal não promovidos.
- Corrigido o retorno prematuro de sucesso de operações de escrita do IndexedDB.
- Adicionada persistência atômica de confirmações remotas, preservando edições locais posteriores.
- Corrigida substituição do formulário por respostas antigas de sincronização e reforçado o aviso de falha de armazenamento.
- Corrigida a confirmação de vínculo de fotografias e o tratamento de falha ao concluir uma auditoria.
- Atualizado o cache do service worker para `campus-auditoria-v16-2-4`.
- Política `audit_evidence_insert_owner` corrigida no Supabase original para verificar o identificador da evidência, e não o da auditoria.
- Auditoria real e evidência anterior preservadas: um registro, 33 revisões e uma evidência após a mudança.
- Testes simulados de armazenamento e sincronização (responsável e participante) aprovados; teste humano ponta a ponta continua obrigatório.

Ver: `docs/revisao-sincronizacao-v16-2-2026-10-28.md`.

> Esta entrada foi criada nesta branch para registrar mudanças auditáveis; versões anteriores permanecem documentadas no README e nos relatórios existentes.

## 2026-10-29 — Continuação da revisão v16.2

- Não conformidades agora são salvas ao registrar, com descrição obrigatória e limpeza dos campos.
- Datas e horários de campo usam o relógio local; campos ambientais de medição aceitam decimais.
- Operações de salvamento são serializadas; fechar não ignora uma edição pendente.
- Troca de contas oculta o editor e a Central de Auditorias da conta anterior.
- Evidências pendentes são aguardadas antes da conclusão, do fechamento e da saída.
- Testes de regressão adicionados em `tests/auditoria-v16-2.test.cjs`; seis verificações executadas em ambiente de teste JS compatível.
- Service worker atualizado para `v16-2-5`; `main` e dados da Sala 1 preservados.

Relatório complementar: `docs/revisao-sincronizacao-v16-2-2026-10-28.md`.

## 2026-10-29 — Segurança adicional, recuperação offline e regressões

- Pull remoto preserva atomicamente rascunhos pendentes e a identidade de colaboradores.
- Registros com estado `CONFLICT` deixam de ser enviados automaticamente.
- Continuação offline com autorização recente durante indisponibilidade do Supabase, sem criar novas auditorias sem validação do servidor.
- RPC de participação compartilhada corrigida para sinalizar `sync_complete` somente após checagem de evidências; revisão técnica adicional registrada pelo trigger.
- `tests/auditoria-sync-policies.test.cjs` adicionado; GitHub Actions Node 22 configurado apenas na branch de correções.
- Cache atualizado para v16.2.6.
- Proteções testadas com dados fictícios, sem mutação da Sala 1 real. Ver relatório de revisão.
