-- v16.2.4 — correção da RLS de evidências de auditoria concluída.
-- Nenhuma auditoria, revisão, usuário ou fotografia é alterada por este script.
-- A condição anterior consultava o ID da AUDITORIA no array evidenceIds.
-- A condição correta verifica o ID da EVIDÊNCIA que está sendo inserida.
BEGIN;

ALTER POLICY audit_evidence_insert_owner ON public.audit_evidence
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id = audit_evidence.audit_id
        AND a.owner_id = (SELECT auth.uid())
        AND (
          a.status <> 'COMPLETED'
          OR COALESCE(a.private_payload->'evidenceIds', '[]'::jsonb)
             ? audit_evidence.id
        )
    )
  );

COMMIT;
