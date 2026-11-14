# Regras de edição do mapa

O mapa é um **protótipo**: a representação não comprova por si só a posição, função ou existência oficial de um ambiente. Manter IDs permanentes e distinguir dado confirmado de posicionamento provisório.

Regras inegociáveis: não inserir Bloco J nem Sala 29; Salas 23, 24, 25 e 26 foram confirmadas, mas somente a Sala 25 tem função confirmada de Brinquedoteca; a Sala 30 permanece **não identificada** até confirmação documental ou em campo. Não criar lacunas como salas novas só por continuidade numérica.

Antes de modificar `campus-data.js` ou `app.js`, conferir os ambientes e os vínculos `environmentId`/`mapId` de `audit-data.js`. Mudança visual não deve trocar esses IDs. Diferenciar setores sem sala, banheiros e ambientes sem identificação.

Testar visualização geral, busca, seleção, zoom, travamento do mapa, desktop e celular. Alterações cartográficas não autorizam mudanças no formulário de auditoria.
