# Mapa interativo – Campus Jorge Vassilakis (main v16.3; branch de testes v16.5.2)

Mapa estático e interativo em HTML, CSS, JavaScript e SVG, criado com base na planta de referência e nas informações confirmadas do Campus Jorge Vassilakis.

## Como abrir

1. Mantenha todos os arquivos e pastas do projeto em seus caminhos originais.
2. Abra `index.html` no navegador.

Para evitar limitações do navegador durante o desenvolvimento, também é possível executar um servidor local:

```bash
python -m http.server 8000
```

Depois acesse `http://localhost:8000`.

O projeto não exige instalação de dependências nem processo de compilação. A biblioteca `supabase-js` está fixada na versão `2.117.3` por CDN e é armazenada pelo service worker após o primeiro carregamento bem-sucedido.

## Primeiras entregas do painel ambiental e patrimônio (branch de testes)

A faixa de indicadores mostra energia, água, papel, auditorias e patrimônio. Para contas aprovadas, os números de lâmpadas LED e fluorescentes, os registros de instalações hidráulicas e a quantidade de ambientes auditados vêm apenas do armazenamento **local da conta autorizada**, sem representar o total oficial do campus. Isso não equivale a consumo medido nem a nota de sustentabilidade. Papel requer levantamento por setor e metodologia aprovada.

O painel **Patrimônio** oferece cadastro auxiliar de tombos existentes (etiqueta, descrição, localização, estado e observações). Os registros ficam somente no IndexedDB deste navegador e nesta conta, sem comunicação com o patrimônio oficial nem sincronização. Atribuição de tombo oficial, importação institucional e edição de bens permanecem futuras. É possível exportar um CSV para conferência e cópia de segurança deste dispositivo, sem sincronizar com a UNIR. Guarde uma cópia externa dos dados relevantes até que exista mecanismo institucional validado.

O service worker usa cache v16.4 e inclui os novos módulos, evitando arquivos antigos após atualização. O mapa no celular abre com a planta enquadrada e travada; a movimentação pode ser habilitada pelo usuário. Testes de acesso real, visualização mobile e políticas remotas ainda são necessários antes da publicação.

## Histórico: segurança e sincronização v15

A auditoria só recebe `SYNCED` depois que a revisão do PostgreSQL, cada objeto do Storage, o metadado com SHA-256 e a função `finalize_audit_sync` são confirmados. Falhas parciais mantêm blobs no IndexedDB e produzem `PENDING` ou `ERROR`. O caminho remoto é determinístico, evitando duplicação em retentativas.

A v15 separa cópias `AUDIT-RECOVERY-*` dos rascunhos ativos sem apagar ou regravar registros legados. A retomada local usa proprietário e ambiente, aberturas concorrentes compartilham a mesma operação e o IndexedDB recusa um segundo rascunho normal da mesma chave. O autosave local é imediato e independente; a rede usa debounce, lock lógico e tentativas limitadas.

Conflitos de revisão (`40001`) ou de identidade ativa (`23505` no índice específico) geram snapshots no store local `conflicts`, com as duas versões e manifesto das evidências. Os Blobs continuam no store `evidence` e nunca são renomeados ou apagados automaticamente.

Para atualizar a v14, aplique somente `supabase/migrations/202610140001_v15_resume_active_audit.sql`, depois de concluir e verificar os backups. Não reaplique nem recrie tabelas. Instalações novas usam `schema.sql`, `rls.sql`, a migração v14 e depois a migração v15. A migração v15 foi preparada, mas não executada neste pacote.

## Recursos já incluídos

- planta desenhada em SVG;
- busca por sala, bloco ou setor;
- filtros por categoria;
- detalhes ao clicar;
- troca entre pavimento inferior e superior do Bloco K;
- zoom e arraste;
- rota esquemática a partir da entrada;
- layout adaptável para computador e celular;
- impressão;
- mapa sem framework ou etapa de compilação;
- autosave local-first, fila de sincronização e estados visíveis;
- autenticação e integração Supabase preparada;
- Storage privado para evidências e histórico de revisões no PostgreSQL;
- service worker para reabertura offline depois da primeira abertura online.

## Estado da integração remota

**Nesta branch de prévia v16.1**, o arquivo `supabase-config.js` já aponta para o projeto Supabase existente usando URL e chave pública (**Publishable**). Não recrie as tabelas nem reaplique as migrações antigas no banco atual. Para instalações novas e independentes, consulte `docs/SUPABASE.md`. O funcionamento real do cadastro e das autorizações ainda exige validação completa no navegador.

Nunca use `service_role`, `sb_secret_` ou senha do banco no frontend. Sem configuração, a auditoria continua funcionando localmente e mostra claramente que os dados ainda não foram sincronizados.

## Controles do mapa

- Use a busca para localizar salas, blocos ou setores.
- Use os filtros laterais para destacar locais por categoria.
- Clique em uma sala ou estrutura para abrir o painel de detalhes.
- Use os botões `+` e `−` ou a roda do mouse para controlar o zoom.
- Arraste o mapa para movimentar a visualização.
- Use o seletor de pavimento para alternar entre os pisos inferior e superior do Bloco K.
- Use o botão **Centralizar** para restaurar a visualização.

## Onde alterar os dados

As informações confirmadas do campus ficam centralizadas no arquivo `campus-data.js`, incluindo:

- `blocks`;
- `floorRooms`;
- `externalStructures`;
- categorias, cores e descrições;
- validação interna dos dados.

Responsabilidades dos arquivos principais:

- `campus-data.js`: dados confirmados, categorias, cores, descrições, pavimentos e posições esquemáticas dos blocos;
- `index.html`: estrutura da interface e desenho SVG das áreas externas, estacionamento, vias, calçadas e campo;
- `styles.css`: apresentação visual, legenda, responsividade e diferenciação dos tipos de superfície;
- `app.js`: renderização das salas e blocos, busca, filtros, seleção, painel, rotas, zoom, arraste e troca de pavimentos.

## Observação

O mapa segue a disposição espacial confirmada na planta fornecida, mas continua esquemático. As posições, proporções e dimensões exibidas não representam medidas arquitetônicas reais. Uma representação métrica exigiria planta técnica ou levantamento específico do campus.

Esta versão registra uma etapa intermediária de calibração. O Bloco B foi orientado horizontalmente, o Bloco G e o Auditório Grande receberam ajustes pontuais, e os blocos E e I permanecem em posições provisórias ao lado do Campo de Futebol. Essas posições ainda não representam a organização definitiva do campus.

Um novo refino incremental reorganizou os ambientes do Bloco B em uma única sequência horizontal, reduziu visualmente o Bloco G, conectou melhor as vias próximas ao Estacionamento de Servidores e ao Bloco K, reduziu o Campo de Futebol e aproximou o Bloco K da via à esquerda. A planta permanece em calibração e essas relações continuam esquemáticas.

O ajuste incremental seguinte refinou a legibilidade: os WCs do Bloco B passaram para a esquerda da Sala 5 em uma única sequência horizontal alinhada à região do Bebedouro; os WCs do Bloco G receberam rótulos simplificados; e o Bloco K foi aproximado novamente da via vertical. A interpretação horizontal anterior do Bloco H foi rejeitada e sua geometria vertical foi restaurada. A Sala 35 continua sendo o Auditório Grande, sem divisão ou criação de outro ambiente. A planta continua em calibração.

Na calibração incremental seguinte, o Auditório Grande foi mantido vertical e posicionado ao lado da Sala 34, com o rótulo `BLOCO H` temporariamente oculto. Os blocos A e F tiveram somente suas larguras horizontais ajustadas para acompanhar a proporção visual de C e D, e o Bloco C foi alinhado verticalmente à faixa do Estacionamento de Servidores. A planta permanece esquemática e em calibração.

Um novo ajuste fino reduziu e aproximou o Bebedouro externo do Bloco B, aproximou o Auditório Grande da Sala 34, encurtou pontualmente a via próxima ao Bloco D e restaurou a orientação vertical da Portaria e de seus textos. Essas alterações são apenas de legibilidade e posicionamento esquemático; a calibração da planta continua em andamento.

Na revisão seguinte, os quatro trechos de vias não pavimentadas foram reposicionados para coincidir com os retângulos vermelhos da imagem de revisão: duas faixas horizontais superiores contínuas, uma ligação vertical e a faixa horizontal inferior. O Bloco E passou a conter somente WC Masculino e WC Feminino; seu Bebedouro foi removido conforme a estrutura revisada.

A etapa de conclusão das marcações coloridas reposicionou o Bloco I na área amarela, refinou o Auditório junto à Sala 34, alinhou o Bloco B à área azul e reduziu novamente seu Bebedouro externo. Também foram representados os Pés de jambo e ajustados Depósito Antigo, SAFs, Viveiro, Portaria e o fluxo lateral. O mapa continua esquemático e sujeito a calibração posterior.

Na revisão seguinte, o Bloco E foi reposicionado para a área roxa indicada pelo usuário, mantendo somente WC Masculino e WC Feminino e com o rótulo `BLOCO E` temporariamente oculto. As quatro ruas permaneceram nas coordenadas aprovadas; apenas a ordem visual das calçadas foi corrigida para impedir que elas cortem as vias nos cruzamentos.

## Fundação de auditoria ambiental

O mapa agora oferece uma base local, mobile-first, para iniciar, pausar, retomar e concluir auditorias ambientais por ambiente. A planta, ainda esquemática e em calibração, não teve sua geometria alterada por essa integração.

Ao selecionar um ambiente auditável, o painel apresenta `Iniciar auditoria` e `Histórico`. O formulário é dividido em nove etapas: identificação, iluminação, climatização, equipamentos, água e resíduos, condições ambientais, infraestrutura, não conformidades/evidências e revisão. Os campos conhecidos do ambiente são preenchidos pelo cadastro, sem nova digitação.

Os rascunhos e históricos ficam primeiro no IndexedDB do próprio navegador. Alterações importantes disparam salvamento automático e a interface informa o estado local e remoto separadamente. O fluxo funciona sem conexão; quando o Supabase estiver configurado, a fila tenta sincronizar após o retorno da rede. Limpar os dados do navegador remove registros que ainda não tenham sido confirmados remotamente.

Arquivos da auditoria:

- `audit-data.js`: identificadores ambientais permanentes, enumerações, etapas e adaptação dos ambientes confirmados;
- `audit-storage.js`: repositório local IndexedDB para auditorias e evidências;
- `audit-remote.js`: autenticação, sincronização, recuperação, conflitos e evidências remotas;
- `supabase-config.js`: configuração pública do cliente;
- `supabase/`: esquema e políticas RLS/Storage;
- `audit-app.js`: formulário mobile, autosave, retomada, conclusão e histórico;
- `docs/auditoria-ambiental.md`: arquitetura, privacidade, limitações e evolução prevista.

O Bloco K permanece visível e interativo no mapa, porém não está habilitado para coleta ambiental nesta etapa porque seu levantamento ainda é incompleto. A autenticação e o Supabase estão preparados, mas dependem da configuração externa descrita em `docs/SUPABASE.md`. Nenhum dado pessoal, rascunho ou evidência é publicado; somente uma cópia sanitizada de auditoria concluída e autorizada pode entrar em `published_audits`.

A interface de auditoria oferece o mesmo fluxo funcional em desktop, tablet e celular. No desktop, as ações para iniciar e consultar o histórico aparecem diretamente no topo do painel do ambiente, e o formulário abre centralizado sobre o mapa, com rolagem interna. Em telas menores, o formulário mantém o comportamento de painel inferior mobile já existente.

O painel de detalhes permanece como terceira coluna visível nas larguras de desktop e tablet acima de 820px. Assim, clicar em uma sala sempre apresenta suas informações e os acessos à auditoria sem depender de um drawer inicialmente deslocado para fora da viewport. O drawer lateral continua sendo usado apenas em celular.

A interação diferencia seleção e movimentação: pressionar diretamente uma sala ou outra estrutura interativa não inicia o pan. Em áreas livres, o mapa só começa a se mover depois de um deslocamento mínimo do ponteiro, preservando cliques naturais de mouse e toque.

Os corredores de circulação interna já existentes no SVG são representados em cinza-claro, com borda discreta, para distingui-los do fundo verde, das vias marrons e dos estacionamentos. Os seis trechos confirmados formam uma camada passiva que não captura eventos nem implica novas conexões cartográficas; três faixas locais tiveram somente o encaixe ajustado durante a organização dos blocos.

A calibração visual seguinte corrigiu a faixa lateral da Portaria: ela passou a ser apresentada como via de circulação de motos, carros e bicicletas, sem marcações de vagas, com entrada pela direita, dois retornos e saída pela esquerda. O Auditório Grande, o Bloco I e os WCs do Bloco E foram reposicionados conforme as marcações rosa, amarela e verde. O título do Bloco K foi deslocado para a lateral direita para reduzir colisões, sem modificar seus pavimentos.

Também foi incluído o conjunto confirmado das salas 23, 24, 25 e 26 e seus dois WCs na área azul. A Sala 25 é a Brinquedoteca e possui maior largura visual. A função das salas 23, 24 e 26 e a identificação oficial do bloco ainda não foram informadas; por isso, permanecem explicitamente pendentes e nenhum Bloco J foi criado.

O conjunto 23–26 foi posteriormente reduzido e reposicionado no eixo dos blocos D e F, entre essas duas edificações, mantendo uma única sequência horizontal. Um Bebedouro próprio, externo e selecionável foi adicionado ao lado do conjunto. Para liberar essa composição, o Bloco C recebeu apenas um pequeno deslocamento para baixo, o Bloco D foi aproximado do novo conjunto e a faixa dos Pés de jambo foi reduzida sem perder sua identificação. As relações continuam esquemáticas e não representam medidas reais.

No refinamento seguinte, o contorno do conjunto 23–26 passou a usar as mesmas dimensões externas do Bloco B (`320 × 62` unidades esquemáticas), preservando a ordem interna e a largura maior da Sala 25. Seu Bebedouro foi movido para a esquerda, mantendo o mesmo ID. As junções da via vertical com as faixas horizontais receberam acabamento contínuo, sem mudança de percurso, e a faixa vertical do nome do Bloco K foi alinhada ao topo e à base da área visual do prédio.

## Organização e governança

O arquivo `AGENTS.md` reúne as regras-mãe para qualquer agente que trabalhe no repositório. Ele exige diagnóstico prévio, separação entre mapa e auditoria, preservação dos IDs, testes, atualização documental e autorização explícita para operações Git ou publicação.

A documentação técnica está dividida por responsabilidade:

- `docs/ARQUITETURA.md`: componentes e fluxo entre mapa, auditoria e IndexedDB;
- `docs/REGRAS-MAPA.md`: proteção dos dados e da geometria cartográfica;
- `docs/REGRAS-AUDITORIA.md`: integridade dos registros ambientais e do histórico;
- `docs/REGRAS-INTERFACE.md`: requisitos de acessibilidade e responsividade;
- `docs/DADOS-E-EVIDENCIAS.md`: origem, classificação, privacidade e persistência dos dados;
- `docs/METODOLOGIA-TCC.md`: pontos que ainda dependem de definição acadêmica;
- `docs/ROADMAP-TCC.md`: recursos implementados, preparados e futuros.

Essas regras apoiam o desenvolvimento do TCC sem transformar lacunas de informação ou posições esquemáticas em fatos oficiais.

## V16.1 — consulta pública e solicitação de acesso

Esta versão está na branch de Preview `preview-v16-1-acessos`, não substitui a `main`.

- Visitantes podem consultar **somente resultados concluídos e publicados**, sem entrar.
- Novos cadastros ficam **pendentes** e não podem criar/sincronizar auditorias.
- O administrador ativo acessa **Minha conta > Gerenciar acessos**, aprova, recusa ou revoga contas.
- O administrador pode publicar ou retirar resultados na **Central de Auditorias**, após conclusão e sincronização.
- Dados privados e evidências não são expostos na consulta pública; registros locais preexistentes são preservados.

Veja o [roteiro de configuração e validação](docs/v16-1-acessos-validacao.md) e a [migração SQL da v16.1](supabase/migrations/20261021_v16_1_access_requests.sql).


## Atualização operacional — 11/11/2026

- Auditorias existentes no navegador são abertas primeiro; histórico e Central exibem cópias locais rapidamente e consultam o Supabase em segundo plano.
- Login não aguarda a sincronização pendente; confira os indicadores de **salvo localmente** e **sincronizado com o Supabase**, que não são equivalentes.
- Os botões **Ver dados preenchidos** e **Ver dados no Supabase** permitem comparar versões sem sobrescrever o IndexedDB.
- Em caso de conflito, erro ou dados incompletos, preserve o navegador original e **não limpe o armazenamento do site**. Não crie outro rascunho para a mesma sala.
- A proteção de acesso público ao domínio deve ser configurada na Vercel em **Security → Deployment Protection → Vercel Authentication → All Deployments**; apenas alterar o nome do site não impede acessos externos.
- A aplicação não elimina automaticamente registros, fotos ou dados reais em revisões de interface. Testes de ponta a ponta com conta autorizada continuam necessários antes de declarar a produção validada.

As correções foram preparadas e testadas na branch `fix-auditoria-sincronizacao-v16-2`. Consulte `docs/historico-alteracoes.md` para detalhes.


## Proteção da auditoria — v16.5 (branch de testes)

- Antes de concluir, o auditor precisa confirmar explicitamente cada uma das sete etapas temáticas, preencher seu nome, data e conclusão. Itens sem avaliação devem ser justificados em Observações; rascunhos antigos continuam disponíveis para revisão.
- A aplicação tenta gravar imediatamente no IndexedDB quando a página perde visibilidade ou é suspensa. Quando há alterações ou fotografias pendentes, solicita aviso ao sair, dentro das limitações do navegador. Isso **não** substitui o backup.
- Em **Minha conta**, uma conta aprovada pode exportar um **ZIP com auditorias, revisões locais em conflito e arquivos de fotografias disponíveis** neste dispositivo. Se um arquivo fotográfico estiver ausente, o aviso informa que o backup não é completo. ZIP é confidencial e sem criptografia; guarde-o em lugar seguro. A restauração ainda exige procedimento manual e não deve substituir automaticamente o servidor.
- A importação automática do Supabase é limitada às auditorias do proprietário autenticado. Administradores podem consultar outros usuários na Central, sem fazer cópias locais indiscriminadas.
- **Retificação de RLS:** políticas v16.1 verificadas são RESTRICTIVE e restringem o acesso por proprietário ou ADMIN. O diagnóstico que sugeria exposição generalizada foi corrigido e o SQL de remoção cancelado. Nenhuma política do banco de produção foi alterada.
- O domínio de produção, a câmera de um aparelho real e as credenciais do administrador ainda precisam de teste antes da publicação.

## Revisão de estabilidade e acessibilidade — 14/11/2026

Nesta branch de trabalho:
- o aplicativo evita salvar novamente quando não houve edição real no formulário, mas cria uma nova mutação ao mudar de etapa;
- buscas na Central têm debounce curto para funcionar melhor em celulares modestos;
- renovação automática de sessão não fecha o módulo auxiliar de patrimônio nem recarrega desnecessariamente as solicitações administrativas;
- controles de mapa e navegação por teclado ficaram mais claros, com respeito ao movimento reduzido;
- o Service Worker armazena só recursos identificados do aplicativo e remove exclusivamente caches anteriores desta PWA;
- a exportação legada sem fotos foi retirada do módulo de armazenamento. Use **Minha conta → Exportar backup de auditorias com fotos (ZIP)**, que é uma cópia local sensível, sem criptografia e sem restauração automática;
- ao verificar uma auditoria concluída, a data deve ser válida no calendário, além dos demais campos de conferência.

**Não alteramos os ambientes, IDs de auditoria, fotos, tabelas nem permissões do Supabase.** A segurança do servidor continua baseada nas políticas RLS vigentes. O projeto não foi publicado na `main`.

### Ensaios antes de liberar as correções

Faça testes em uma cópia/ambiente de ensaio, com conta aprovada: login, alteração de campo e salvamento local, navegação entre etapas, reabertura após fechar a aba, câmera e upload de evidência, exportação ZIP, conta com participação aprovada, atualização PWA offline e tela mobile/desktop. Não apague cookies ou armazenamento do dispositivo original onde estão os rascunhos reais. A prévia autenticada na Vercel ainda não foi confirmada nesta rodada.


## Rodada adicional de estabilidade — 14/11/2026

- Ao sincronizar, uma falha apenas na recuperação dos dados do servidor **não é confundida com falha dos envios já confirmados**. A Central informa separadamente a recuperação pendente.
- A abertura de uma sala descarta respostas atrasadas se a pessoa selecionou outra sala ou acessou outra tela enquanto a consulta ocorria, evitando exibir a auditoria do ambiente errado.
- A PWA armazena offline apenas as páginas e arquivos conhecidos. URLs de retorno do login contendo parâmetros como `?code=` não são gravadas no cache; páginas desconhecidas não são interceptadas.
- A bateria de testes de lógica e estrutura tem agora 57 cenários: 52 regressões existentes mais 5 específicos para troca de sala, sincronização parcial, sincronização simultânea e cache. Não são testes autenticados no navegador.

Não houve alteração de dados do banco, fotos, salas, identificadores nem publicação na `main`.
