# V16.1 — Consulta pública, cadastro e aprovação

## Escopo

- **Visitante:** navega pelo mapa e consulta somente `published_audits` (resultados públicos sanitizados), sem login.
- **Solicitante:** cria uma conta pelo Supabase Auth; o gatilho `auth_users_create_pending_profile` registra `profiles.role=AUDITOR`, `active=false`, `review_status=PENDING`.
- **Auditor aprovado:** entra com a conta aprovada, cria/continua auditorias e sincroniza registros, sujeito ao RLS.
- **Administrador ativo:** consulta e aprova/recusa solicitações, revoga acessos e publica/retira resultados de auditorias **concluídas e sincronizadas**.

## Banco e integridade

Migração aplicada no projeto Supabase pessoal: `supabase/migrations/20261021_v16_1_access_requests.sql`.

A migração adiciona colunas de revisão aos perfis, gatilho de inscrição, duas funções de autorização, duas RPCs administrativas e políticas RLS restritivas. **Não recria tabelas, não migra auditorias, não apaga evidências e não altera o payload de auditorias.**

Apenas `public.admin_review_access_request(uuid, boolean)`, com verificação de admin no servidor, pode aprovar contas. Aprovação requer e-mail confirmado. Nenhum parâmetro vindo do cadastro determina a função administrativa. A política do banco impede acesso privado a contas inativas, mesmo se a interface for burlada.

## Publicação de auditorias

A listagem pública consulta exclusivamente `published_audits`; para detalhes, usa somente `public_payload`, sanitizado pelo banco (no v14 o conjunto contém iluminação, ar-condicionado, água/resíduos, condições ambientais e contagem de não conformidades). Não disponibiliza identificação pessoal, observações livres, fotos privadas ou `private_payload`.

O administrador usa a RPC existente `authorize_audit_publication` para publicar/retirar. Auditoria `IN_PROGRESS` nunca aparece como resultado público. **A auditoria atual do Mini Auditório está em andamento e não deve aparecer para visitantes até ser concluída, sincronizada e publicada.**

## Configuração do Auth

Verificar no painel Supabase, em Authentication, que cadastro por e-mail/senha e confirmação de e-mail estão habilitados. Conferir URLs permitidas de redirecionamento quando for usar a Preview e o domínio principal. Nenhuma chave secreta/service-role deve entrar no JavaScript.

## Cenários a validar no navegador (sem usar auditorias reais para testar gravação)

1. Visitante anônimo: abre Central de Auditorias e histórico, vê somente resultados publicados e nenhum botão de edição.
2. Conta nova: envia nome/e-mail/senha, confirma e-mail e entra; vê status aguardando aprovação, sem criar/sincronizar auditorias.
3. Administrador: faz login, encontra solicitação, aprova ou recusa/revoga; solicitações não são visíveis ao visitante nem ao auditor.
4. Auditor aprovado: entra e passa a ter ferramentas de coleta; auditorias reais permanecem intactas.
5. Auditor revogado: não consegue editar, ler dados privados ou sincronizar no servidor.
6. Auditoria sintética **concluída, sincronizada e revisada**: administrador publica; visitantes veem apenas `public_payload`; após retirada, resultado desaparece.
7. Celular e desktop: formulários, lista de solicitações e consulta pública responsivos.

**Limite offline:** um auditor já verificado pode continuar trabalhando até 24 horas offline no mesmo aparelho. A revogação entra em vigor no servidor imediatamente; dados offline não são sincronizados sem aprovação atual. Sem uma autorização anterior válida, não é permitido iniciar auditorias offline.

Não executar os passos de cadastro/publicação com contas ou auditorias reais sem intenção explícita. Código e banco foram verificados, mas testes autenticados completos no navegador ainda precisam ser confirmados.

## Complemento de segurança v16.1.2

A migração adicional `supabase/migrations/20261021_v16_1_2_harden_access.sql` foi aplicada com sucesso ao mesmo Supabase. Foram adicionadas políticas restritivas para INSERT em `audits` e `audit_revisions`, e para SELECT/INSERT de arquivos do bucket `audit-evidence`. Isso impede que uma conta autenticada, porém pendente ou revogada, contorne o bloqueio da interface por chamadas diretas à API.

A verificação posterior confirmou a presença dessas políticas e a preservação de 1 auditoria, 33 revisões, 1 evidência, 1 perfil e 0 publicações.

**Pendências de validação:** ainda não foi realizado um teste real ponta a ponta com e-mail novo confirmado e aprovação no navegador. O relatório de segurança do Supabase também recomenda ativar proteção contra senhas vazadas em Authentication; essa opção não foi alterada automaticamente.
