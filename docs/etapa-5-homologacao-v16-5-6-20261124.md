# Etapa 5 — Homologação técnica e liberação controlada v16.5.6 (24/11/2026)

## Escopo

Verificar a implementação da restauração de ZIP V1, proteção de fotografias e auditorias existentes, recuperação de acesso administrativo após pausa e compatibilidade com backups legados. Não criar auditorias ou anexos no Supabase de produção para testar.

## Evidência de teste realizada

- **13 testes específicos de restauração**: todos aprovados em executor JavaScript V8 compatível com os cenários do arquivo `tests/backup-restauracao-v16-5-6.test.cjs`. Incluem ZIP gerado pelo aplicativo, fotografia íntegra, importação repetida sem sobrescrita, corrupção de CRC, manifesto inválido, dono distinto, foto ausente, tamanho de foto legado e prévia forjada.
- **5 testes de recuperação de acesso**: todos aprovados em executor JavaScript V8 para `tests/recuperacao-acesso-admin.test.cjs`. Incluem nova validação após retorno, conta distinta, janela de redução de chamadas, ausência de acesso e disparo de sincronização somente após autorização.
- **11 testes de preservação de rascunhos**: todos aprovados em executor JavaScript V8 para `tests/retomada-rascunho-v16-5-4.test.cjs`.
- **7 testes de proteção de respostas parciais**: todos aprovados em executor JavaScript V8 para `tests/auditoria-protecao-respostas-parciais.test.cjs`.
- **Verificações estáticas**: sintaxe válida para os 13 módulos JS, presença dos arquivos vinculados pelo HTML/Service Worker, ordem de carregamento dos módulos e versão do cache `campus-auditoria-v16-5-6-recuperacao-zip`.
- **Prévia da Vercel**: integrações `campusjvunir` e `campus-jorge-vassilakis` publicaram status de implantação bem-sucedida para a branch de testes antes do fechamento desta etapa.

**Limites importantes:** esta sessão não conseguiu baixar o repositório no ambiente Node por restrição de rede. As verificações em V8 não substituem a execução do comando `node --test tests/*.test.cjs`, nem teste autenticado no navegador ou em aparelho móvel real. Assim, o estado é **publicação de correção aditiva com homologação parcial**, não certificação de ponta a ponta.

## Controle de segurança

1. ZIP somente local, sem upload automático; formato V1 sem compressão, limites de tamanho e verificação CRC de todas as entradas.
2. Restauração exige usuário autorizado e confirmação; apenas `add()` para registros ausentes e tudo na mesma transação IndexedDB.
3. Dados recuperados têm `syncState=CONFLICT`, sem envio automático, e exigem comparação antes da reconciliação.
4. Fotografias antigas sem atributo `size` são aceitas somente após verificação de integridade; o tamanho é recuperado dos bytes reais.
5. Nenhuma SQL, RLS, perfil, auditoria real, Storage, mapa, GitHub Actions ou migração foi alterada.
6. O ZIP de exportação não é criptografado: guardar fora do dispositivo e não enviar para serviços públicos.

## Pendências reais

- Rodar a suíte Node completa no repositório e registrar resultado.
- Em navegador/celular **com dados fictícios**, verificar exportar → fechar navegador → importar ZIP → abrir histórico → comparar fotografias, inclusive em outra instalação.
- Confirmar acesso ADMIN/AUDITOR e o comportamento com Supabase temporariamente indisponível.
- Não apagar o armazenamento do aparelho original antes de conferir que backup e recuperação cobrem os dados necessários.
