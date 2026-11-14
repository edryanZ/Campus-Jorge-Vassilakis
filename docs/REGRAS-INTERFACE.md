# Regras de interface e acessibilidade

Priorizar coleta confiável em aparelhos Android com pouca memória: layout responsivo, formulários legíveis, botões com área de toque adequada, contraste e foco visível. Não ocultar informações fundamentais atrás de animações ou controles inacessíveis.

O mapa deve oferecer navegação fixa e modo de exploração; o comando **Fixar mapa** não deve apagar a seleção ou o enquadramento, enquanto **Visão geral** restaura a planta.

Mensagens devem distinguir: salvo localmente, sincronizado no servidor, evidência pendente, conflito preservado e falha de conexão. Nunca apresentar falha de recuperação como perda dos envios já confirmados.

Fechar/trocar de tela deve tentar gravar alterações pendentes e fotos; avisar sobre dados não salvos. Não reexibir listas administrativas depois de logout ou troca de identidade. Respeitar `prefers-reduced-motion`.

Não acumular novas regras CSS apenas para cobrir antigas: verificar as media queries existentes e testar desktop e telas estreitas.
