create table public.prospect_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  job_type text not null default 'discover_prospects',
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  summary jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prospect_generation_jobs_status_check
    check (status in ('queued', 'running', 'completed', 'failed')),
  constraint prospect_generation_jobs_job_type_check
    check (job_type in ('discover_prospects'))
);

create index prospect_generation_jobs_org_status_created_idx
  on public.prospect_generation_jobs(organization_id, status, created_at desc);

create index prospect_generation_jobs_status_created_idx
  on public.prospect_generation_jobs(status, created_at desc);

create trigger prospect_generation_jobs_set_updated_at
before update on public.prospect_generation_jobs
for each row execute function public.set_updated_at();

create table public.prospect_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.prospect_generation_jobs(id) on delete cascade,
  status text not null default 'pending_review',
  name text not null,
  website text,
  district text,
  location text,
  rationale text,
  confidence_score numeric(4, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prospect_candidates_status_check
    check (status in ('pending_review', 'approved', 'rejected'))
);

create index prospect_candidates_org_status_idx
  on public.prospect_candidates(organization_id, status);

create index prospect_candidates_job_id_idx
  on public.prospect_candidates(job_id);

create trigger prospect_candidates_set_updated_at
before update on public.prospect_candidates
for each row execute function public.set_updated_at();

alter table public.prospect_generation_jobs enable row level security;
alter table public.prospect_candidates enable row level security;

create policy "Org members can read prospect generation jobs"
on public.prospect_generation_jobs for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Org writers can create prospect generation jobs"
on public.prospect_generation_jobs for insert
to authenticated
with check (
  public.can_write_org(organization_id)
  and created_by = auth.uid()
);

create policy "Org members can read prospect candidates"
on public.prospect_candidates for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Org writers can manage prospect candidates"
on public.prospect_candidates for all
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));
