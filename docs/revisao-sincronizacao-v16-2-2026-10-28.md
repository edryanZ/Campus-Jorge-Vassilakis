# Revisão técnica — salvamento, sincronização e evidências (28/10/2026)

## Escopo e isolamento

- Branch: `fix-auditoria-sincronizacao-v16-2`, baseada em `preview-v16-1-acessos`.
- Não houve alteração da branch `main`, do mapa, dos identificadores dos ambientes ou da auditoria real.
- Supabase efetivamente usado pelo site: `ebzsxyxuezugfaumyorn`.
- Após a restauração do banco, consulta de integridade: **1 auditoria, 33 revisões, 1 evidência, 0 solicitações de participação e 0 resultados publicados**.
- A versão principal da Vercel continuou no commit `35b9ac0` ao final das verificações; as correções estão apenas na branch isolada.

## Correções aplicadas na branch

1. `audit-storage.js`: escritas com `requestResult` só confirmam sucesso no `transaction.oncomplete`, e não apenas em `request.onsuccess`.
2. `audit-storage.js`: `saveRemoteAcknowledgment` compara, em transação atômica, a mutação enviada com a versão local atual. Respostas antigas preservam os dados novos, o estado pendente e avançam a revisão confirmada.
3. `audit-storage.js`: salvamentos locais não reduzem `serverRevision` já confirmado.
4. `audit-remote.js`: fluxo do responsável e de participantes usa confirmação atômica em todas as fases de sincronização, inclusive erro e finalização.
5. `audit-app.js`: grava um snapshot do formulário; se o usuário continuar digitando, reprograma o salvamento e não substitui o formulário com resposta de sincronização antiga.
6. `audit-app.js`: falhas de IndexedDB são mostradas; o modal não fecha normalmente se houver erro de gravação. Falha ao persistir conclusão mantém a auditoria aberta.
7. `audit-app.js`: não informa vínculo de fotografia como salvo antes de confirmar a gravação do registro.
8. `sw.js`: cache atualizado de `v16-2-3` para `v16-2-4`, permitindo receber os scripts corrigidos após nova implantação.

## Correção no Supabase original

Política `audit_evidence_insert_owner`: a condição para permitir inserção de evidência vinculada a uma auditoria `COMPLETED` verificava o ID da auditoria (`a.id`) no array JSON `evidenceIds`, em vez do ID da fotografia (`audit_evidence.id`). A política foi corrigida em 28/10/2026 e verificada por consulta de `pg_policies`. Arquivo correspondente: `supabase/migrations/20261028_v16_2_fix_completed_evidence_policy.sql`.

A alteração modifica somente a condição de RLS, sem atualizar nenhuma linha da tabela de auditorias ou de evidências. A checagem de proprietário e a política restritiva de pessoal autorizado continuam em vigor. Não foi realizado upload de fotografia de teste em produção.

## Testes executados sem alterações em dados reais

- Análise sintática de 9 módulos JS: aprovada na primeira execução da revisão (executar novamente a cada mudança posterior).
- Simulação de IndexedDB: gravar auditoria; chegada tardia de resposta do servidor; preservação de edição local mais recente; manutenção da revisão confirmada; confirmação legítima de edição atual: **4 cenários aprovados**.
- Simulação de sincronização do responsável: chegada de resposta antiga enquanto o usuário edita; dados novos e estado `PENDING` preservados: **aprovada**.
- Simulação de participação compartilhada: edição autorizada preservando proprietário, resposta atrasada sem sobrescrever nova edição e revogação de autorização impedindo envio: **3 cenários aprovados**.
- Supabase real: estado `ACTIVE_HEALTHY` e contagens de dados confirmadas; política de evidências confirmada por consulta somente leitura.

## Avisos ainda a investigar

O advisor de segurança apontou funções `SECURITY DEFINER` executáveis por usuários autenticados. Algumas RPCs precisam dessa configuração e contêm verificações explícitas, mas isso **não equivale a um teste de invasão**. Apareceu também aviso de proteção de senhas vazadas desativada. Advisors de performance registraram índices não utilizados, FKs sem índices e políticas permissivas sobrepostas. Não modificar essas políticas automaticamente sem analisar dependências.

## Validação manual ainda indispensável

1. Entrar no site com uma **conta realmente autorizada** (não entrar como visitante para criar auditoria).
2. Iniciar uma nova sala-piloto, digitar rapidamente, fechar e reabrir; validar todos os campos.
3. Salvar e confirmar no Supabase o mesmo ID de auditoria e o número de revisão.
4. Anexar uma imagem de teste identificada como `DADO FICTÍCIO PARA TESTE`, confirmar upload e verificação de metadados; depois concluir a auditoria-piloto.
5. Com segundo usuário aprovado, solicitar participação, aprovar, editar, provocar conflito de revisão e revogar; comprovar que a edição indevida é negada.
6. Simular queda de internet, salvar localmente e sincronizar após retorno.
7. Validar a prévia no celular; só promover após testes aprovados. Não alterar Sala 1 real para testes.

**Status final desta revisão: correções aplicadas na branch e no controle de evidências do banco; testes simulados aprovados; validação completa de ponta a ponta ainda pendente.**

## Continuação de 29/10/2026 — revisão funcional

- Corrigida a inclusão de não conformidades: agora requer descrição, marca o registro como modificado, solicita salvamento e limpa os campos de inclusão.
- Inicialização dos campos de data e horário ajustada ao relógio local do dispositivo; timestamps internos de sincronização permanecem UTC.
- Campos de medição ambiental aceitam decimais (`step="any"`); campos de contagem mantêm inteiros não negativos.
- Salvamento local em fila para serializar escritas iniciadas simultaneamente; fechamento do editor verifica persistência completa.
- Ao sair ou trocar de conta, o editor privado é salvo/ocultado e a Central de Auditorias limpa os registros privados anteriores.
- Salvamento de evidência protegido contra seleção simultânea; os comandos Concluir, Fechar e Sair aguardam gravações de fotografias ainda em andamento.
- Service worker: nome de cache atualizado para `campus-auditoria-v16-2-5`.
- Adicionado `tests/auditoria-v16-2.test.cjs` (Node nativo, sem dependências de terceiros) para verificar sintaxe, elementos HTML, data/hora local, campos numéricos, não conformidades e espera por evidências.
- **Execução de casos de teste:** 6/6 passaram em um executor JavaScript compatível com os testes Node; também foram feitas simulações isoladas de filas de salvamento e concorrência. O comando `node --test tests/auditoria-v16-2.test.cjs` ainda deve ser repetido num ambiente Node real/CI.
- A prévia da Vercel continuou separada de `main`. Nenhuma alteração da Sala 1 ou upload de fotografia real foi executado.

**Pendente:** ensaio real autenticado no navegador, especialmente dois auditores, modo offline e prova de upload/download de imagem. Avisos de segurança/performance do Supabase ainda requerem avaliação específica antes de produção.
