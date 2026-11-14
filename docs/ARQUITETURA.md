# Arquitetura do protótipo

O sistema do Campus Jorge Vassilakis é uma aplicação estática HTML/CSS/JavaScript, com mapa SVG, PWA opcional e Supabase para autenticação/sincronização. Não depende de build para abrir a interface.

- `index.html`: estrutura e ordem de carregamento dos módulos.
- `campus-data.js`, `app.js`: representação e interação com o mapa (não devem atribuir localizações não confirmadas).
- `audit-data.js`, `audit-validation.js`, `audit-app.js`: formulário, navegação e revisão das coletas.
- `audit-storage.js`: IndexedDB local, versão 3, com stores `audits`, `evidence`, `meta`, `conflicts`.
- `audit-sync-core.js`, `audit-remote.js`: mutações, conflitos, sessões e sincronização Supabase.
- `audit-backup.js`: ZIP local com manifesto e arquivos de evidências disponíveis (não é restaurador automático).
- `campus-insights.js`, `patrimonio.js`: indicadores exploratórios e inventário auxiliar.
- `sw.js`: cache restrito aos recursos públicos estáticos do aplicativo.

O controle de acesso efetivo é feito pelas RLS e funções SQL verificadas no servidor; esconder botões no frontend não garante autorização. Mudanças de esquema ou RPC exigem testes de ADMIN, AUDITOR e participação compartilhada. Não executar scripts SQL históricos cancelados.

Consulte `README.md`, `docs/historico-alteracoes.md` e `docs/seguranca/revisao-20261114.md`.
