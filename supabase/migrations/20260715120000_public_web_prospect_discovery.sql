-- Phase 5.2.1: public-web prospect discovery support
-- 1) Allow org writers to update prospect generation jobs (claim/running/complete)
-- 2) Add discovery provenance columns on prospect candidates

drop policy if exists "Org writers can update prospect generation jobs"
  on public.prospect_generation_jobs;

create policy "Org writers can update prospect generation jobs"
on public.prospect_generation_jobs
for update
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));

alter table public.prospect_candidates
  add column if not exists discovery_method text,
  add column if not exists retrieved_at timestamptz;

comment on column public.prospect_candidates.discovery_method is
  'How the candidate was discovered: college_scorecard | public_web | stub_generator';
comment on column public.prospect_candidates.retrieved_at is
  'When source pages/API data for this candidate were retrieved.';
