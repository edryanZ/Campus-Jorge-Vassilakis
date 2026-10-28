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
