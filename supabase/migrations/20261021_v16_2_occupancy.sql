-- v16.2 etapa 1: inventário seguro de ocupação por ambiente e bloqueio global.
-- Não altera auditorias, responsáveis, revisões ou evidências existentes.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS audits_one_active_per_environment_v162_idx
  ON public.audits (environment_id)
  WHERE status IN ('DRAFT','IN_PROGRESS');

CREATE OR REPLACE FUNCTION public.list_active_audit_occupancy()
RETURNS TABLE (audit_id text, environment_id text, status text, responsible_name text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT a.id::text, a.environment_id::text, a.status::text,
         coalesce(nullif(p.display_name,''), 'Auditor responsável')::text, a.updated_at
  FROM public.audits a
  LEFT JOIN public.profiles p ON p.user_id = a.owner_id
  WHERE public.is_active_staff() AND a.status IN ('DRAFT','IN_PROGRESS');
$$;
REVOKE ALL ON FUNCTION public.list_active_audit_occupancy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_audit_occupancy() TO authenticated;
COMMIT;
