# Regras das auditorias ambientais

Fluxo do protótipo: identificar o ambiente, consultar ocupação/autorização, criar ou reabrir rascunho, preencher dados, anexar evidências e revisar as etapas antes de concluir. Os registros privados não devem ser publicados automaticamente.

Os estados atuais incluem `DRAFT`, `IN_PROGRESS` e `COMPLETED`. Auditorias concluídas são tratadas como imutáveis no armazenamento local. Reabrir, corrigir ou criar versão posterior exige procedimento explícito e preservação de histórico.

A validação da conclusão exige identificação do auditor, data válida, conclusão geral e confirmação de revisão das seções previstas em `audit-validation.js`. Registro não avaliado deve ser justificado: jamais transformar ausência de medição em zero, suposição ou índice automático.

O proprietário mantém seus IDs e evidências; colaboração autorizada deve usar a RPC específica, com revisão e conflitos preservados. Não sobrescrever automaticamente uma cópia com `LOCAL_ONLY`, `PENDING`, `ERROR` ou `CONFLICT` por uma versão remota.

Antes de alterar a gravação, executar testes de fechamento, foto pendente, conclusão, reconexão, sincronização com falha e alternância de conta.
