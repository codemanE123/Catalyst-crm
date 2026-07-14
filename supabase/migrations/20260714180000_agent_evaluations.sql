-- Phase 4.10: agent evaluations for quality scoring and observability

create table if not exists public.agent_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_execution_id uuid references public.agent_executions(id) on delete set null,
  agent_name text,
  target_type text,
  target_id text,
  evaluation_type text not null,
  evaluator_type text not null,
  evaluator_user_id uuid references auth.users(id) on delete set null,
  score numeric(5, 2),
  outcome text,
  feedback text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_evaluations_type_check
    check (
      evaluation_type in (
        'human_review',
        'automated_quality_check',
        'source_quality',
        'output_completeness',
        'factuality',
        'usefulness',
        'safety'
      )
    ),
  constraint agent_evaluations_evaluator_type_check
    check (evaluator_type in ('human', 'system', 'policy')),
  constraint agent_evaluations_outcome_check
    check (
      outcome is null
      or outcome in (
        'accepted',
        'rejected',
        'needs_revision',
        'approved_with_edits',
        'failed_quality_check'
      )
    ),
  constraint agent_evaluations_score_range_check
    check (score is null or (score >= 1 and score <= 5)),
  constraint agent_evaluations_feedback_length_check
    check (feedback is null or char_length(feedback) <= 2000)
);

create index if not exists agent_evaluations_org_created_idx
  on public.agent_evaluations(organization_id, created_at desc);

create index if not exists agent_evaluations_execution_idx
  on public.agent_evaluations(agent_execution_id);

create index if not exists agent_evaluations_agent_name_idx
  on public.agent_evaluations(organization_id, agent_name, created_at desc);

create index if not exists agent_evaluations_outcome_idx
  on public.agent_evaluations(organization_id, outcome, created_at desc);

create trigger agent_evaluations_set_updated_at
before update on public.agent_evaluations
for each row execute function public.set_updated_at();

alter table public.agent_evaluations enable row level security;

create policy "Org members can read agent evaluations"
on public.agent_evaluations for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Org writers can insert agent evaluations"
on public.agent_evaluations for insert
to authenticated
with check (public.can_write_org(organization_id));

create policy "Org writers can update agent evaluations"
on public.agent_evaluations for update
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));

-- Deletes limited to writers (admins typically via can_write_org); no open delete for read_only.
create policy "Org writers can delete agent evaluations"
on public.agent_evaluations for delete
to authenticated
using (public.can_write_org(organization_id));
