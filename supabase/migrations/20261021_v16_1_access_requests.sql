-- v16.1: cadastro com aprovação manual; preserva auditorias, revisões e evidências.
-- Novas contas nunca recebem privilégios de auditor nem admin automaticamente.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_review_status_valid'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_review_status_valid
      CHECK (review_status IN ('PENDING', 'APPROVED', 'REJECTED'));
  END IF;
END $$;

-- Contas existentes e ativas continuam ativas e aparecem como aprovadas.
UPDATE public.profiles
SET review_status = 'APPROVED'
WHERE active AND review_status <> 'APPROVED';

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.active AND p.role IN ('ADMIN', 'AUDITOR')
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid()) AND p.active AND p.role = 'ADMIN'
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;

-- A conta e criada pelo Auth; o perfil fica inativo ate aprovacao.
CREATE OR REPLACE FUNCTION public.create_pending_profile()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, role, active, display_name, review_status)
  VALUES (
    NEW.id, 'AUDITOR', false,
    nullif(left(trim(coalesce(NEW.raw_user_meta_data->>'display_name', '')), 120), ''),
    'PENDING'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_pending_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS auth_users_create_pending_profile ON auth.users;
CREATE TRIGGER auth_users_create_pending_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_pending_profile();

-- Restringe dados privados a contas efetivamente autorizadas, inclusive
-- quem já tinha auditoria e posteriormente teve o acesso revogado.
CREATE POLICY audits_v161_active_read
  ON public.audits AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.is_active_staff());
CREATE POLICY audits_v161_active_update
  ON public.audits AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_active_staff())
  WITH CHECK (public.is_active_staff());
CREATE POLICY audit_revisions_v161_active_read
  ON public.audit_revisions AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.is_active_staff());
CREATE POLICY audit_evidence_v161_active_read
  ON public.audit_evidence AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.is_active_staff());
CREATE POLICY audit_evidence_v161_active_insert
  ON public.audit_evidence AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff());

-- Apenas administrador ativo consegue ver solicitacoes e emails.
CREATE OR REPLACE FUNCTION public.admin_list_access_requests()
RETURNS TABLE (
  user_id uuid, email text, display_name text, role text,
  active boolean, review_status text, confirmed boolean,
  created_at timestamptz, reviewed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Somente administrador ativo.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.user_id, u.email::text, p.display_name, p.role,
         p.active, p.review_status, (u.email_confirmed_at IS NOT NULL),
         p.created_at, p.reviewed_at
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
   WHERE p.role <> 'ADMIN'
   ORDER BY CASE p.review_status WHEN 'PENDING' THEN 0 WHEN 'REJECTED' THEN 1 ELSE 2 END,
            p.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_access_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_access_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_access_request(
  p_user_id uuid, p_approve boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'Somente administrador ativo.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é permitido modificar a própria aprovação.' USING ERRCODE = '42501';
  END IF;
  IF p_approve AND NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_user_id AND email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'O solicitante precisa confirmar o e-mail antes da aprovação.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles
    SET active = p_approve, role = 'AUDITOR',
        review_status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
        reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
    WHERE user_id = p_user_id AND role <> 'ADMIN';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou conta administrativa protegida.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_access_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_access_request(uuid, boolean) TO authenticated;

COMMIT;
