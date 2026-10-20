# Regras-mãe do projeto

Antes de alterar qualquer arquivo, analise o projeto, identifique se a tarefa pertence ao mapa, à auditoria ou à interface e leia a documentação correspondente em `docs/`.

## Regras obrigatórias

- Não invente informações do campus nem preencha lacunas de numeração.
- Não crie Bloco J nem Sala 29. As salas 23, 24, 25 e 26 foram confirmadas posteriormente; somente a Sala 25 tem função confirmada como Brinquedoteca.
- Preserve a Sala 30 como não identificada enquanto não houver confirmação.
- Tarefas de auditoria não autorizam mudanças no mapa; tarefas cartográficas não autorizam mudanças na auditoria sem necessidade comprovada.
- Preserve IDs permanentes e nunca trate posição provisória como localização oficial.
- Diferencie dado real/coletado, calculado, fictício e não informado. Testes fictícios devem usar `DADO FICTÍCIO PARA TESTE`.
- Não crie classificação ambiental automática sem metodologia aprovada.
- Execute testes relevantes, atualize a documentação e registre mudanças em `docs/historico-alteracoes.md`.
- Em entregas aprovadas, gere ZIP novo e versionado; não inclua caches, dependências, capturas ou dados de teste.
- Não faça commit, push, merge, PR, deploy ou publicação sem autorização explícita.

## Documentos obrigatórios por escopo

- Arquitetura: `docs/ARQUITETURA.md`
- Mapa: `docs/REGRAS-MAPA.md`
- Auditoria: `docs/REGRAS-AUDITORIA.md`
- Interface: `docs/REGRAS-INTERFACE.md`
- Dados e evidências: `docs/DADOS-E-EVIDENCIAS.md`
- Metodologia: `docs/METODOLOGIA-TCC.md`
- Planejamento: `docs/ROADMAP-TCC.md`

Leia também `README.md`, `docs/estrutura-campus.md` e `docs/auditoria-ambiental.md` quando o escopo os envolver.
