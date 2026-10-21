-- V16.1.2: fecha lacuna de INSERT direto e por RPC em contas pendentes.
-- Não modifica nenhuma auditoria, revisão, evidência ou perfil existente.
BEGIN;

CREATE POLICY audits_v161_active_insert
  ON public.audits AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff());

CREATE POLICY audit_revisions_v161_active_insert
  ON public.audit_revisions AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff());

CREATE POLICY storage_audit_evidence_v161_active_read
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'audit-evidence' OR public.is_active_staff());

CREATE POLICY storage_audit_evidence_v161_active_insert
  ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'audit-evidence' OR public.is_active_staff());

-- Novas contas só obtêm permissão de AUDITOR após a aprovação.
-- As funções administrativas já validam ADMIN ativo no servidor.
COMMIT;
