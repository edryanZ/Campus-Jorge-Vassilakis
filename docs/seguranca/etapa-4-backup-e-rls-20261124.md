# Etapa 4 — Diagnóstico de segurança Supabase (24/11/2026)

**Projeto:** Auditoria-Campus-Jorge-Vassilakis (`ebzsxyxuezugfaumyorn`). Revisão **somente leitura** das recomendações do Supabase; nenhuma política, permissão, função, tabela, registro ou usuário foi alterado.

## Estado e riscos

- Saúde: `ACTIVE_HEALTHY`; Health Advisor sem alertas no momento da consulta.
- Security Advisor: 11 funções `SECURITY DEFINER` expostas a usuários `authenticated`; a consulta ao catálogo confirma que essas RPCs não estão executáveis pelo papel `anon`. As funções administrativas testadas consultam `is_active_admin()` e as de auditoria/participação consultam `is_active_staff()` ou verificações específicas do usuário. Isso **não é uma auditoria de segurança completa** do corpo de cada função ou de todos os parâmetros; validar com contas distintas antes de mudar permissões.
- `audit_participation_requests` está com RLS ativada e sem política de leitura direta, porque o fluxo atual utiliza RPCs específicas. Não abrir acesso direto sem revisão de propósito e escopo.
- Proteção contra senhas vazadas está desligada. Avaliar ativação no plano/configuração contratados, sem aceitar cobrança automática.
- Performance Advisor: seis chaves estrangeiras sem índices de apoio e múltiplas políticas permissivas de UPDATE em `audits`. Monitorar latência e planos de consulta; o conjunto pequeno de registros não justifica alteração SQL imediata sem plano de reversão e teste de carga.
- Índices listados como não utilizados não devem ser excluídos apenas por esse aviso, especialmente em banco pequeno.

## Recomendações sem alteração automática

1. Testar com duas contas autorizadas e uma pendente: aprovação/revogação, visibilidade por dono, acesso ADMIN, colaboração e publicação de cópia sanitizada.
2. Revisar separadamente as 11 funções privilegiadas, incluindo checagens de propriedade e impossibilidade de acesso cruzado com parâmetros forjados, antes de remover `EXECUTE` ou alterar `SECURITY DEFINER`.
3. Medir consultas lentas e verificar a necessidade de índices de chaves estrangeiras antes de qualquer migração.
4. Não duplicar banco somente por histórico de pausas; manter exportação local, estados de sincronização e recuperação segura.

Referências: [Security Definer Function](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [políticas UPDATE múltiplas](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies), [segurança de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
