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

## Encerramento técnico automatizado — 29/10/2026

**Situação:** Supabase `ebzsxyxuezugfaumyorn` ativo, histórico e evidência originais preservados. Versão principal da Vercel mantida sem alteração; testes e correções apenas em `fix-auditoria-sincronizacao-v16-2`.

### Correções adicionais

- Recuperação offline de rascunhos **previamente autorizados nas últimas 24 horas**, mesmo com rede conectada mas Supabase indisponível. Não permite criar auditoria nova sem verificar a ocupação da sala.
- Download de auditoria remota usa decisão atômica no IndexedDB e nunca substitui alterações locais pendentes ou o contexto de edição de colaborador.
- Registros com estado `CONFLICT` são preservados; o sincronizador automático não os reenvia sem resolução.
- O RPC `sync_shared_audit` foi corrigido em `supabase/migrations/20261029_v16_2_shared_sync_confirmation.sql`. A confirmação de `sync_complete` ocorre após o gatilho de sanitização, somente quando as evidências estão completas. A segunda atualização produz uma revisão técnica adicional por sincronização compartilhada. O RPC foi atualizado sem modificar registros reais.
- O cliente não tenta sincronizar/dar pull de dados quando a autorização disponível é apenas a cacheada offline.
- PWA com cache `campus-auditoria-v16-2-6` para receber todos os módulos finais.

### Verificações reais somente leitura

- `anon` sem permissão direta de SELECT em `audits` e `audit_evidence`, nem EXECUTE nas RPCs compartilhadas; a consulta pública separada possui SELECT permitido.
- `sync_shared_audit` atualizada e EXECUTE de `anon` negado.
- Sanitização de publicação testada com registro fictício passado **somente como argumento SQL**: indicador de iluminação preservado; nome fictício do auditor, notas e fotografia excluídos do resultado.
- Contagens do banco após migração: **1 auditoria, revisão 33, 33 entradas de histórico, 1 evidência, 0 participantes**; sem alteração de dados reais.
- GitHub Actions: testes nativos Node 22 executados com sucesso em `https://github.com/edryanZ/Campus-Jorge-Vassilakis/actions/runs/40969306151`. A execução posterior ao presente fechamento deve ser confirmada por novo SHA.
- Avisos do Supabase ainda existentes: funções SECURITY DEFINER expostas a `authenticated` (exigem validação manual das autorizações, apesar de checagens explícitas), proteção de senhas vazadas desativada, índices/políticas com sugestões de performance. A tabela `audit_participation_requests` não possui policy direta por decisão de arquitetura: acesso apenas por RPC controlada.

### Testes que dependem da pessoa e do dispositivo

1. Acessar a **prévia** com conta autorizada; não iniciar como visitante anônimo.
2. Iniciar sala-piloto nova, informar alguns dados, fechar, atualizar, reabrir e conferir.
3. Anexar fotografia fictícia ou autorizada, concluir e conferir indicador de sincronização.
4. Desligar conexão no celular durante edição já autorizada, salvar localmente e recuperar após retorno da rede.
5. Caso exista segunda conta de auditor aprovada, testar pedido/aprovação/revogação e duas edições concorrentes, sem alterar a Sala 1 real.
6. Somente depois dos testes decidir sobre promoção ao domínio principal.

**Limitação honesta:** não houve login real de duas contas, nem ensaio de câmera/IndexedDB/Storage no navegador do usuário, e não foi feita uma auditoria ambiental real automaticamente.
