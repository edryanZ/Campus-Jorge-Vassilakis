-- v16.2: solicitações por auditoria e edição compartilhada autorizada.
-- Adição isolada: não migra nem atualiza auditorias, revisões ou evidências.
BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_participation_requests (
  audit_id text NOT NULL REFERENCES public.audits(id),
  requester_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','REVOKED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (audit_id, requester_id)
);
CREATE INDEX IF NOT EXISTS audit_participation_status_idx
  ON public.audit_participation_requests (status, requested_at DESC);
ALTER TABLE public.audit_participation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_participation_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_audit_participation(p_audit_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE a public.audits%ROWTYPE; v_status text;
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Conta de auditor não autorizada.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO a FROM public.audits WHERE id=p_audit_id AND status IN ('DRAFT','IN_PROGRESS');
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria ativa não encontrada.' USING ERRCODE='P0002'; END IF;
  IF a.owner_id=auth.uid() THEN RAISE EXCEPTION 'Você já é o responsável por esta auditoria.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.audit_participation_requests (audit_id,requester_id,status)
    VALUES(p_audit_id,auth.uid(),'PENDING')
    ON CONFLICT (audit_id,requester_id) DO UPDATE
      SET status=CASE WHEN audit_participation_requests.status='APPROVED' THEN 'APPROVED' ELSE 'PENDING' END,
          requested_at=CASE WHEN audit_participation_requests.status='APPROVED'
              THEN audit_participation_requests.requested_at ELSE now() END,
          reviewed_at=CASE WHEN audit_participation_requests.status='APPROVED'
              THEN audit_participation_requests.reviewed_at ELSE NULL END,
          reviewed_by=CASE WHEN audit_participation_requests.status='APPROVED'
              THEN audit_participation_requests.reviewed_by ELSE NULL END
    RETURNING status INTO v_status;
  RETURN v_status;
END; $$;

CREATE OR REPLACE FUNCTION public.list_my_audit_participation()
RETURNS TABLE(audit_id text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT r.audit_id,r.status
  FROM public.audit_participation_requests r
  WHERE public.is_active_staff() AND r.requester_id=auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.admin_list_audit_participation_requests()
RETURNS TABLE(audit_id text, environment_id text, requester_id uuid,
  requester_name text, requester_email text, responsible_name text,
  status text, requested_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Apenas o administrador pode consultar solicitações.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT r.audit_id,a.environment_id,r.requester_id,
           coalesce(p.display_name,'Auditor')::text,
           u.email::text,
           coalesce(owner_p.display_name,'Auditor responsável')::text,
           r.status,r.requested_at
      FROM public.audit_participation_requests r
      JOIN public.audits a ON a.id=r.audit_id
      JOIN auth.users u ON u.id=r.requester_id
      LEFT JOIN public.profiles p ON p.user_id=r.requester_id
      LEFT JOIN public.profiles owner_p ON owner_p.user_id=a.owner_id
     ORDER BY r.requested_at DESC LIMIT 250;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_audit_participation(
  p_audit_id text, p_requester_id uuid, p_approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE a public.audits%ROWTYPE; current_status text; next_status text;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Somente o administrador pode autorizar participantes.' USING ERRCODE='42501';
  END IF;
  SELECT status INTO current_status FROM public.audit_participation_requests
    WHERE audit_id=p_audit_id AND requester_id=p_requester_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO a FROM public.audits WHERE id=p_audit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auditoria não encontrada.' USING ERRCODE='P0002'; END IF;
  IF p_approve THEN
    IF a.status NOT IN ('DRAFT','IN_PROGRESS') THEN
      RAISE EXCEPTION 'Uma auditoria concluída não aceita novas participações.' USING ERRCODE='55000';
    END IF;
    IF a.owner_id=p_requester_id THEN
      RAISE EXCEPTION 'Responsável já possui acesso.' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=p_requester_id
      AND p.active AND p.review_status='APPROVED' AND p.role IN ('AUDITOR','ADMIN')) THEN
      RAISE EXCEPTION 'O participante precisa ter uma conta de auditor aprovada.' USING ERRCODE='42501';
    END IF;
    next_status:='APPROVED';
  ELSE
    next_status:=CASE WHEN current_status='APPROVED' THEN 'REVOKED' ELSE 'REJECTED' END;
  END IF;
  UPDATE public.audit_participation_requests SET status=next_status,
    reviewed_at=now(),reviewed_by=auth.uid()
    WHERE audit_id=p_audit_id AND requester_id=p_requester_id;
  RETURN next_status;
END; $$;

CREATE OR REPLACE FUNCTION public.get_shared_audit(p_audit_id text)
RETURNS SETOF public.audits LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Conta de auditor não autorizada.' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.audits a WHERE a.id=p_audit_id AND
      (a.owner_id=auth.uid() OR public.is_active_admin() OR
        (a.status IN ('DRAFT','IN_PROGRESS') AND EXISTS(
          SELECT 1 FROM public.audit_participation_requests r
          WHERE r.audit_id=a.id AND r.requester_id=auth.uid() AND r.status='APPROVED'
        )))
  ) THEN
    RAISE EXCEPTION 'Participação não aprovada ou auditoria indisponível.' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT a.* FROM public.audits a WHERE a.id=p_audit_id;
END; $$;

-- Edição compartilhada sem mudar proprietário, ambiente ou lista de evidências.
-- Não concede acesso amplo à tabela nem à publicação.
CREATE OR REPLACE FUNCTION public.sync_shared_audit(
  p_id text, p_private_payload jsonb, p_public_payload jsonb,
  p_status text, p_expected_revision bigint, p_mutation_id text)
RETURNS SETOF public.audits LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE a public.audits%ROWTYPE; expected_count integer; confirmed_count integer;
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Conta de auditor não autorizada.' USING ERRCODE='42501';
  END IF;
  IF p_id IS NULL OR p_mutation_id IS NULL OR p_private_payload IS NULL THEN
    RAISE EXCEPTION 'Dados de sincronização incompletos.' USING ERRCODE='22023';
  END IF;
  IF p_status NOT IN ('DRAFT','IN_PROGRESS','COMPLETED') THEN
    RAISE EXCEPTION 'Status inválido.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO a FROM public.audits WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR a.status NOT IN ('DRAFT','IN_PROGRESS') THEN
    RAISE EXCEPTION 'Auditoria compartilhada não está ativa.' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.audit_participation_requests r
    WHERE r.audit_id=p_id AND r.requester_id=auth.uid() AND r.status='APPROVED'
  ) THEN
    RAISE EXCEPTION 'Participação não autorizada.' USING ERRCODE='42501';
  END IF;
  IF a.last_mutation_id=p_mutation_id THEN
    RETURN QUERY SELECT x.* FROM public.audits x WHERE x.id=p_id; RETURN;
  END IF;
  IF a.server_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'Conflito: há uma revisão mais recente.' USING ERRCODE='40001';
  END IF;
  IF p_private_payload->>'auditId' IS DISTINCT FROM a.id
    OR p_private_payload->>'environmentId' IS DISTINCT FROM a.environment_id
    OR (p_private_payload ? 'ownerId' AND p_private_payload->>'ownerId' IS DISTINCT FROM a.owner_id::text)
    OR coalesce(p_private_payload->'evidenceIds','[]'::jsonb)
       <> coalesce(a.private_payload->'evidenceIds','[]'::jsonb) THEN
    RAISE EXCEPTION 'Não é permitido alterar identificação, proprietário ou evidências da auditoria compartilhada.' USING ERRCODE='42501';
  END IF;
  expected_count:=jsonb_array_length(coalesce(a.private_payload->'evidenceIds','[]'::jsonb));
  SELECT count(*)::integer INTO confirmed_count
    FROM public.audit_evidence e
    WHERE e.audit_id=p_id AND e.content_sha256 IS NOT NULL
      AND a.private_payload->'evidenceIds' ? e.id;
  IF p_status='COMPLETED' AND confirmed_count<>expected_count THEN
    RAISE EXCEPTION 'Não é possível concluir: evidências pendentes.' USING ERRCODE='55000';
  END IF;
  UPDATE public.audits SET
    status=p_status,
    private_payload=p_private_payload - 'collaborationEditorId',
    public_payload=coalesce(p_public_payload,'{}'::jsonb)
      - 'ownerId' - 'syncError'
      #- '{data,identification,inspector}'::text[]
      #- '{data,identification,responsible}'::text[]
      #- '{data,identification,notes}'::text[],
    completed_at=CASE WHEN p_status='COMPLETED' THEN now() ELSE NULL END,
    last_mutation_id=p_mutation_id,
    sync_complete=(confirmed_count=expected_count),
    evidence_expected_count=expected_count,
    evidence_confirmed_count=confirmed_count,
    server_revision=server_revision+1,
    updated_at=now()
  WHERE id=p_id;
  RETURN QUERY SELECT x.* FROM public.audits x WHERE x.id=p_id;
END; $$;

REVOKE ALL ON FUNCTION public.request_audit_participation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_my_audit_participation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_audit_participation_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_audit_participation(text,uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_shared_audit(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_shared_audit(text,jsonb,jsonb,text,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_audit_participation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_audit_participation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_participation_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_audit_participation(text,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_audit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_shared_audit(text,jsonb,jsonb,text,bigint,text) TO authenticated;
COMMIT;