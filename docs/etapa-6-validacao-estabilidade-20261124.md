# Etapa 6 — Validação final e estabilidade (24/11/2026)

## Situação
**Correção implementada na branch isolada**, sem alteração da `main`, da produção, das políticas RLS, dos registros de auditoria ou das fotografias no Supabase.

A validação encontrou uma falha na versão v16.5.6: a restauração de ZIP não recuperava uma fotografia que faltava no IndexedDB quando a respectiva auditoria já existia. A versão de teste v16.5.7 trata o caso sem trocar as respostas existentes.

## Comportamento de recuperação verificado

- ZIP v1 conferido por CRC-32 antes da importação; foto e manifesto vinculados pelo ID de auditoria/evidência.
- Se a auditoria é nova, ela é acrescentada e marcada em `CONFLICT`.
- Se a auditoria já existe, **somente um registro de evidência ausente**, já referenciado por `audit.evidenceIds`, pode ser acrescentado, e somente com o mesmo ambiente e proprietário. Os campos ambientais, IDs, datas e demais dados coletados não são alterados.
- A transação IndexedDB atualiza apenas o estado de segurança da auditoria existente para `CONFLICT` e `restoreReviewRequired=true`, impedindo que a importação dispare upload remoto. Um retorno de RPC anterior não limpa essa quarentena.
- Quando a evidência já está cadastrada, nenhum campo ou Blob é sobrescrito. **Limite conhecido:** se o registro de evidência existe, mas está sem Blob, o importador ainda não preenche esse Blob; requer reconciliação específica e consentimento.
- Fotografias realmente ausentes do ZIP não marcam auditorias existentes como conflitantes apenas pelos metadados.
- O modal de confirmação informa expressamente quando a recuperação de fotos pode colocar a auditoria em revisão.
- O cache PWA foi incrementado para `campus-auditoria-v16-5-7-fotos-restauradas`.

## Testes feitos nesta etapa

| Grupo | Casos | Resultado |
|---|---:|---|
| Restauração de ZIP e fotos | 22 | Aprovados em simulação JavaScript V8 |
| Rascunhos antigos e retorno remoto parcial | 19 | Aprovados em simulação JavaScript V8 |
| Recuperação de acesso ADMIN | 5 | Aprovados em simulação JavaScript V8 |
| **Total** | **46** | **46 aprovados** |

Os testes de ZIP incluem foto existente, foto ausente, metadados sem bytes, arquivo adulterado, conta incorreta, duplicação, edição simultânea e retenção de conflito anterior. O teste de confirmação tardia protege `restoreReviewRequired` contra um RPC antigo.

**Limites da evidência:** os 46 casos foram executados em JavaScript V8 com simulações das APIs de browser. Não foram executados como suíte integral do Node nem num navegador com IndexedDB real, câmera, login Supabase ou celular Android. O ambiente de execução local dispõe de Node, mas não consegue acessar o GitHub pela rede para obter os arquivos do repositório. Acesso web direto aos domínios públicos também não foi confirmado nesta etapa. Não declarar homologação ponta a ponta.

## Próximos controles de aceite (dados fictícios apenas)

1. Na prévia Vercel, abrir uma conta de teste autorizada e importar um ZIP de teste com fotografia.
2. Em um navegador de testes, importar de novo o mesmo ZIP para provar idempotência e ausência de sobrescrita.
3. Simular auditoria já existente com evidência faltante; conferir o novo Blob e o estado `CONFLICT` sem enviar a cópia ao servidor.
4. Reabrir no Android, testar câmera, armazenamento, cache v16.5.7 e funcionamento offline.
5. Executar `node --test tests/*.test.cjs` em checkout local do repositório e corrigir eventuais regressões.
6. Só aprovar merge em `main` após estes controles ou uma autorização expressa para lançamento com os riscos registrados.

Não limpar os dados do aparelho que contém as auditorias originais. O ZIP é confidencial e não criptografado.
