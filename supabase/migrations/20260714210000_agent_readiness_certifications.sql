-- Phase 4.14: agent readiness certifications + simulation evidence references

create table if not exists public.agent_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  agent_name text not null,
  status text not null,
  scenario_coverage numeric(6, 4) not null default 0,
  failure_count integer not null default 0,
  fixed_seed text,
  completed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agent_simulation_runs_status_check
    check (status in ('passed', 'failed')),
  constraint agent_simulation_runs_agent_name_check
    check (char_length(agent_name) between 1 and 120)
);

create index if not exists agent_simulation_runs_org_idx
  on public.agent_simulation_runs(organization_id);

create index if not exists agent_simulation_runs_agent_name_idx
  on public.agent_simulation_runs(agent_name);

create index if not exists agent_simulation_runs_completed_at_idx
  on public.agent_simulation_runs(completed_at desc);

create table if not exists public.agent_readiness_certifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  agent_name text not null,
  environment text not null,
  version text not null,
  status text not null default 'draft',
  certification_scope text not null,
  policy_set_id uuid references public.agent_policy_sets(id) on delete set null,
  prompt_version_id uuid references public.agent_prompt_versions(id) on delete set null,
  rollout_id uuid references public.agent_rollouts(id) on delete set null,
  simulation_run_id uuid references public.agent_simulation_runs(id) on delete set null,
  quality_snapshot jsonb not null default '{}'::jsonb,
  usage_snapshot jsonb not null default '{}'::jsonb,
  risk_summary text,
  blockers jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  evaluation jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  expires_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoke_reason text,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  reject_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_readiness_status_check
    check (
      status in (
        'draft',
        'in_review',
        'approved',
        'rejected',
        'expired',
        'revoked'
      )
    ),
  constraint agent_readiness_environment_check
    check (environment in ('staging', 'production')),
  constraint agent_readiness_version_check
    check (char_length(version) between 1 and 64),
  constraint agent_readiness_agent_name_check
    check (char_length(agent_name) between 1 and 120),
  constraint agent_readiness_approved_expiry_check
    check (
      status <> 'approved'
      or (approved_at is not null and expires_at is not null)
    )
);

create index if not exists agent_readiness_organization_id_idx
  on public.agent_readiness_certifications(organization_id);

create index if not exists agent_readiness_agent_name_idx
  on public.agent_readiness_certifications(agent_name);

create index if not exists agent_readiness_environment_idx
  on public.agent_readiness_certifications(environment);

create index if not exists agent_readiness_status_idx
  on public.agent_readiness_certifications(status);

create index if not exists agent_readiness_expires_at_idx
  on public.agent_readiness_certifications(expires_at);

create index if not exists agent_readiness_created_at_idx
  on public.agent_readiness_certifications(created_at desc);

create trigger agent_readiness_certifications_set_updated_at
before update on public.agent_readiness_certifications
for each row execute function public.set_updated_at();

alter table public.agent_simulation_runs enable row level security;
alter table public.agent_readiness_certifications enable row level security;

create policy "Simulation runs select scoped"
on public.agent_simulation_runs for select
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id is null
    and exists (
      select 1 from public.organization_members om
      where om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
  or (
    organization_id is not null
    and public.has_org_access(organization_id)
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = agent_simulation_runs.organization_id
        and om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
);

create policy "Simulation runs insert managed"
on public.agent_simulation_runs for insert
to authenticated
with check (
  (organization_id is null and public.is_super_admin())
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
);

create policy "Readiness certifications select scoped"
on public.agent_readiness_certifications for select
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id is null
    and exists (
      select 1 from public.organization_members om
      where om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
  or (
    organization_id is not null
    and public.has_org_access(organization_id)
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = agent_readiness_certifications.organization_id
        and om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
);

create policy "Readiness certifications insert managed"
on public.agent_readiness_certifications for insert
to authenticated
with check (
  (organization_id is null and public.is_super_admin())
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
);

create policy "Readiness certifications update managed"
on public.agent_readiness_certifications for update
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
)
with check (
  public.is_super_admin()
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
);
