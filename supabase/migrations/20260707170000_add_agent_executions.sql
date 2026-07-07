create table public.agent_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_name text not null,
  target_type text not null,
  target_id text not null,
  status text not null default 'queued',
  depends_on_execution_id uuid references public.agent_executions(id) on delete set null,
  attempt_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_executions_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  constraint agent_executions_agent_name_check
    check (
      agent_name in (
        'ProspectGenerationAgent',
        'ProspectEnrichmentAgent',
        'OutreachDraftAgent',
        'FutureContactDiscoveryAgent',
        'FutureMeetingPrepAgent'
      )
    )
);

create index agent_executions_org_status_created_idx
  on public.agent_executions(organization_id, status, created_at asc);

create index agent_executions_depends_on_idx
  on public.agent_executions(depends_on_execution_id);

create index agent_executions_target_idx
  on public.agent_executions(organization_id, target_type, target_id);

create trigger agent_executions_set_updated_at
before update on public.agent_executions
for each row execute function public.set_updated_at();

alter table public.agent_executions enable row level security;

create policy "Org members can read agent executions"
on public.agent_executions for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Org writers can manage agent executions"
on public.agent_executions for all
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));
