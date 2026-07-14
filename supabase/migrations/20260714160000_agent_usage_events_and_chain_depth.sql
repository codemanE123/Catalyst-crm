-- Phase 4.8: agent usage events, chain depth, org-scoped RLS

alter table public.agent_executions
  add column if not exists chain_depth integer not null default 1;

alter table public.agent_executions
  drop constraint if exists agent_executions_chain_depth_check;

alter table public.agent_executions
  add constraint agent_executions_chain_depth_check
  check (chain_depth >= 1 and chain_depth <= 100);

create index if not exists agent_executions_org_chain_depth_idx
  on public.agent_executions(organization_id, chain_depth);

create table if not exists public.agent_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_execution_id uuid references public.agent_executions(id) on delete set null,
  agent_name text,
  target_type text,
  target_id text,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(12, 6),
  status text not null default 'success',
  denial_reason_code text,
  created_at timestamptz not null default now(),
  constraint agent_usage_events_status_check
    check (status in ('success', 'failed', 'denied', 'blocked')),
  constraint agent_usage_events_tokens_nonneg_check
    check (
      (input_tokens is null or input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0)
      and (total_tokens is null or total_tokens >= 0)
    ),
  constraint agent_usage_events_cost_nonneg_check
    check (estimated_cost_usd is null or estimated_cost_usd >= 0)
);

create index if not exists agent_usage_events_org_created_idx
  on public.agent_usage_events(organization_id, created_at desc);

create index if not exists agent_usage_events_agent_name_idx
  on public.agent_usage_events(organization_id, agent_name, created_at desc);

create index if not exists agent_usage_events_execution_idx
  on public.agent_usage_events(agent_execution_id);

create index if not exists agent_usage_events_status_created_idx
  on public.agent_usage_events(organization_id, status, created_at desc);

alter table public.agent_usage_events enable row level security;

create policy "Org members can read agent usage events"
on public.agent_usage_events for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Org writers can insert agent usage events"
on public.agent_usage_events for insert
to authenticated
with check (public.can_write_org(organization_id));

-- Usage events are append-only for members; no update/delete policies for authenticated.
