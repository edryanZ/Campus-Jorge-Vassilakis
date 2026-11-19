-- EXEMPLO PARA REVISÃO. NÃO EXECUTAR NO BANCO ATUAL SEM APROVAÇÃO.
-- Não cria nem altera auditorias reais, perfis, papéis ou storage.
-- Tabela separada exclusiva para comparar dois serviços com registros fictícios.
create table if not exists public.dual_db_trial_records (
  trial_id text primary key check (trial_id ~ '^CJV-TEST-[A-Za-z0-9-]{1,70}$'),
  owner_id uuid not null default (select auth.uid()),
  payload jsonb not null check (
    payload->>'testOnly' = 'true'
    and payload->>'environmentId' = 'DADO FICTÍCIO PARA TESTE'
    and payload->>'inspector' = 'DADO FICTÍCIO PARA TESTE'
    and octet_length(payload::text) <= 20000
  ),
  updated_at timestamptz not null default now()
);
alter table public.dual_db_trial_records enable row level security;
revoke all on public.dual_db_trial_records from public, anon;
grant select, insert, update on public.dual_db_trial_records to authenticated;

create policy "dual_trial_select_own" on public.dual_db_trial_records
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "dual_trial_insert_own" on public.dual_db_trial_records
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "dual_trial_update_own" on public.dual_db_trial_records
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Depois da aplicação, testar SELECT/INSERT/UPDATE como usuário normal
-- e ausência de acesso como anon/outro usuário.
-- NÃO usar service_role no navegador.
