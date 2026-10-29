-- v16.2.5: confirmação de sincronização de edições compartilhadas.
-- Corrige a interação com o gatilho v14_enforce_public_payload.
-- Não modifica auditorias existentes, revisões, evidências ou permissões.
-- Observação: a segunda atualização de sync_complete cria uma revisão técnica
-- adicional pelo gatilho audits_record_revision, preservando todo o histórico.
BEGIN;

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
  -- O gatilho v14_enforce_public_payload marca sync_complete=false sempre que
  -- private_payload muda. Confirmar em uma SEGUNDA atualização, após o gatilho,
  -- somente se todas as evidências já foram verificadas. Essa atualização
  -- não modifica o payload nem reabre auditoria concluída.
  IF confirmed_count=expected_count THEN
    UPDATE public.audits SET sync_complete=true
    WHERE id=p_id AND sync_complete IS DISTINCT FROM true;
  END IF;
  RETURN QUERY SELECT x.* FROM public.audits x WHERE x.id=p_id;
END; $$;

REVOKE ALL ON FUNCTION public.sync_shared_audit(text,jsonb,jsonb,text,bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_shared_audit(text,jsonb,jsonb,text,bigint,text) TO authenticated;

COMMIT;
