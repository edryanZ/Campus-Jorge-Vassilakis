-- PROPOSTA PARA REVISÃO, NÃO EXECUTADA.
-- Campus Jorge Vassilakis: endurecimento de permissões de auditoria.
-- Antes de aplicar: backup, testes com conta ADMIN / AUDITOR / REVOGADA,
-- participação compartilhada e verificação de upload de evidências.
-- As políticas permissivas se combinam por OR no PostgreSQL.
begin;

-- Remover políticas genéricas que tornam todos os auditores ativos
-- capazes de consultar e alterar registros de outros responsáveis.
drop policy if exists audits_v161_active_read on public.audits;
drop policy if exists audits_v161_active_insert on public.audits;
drop policy if exists audits_v161_active_update on public.audits;
drop policy if exists audit_revisions_v161_active_read on public.audit_revisions;
drop policy if exists audit_revisions_v161_active_insert on public.audit_revisions;
drop policy if exists audit_evidence_v161_active_read on public.audit_evidence;
drop policy if exists audit_evidence_v161_active_insert on public.audit_evidence;

-- Estas políticas de storage também concedem acesso amplo indevido;
-- a regra anterior '(bucket_id <> audit-evidence OR is_active_staff())'
-- permite acesso além do bucket restrito.
drop policy if exists storage_audit_evidence_v161_active_read on storage.objects;
drop policy if exists storage_audit_evidence_v161_active_insert on storage.objects;

-- Um proprietário revogado também não deve acessar seus dados privados.
alter policy audits_read_authorized on public.audits
using (public.is_active_staff() and
  (owner_id = (select auth.uid()) or public.is_active_admin()));

alter policy audits_update_authorized on public.audits
using (public.is_active_staff() and status <> 'COMPLETED' and
  (owner_id = (select auth.uid()) or public.is_active_admin()))
with check (public.is_active_staff() and
  (owner_id = (select auth.uid()) or public.is_active_admin()));

alter policy audits_owner_finalize_sync on public.audits
using (public.is_active_staff() and owner_id = (select auth.uid())
  and status = 'COMPLETED')
with check (public.is_active_staff() and owner_id = (select auth.uid())
  and status = 'COMPLETED' and is_public = false);

alter policy audit_evidence_read_authorized on public.audit_evidence
using (public.is_active_staff() and exists (
  select 1 from public.audits a where a.id = audit_evidence.audit_id
  and (a.owner_id = (select auth.uid()) or public.is_active_admin())
));

alter policy audit_evidence_insert_owner on public.audit_evidence
with check (
  public.is_active_staff()
  and owner_id = (select auth.uid())
  and exists (
    select 1 from public.audits a where a.id = audit_evidence.audit_id
    and a.owner_id = (select auth.uid())
    and (a.status <> 'COMPLETED' or
      coalesce(a.private_payload->'evidenceIds', '[]'::jsonb) ? audit_evidence.id)
  )
);

alter policy audit_revisions_read_authorized on public.audit_revisions
using (public.is_active_staff() and exists (
  select 1 from public.audits a where a.id = audit_revisions.audit_id
  and (a.owner_id = (select auth.uid()) or public.is_active_admin())
));

-- O trigger de revisões usa SECURITY DEFINER e registra as revisões.
-- Nenhuma política de INSERT direto de revisões é recriada aqui.
-- A funcionalidade do trigger deve ser testada antes da aplicação.

alter policy audit_storage_select_authorized on storage.objects
using (bucket_id = 'audit-evidence' and public.is_active_staff()
  and exists (
    select 1 from public.audits a
    where a.id = (storage.foldername(name))[2]
    and (a.owner_id = (select auth.uid()) or public.is_active_admin())
  ));

alter policy audit_storage_insert_owner on storage.objects
with check (bucket_id = 'audit-evidence' and public.is_active_staff()
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.audits a
    where a.id = (storage.foldername(name))[2]
    and a.owner_id = (select auth.uid())
    and (a.status <> 'COMPLETED' or
      coalesce(a.private_payload->'evidenceIds', '[]'::jsonb)
        ? (storage.foldername(name))[3])
  ));

commit;
