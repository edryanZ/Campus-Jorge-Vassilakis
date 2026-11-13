# Histórico de alterações

## 2026-11-13 — Primeira rodada: painel, navegação e acesso a auditorias

- Novo resumo abaixo do cabeçalho: energia, água, papel, auditorias e patrimônio. Sem inventar indicadores ou tombos: estados ainda não mensurados estão identificados.
- Mapa inteiro como visão inicial, travado por padrão em telas até 820px; opção explícita para explorar, retorno à visão geral, seletor de salas e detalhes em painel inferior.
- Corrigido o cálculo do foco da sala e a transformação do zoom sob a proporção real do SVG; limites de arrasto impedem perder o campus fora de vista.
- Consulta de auditorias e busca remota utilizam a sessão existente, evitando chamadas repetitivas desnecessárias ao Auth. Permissões continuam verificadas no Supabase e sob RLS.
- Central permite abrir diretamente o registro remoto autorizado selecionado, inclusive para administrador, sem precisar depender apenas do histórico genérico da sala.
- Tela de conta adiciona revalidação manual de permissões, com mensagens de erro sem apagar registros locais.
- Nenhuma alteração SQL, nenhuma publicação de auditoria, nenhuma modificação dos registros reais, nenhuma mudança na main ou deploy automático.
- Validação de login, políticas de leitura e desempenho percebido requer teste em navegador autenticado antes de publicação.


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

## 2026-11-11 — Revisão v16.3: acesso rápido, histórico completo e preservação de dados

- O botão de auditoria abre feedback imediato de carregamento e permite retomar o rascunho já armazenado no dispositivo sem aguardar toda a sequência de consultas remotas.
- Para iniciar uma auditoria nova, a consulta de ocupação ocorre paralelamente à busca do rascunho remoto, preservando as verificações de unicidade e participação.
- Removida a tentativa recorrente de executar a RPC ausente `resume_or_create_active_audit` no Supabase original; novas auditorias usam `sync_audit` e o índice único existente por ambiente.
- Login não espera upload de pendências; eventos de autenticação são tratados após o callback do SDK, evitando bloqueio da sessão; consultas de perfil simultâneas são compartilhadas, com cache positivo curto, revalidação explícita e timeout.
- Histórico e Central exibem primeiro dados locais; o servidor é consultado em segundo plano, sem mesclar automaticamente rascunhos ou apagar alterações locais. Histórico distingue versão local e revisão do Supabase.
- Consulta do IndexedDB otimizada com índices por ambiente e auditoria, incluindo recuperação após bloqueio de abertura em outra aba.
- Fechamento e troca de tela capturam alterações do formulário, aguardam gravação e preservam evidências pendentes.
- Renovado cache PWA e acrescentados testes de abertura, RLS, autorização, concorrência, histórico, documentos e preservação local.
- As auditorias reais no banco do campus não foram modificadas nesta rodada. As Salas 2 e 16 permaneciam na revisão 3, com apenas identificação sincronizada, na última verificação. Qualquer dado posterior deve ser conferido no dispositivo original.
- Acesso privado ao domínio de produção exige configuração de Deployment Protection na Vercel; renomear o domínio, isoladamente, não restringe o público.
- Validação com browser real, dispositivo e conta autorizada é exigida antes de considerar a recuperação dos dados concluída.
