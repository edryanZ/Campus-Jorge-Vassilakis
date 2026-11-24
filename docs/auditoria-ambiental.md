# Uso e revisão da auditoria ambiental

O protótipo permite registrar observações ambientais por ambiente do campus, acompanhar revisão por etapas e anexar fotos. Uma coleta incompleta permanece como rascunho. A conclusão local não garante que servidor e evidências estejam sincronizados.

Para coletar: entrar com conta aprovada; selecionar ambiente; recuperar rascunho próprio se existir; preencher as etapas com dados reais, deixar claro o que não foi avaliado e confirmar a revisão; concluir apenas depois de conferir dados e fotos.

Estados exibidos: **salvo localmente**, **aguardando internet/sincronização**, **sincronizado**, **erro** ou **conflito preservado**. Se houver conflito ou dúvida sobre duas versões, não apagar nenhuma.

Para backup, usar o ZIP disponível na área Minha conta e guardar o arquivo fora do acesso público. As fotos sem bytes locais são informadas na exportação; é necessário conferir a existência no servidor. Não limpar cache/dados do dispositivo antes de reconciliar os rascunhos.

Somente o administrador pode decidir a publicação de resultados permitidos. Nenhuma auditoria privada deve ser exposta automaticamente.

## Recuperar uma coleta a partir do ZIP

1. Faça login com conta autorizada e abra **Minha conta → Restaurar backup ZIP neste dispositivo**.
2. Selecione um ZIP originalmente exportado pelo CJV, confira a quantidade de auditorias, fotografias e alertas, e confirme conscientemente a importação.
3. O sistema só acrescenta IDs ainda ausentes, sem alterar a versão existente. O resultado é local e fica em estado de **conflito preservado**, sem envio automático ao servidor.
4. Abra o histórico para conferir respostas e fotografias e compare com a versão do Supabase antes de qualquer resolução manual. Se a foto estiver ausente no ZIP, o programa informa a falta, sem inventar arquivo.

O ZIP não contém as fotografias que já faltavam no dispositivo de origem. Guarde sempre o arquivo fora do aparelho e não apague o IndexedDB original.
