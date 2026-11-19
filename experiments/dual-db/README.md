# Ensaio isolado — Supabase + Firebase (19/11/2026)

## Objetivo
**NÃO é uma migração.** Manter Supabase como banco em uso e comparar, usando *somente* dados inteiramente fictícios, se o Firestore grava e devolve corretamente os mesmos campos.

Este diretório não é importado por `index.html`, `audit-app.js` ou `audit-remote.js`. O teste não altera login, perfil ADMIN, RLS de `audits`, fotografias, patrimônio, publicações ou deploys. Não criar GitHub Actions.

## Fase 1 — validação de código (já preparada)
- `compare.js`: duas interfaces `write/read`, comparação campo a campo e medição de latência; rejeita IDs reais e amostras sem `testOnly: true` e os marcadores `DADO FICTÍCIO PARA TESTE`.
- `tests/dual-db-comparison.test.cjs`: simulação de sucesso, divergência, indisponibilidade de um banco, escopo restrito e troca de usuário.
- Rodar localmente com Node: `node --test tests/dual-db-comparison.test.cjs`.
- Dados simulados não demonstram disponibilidade real do Supabase nem do Firebase.

## Testar os dois ao mesmo tempo na página isolada

Foi adicionada a página `experiments/dual-db/index.html` e o controlador `live-test.mjs`.
**Somente depois de configurar os dois provedores**, ela permite um teste real de escrita/leitura simultânea.

1. Conectar/criar **Firebase de testes** e habilitar Firebase Authentication (E-mail/senha), usuário de teste com e-mail verificado e Firestore.
2. Revisar e aplicar apenas no projeto Firebase de testes as regras `firestore-rules.REVIEW-ONLY.fragment`, integrando-as às regras existentes. Testar bloqueio de usuários diferentes.
3. Revisar o script `supabase-table.REVIEW-ONLY.sql` com o responsável pelo Supabase atual. A tabela `dual_db_trial_records` é **nova e isolada**, com RLS por usuário; não execute o SQL sem aprovar a alteração e validar segurança. Nenhuma tabela de auditoria real precisa mudar.
4. Hospedar/abrir a **prévia da branch**, no caminho `/experiments/dual-db/`. Não vincular ao menu principal, não adicionar à PWA ou à `main`.
5. Entrar com conta autorizada no Supabase e com conta verificada no Firebase de testes; colar só a configuração Web **pública** do Firebase (não colar chave de servidor nem compartilhar senhas).
6. Confirmar que são bancos de teste e tocar **Testar os dois bancos juntos**. Os dois escrevem o mesmo registro fictício em paralelo e relêem do servidor. O módulo de Firestore exige `getDocFromServer`, que não aceita o cache local como confirmação.
7. A tela mostra `VERIFIED`, `MISMATCH` ou `ERROR` para cada serviço; somente declara sucesso quando os dois devolvem as respostas completas. Uma falha não impede obter o resultado do outro.

Notas de segurança: o login Supabase desta tela usa sessão de memória (não substitui o login do site). O Firebase usa persistência de sessão do navegador, não token de servidor. As duas contas são independentes. O teste não consulta `audits`, não abre rascunhos, não envia fotos e não roda no site oficial. O documento de teste usa ID fixo por conta para não criar vários registros.

O código usa os SDKs Firebase v13.3.0 via CDN e Supabase v2.117.3, ambos fixados, conforme as orientações oficiais sobre o uso modular do SDK no navegador.

## Fase 2 — teste real, ainda NÃO executado
1. Instalar/conectar o plugin Firebase ou criar um **projeto Firebase exclusivo de testes**, habilitando Firestore e autenticação de uma conta verificada. Não habilitar Blaze/serviços pagos sem aprovação.
2. Revisar `firestore-rules.REVIEW-ONLY.fragment`. É apenas **um fragmento**: unir às regras existentes do projeto de testes, sem substituir regras globais. Conferir negação para anônimo e usuários diferentes.
3. Revisar o SQL `supabase-table.REVIEW-ONLY.sql` com quem administra o Supabase. Ele é apenas uma proposta para uma **tabela segregada**; não executar automaticamente em produção. A revisão precisa conferir RLS, grants, limites e ausência de impacto no banco atual.
4. Executar `compare(...)` em um runner privado (com duas autenticações válidas, SDKs disponíveis), fornecendo os adaptadores `supabaseAdapter(client)` e `firebaseAdapter({ db, auth, doc, setDoc, getDoc })` e um ID `CJV-TEST-...`. Nenhum segredo de servidor em frontend ou no GitHub.
5. Comparar resultados: `VERIFIED` só se todos os campos retornarem idênticos; `MISMATCH` se diferentes e `ERROR` se algum serviço falhar. Registrar latência de escrita/leitura e checar comportamento ao reconectar.
6. Somente se os ensaios reais funcionarem avaliar **cópia de backup de auditorias reais** com autorização explícita, políticas de privacidade, versionamento e recuperação testada.

## Restrições
- Nunca escrever em `public.audits`, `public.audit_revisions`, `public.profiles` nem em buckets de fotos de auditoria real.
- Nunca copiar `service_role`, token de administrador, credencial Firebase Admin ou chave privada para JS, documentação, commit ou captura de tela.
- As contas de Supabase Auth e Firebase Auth são independentes; ser ADMIN no Supabase **não** concede acesso ao Firebase.
- Não usar o modo aberto das regras Firestore para testar. Testar autenticação e regras, inclusive leitura negada por outro usuário.
- A consulta e o teste real dependem da configuração e da conexão do Firebase. Até lá, o sistema atual não é alterado.
- R2 permanece opcional para etapa futura de backup versionado; não é necessário contratar nem configurar agora.
