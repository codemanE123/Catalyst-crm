create table public.proposal_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  prospect_candidate_id uuid references public.prospect_candidates(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  agent_execution_id uuid references public.agent_executions(id) on delete set null,
  proposal_title text not null,
  executive_summary text not null,
  proposed_program text not null,
  target_audience text not null,
  implementation_plan jsonb not null default '[]'::jsonb,
  timeline text not null,
  success_metrics jsonb not null default '[]'::jsonb,
  recommended_pricing_range text not null,
  next_steps jsonb not null default '[]'::jsonb,
  confidence_score numeric(4, 3) not null,
  review_status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposal_drafts_target_type_check
    check (target_type in ('prospect_candidate', 'school')),
  constraint proposal_drafts_review_status_check
    check (review_status in ('pending_review', 'dismissed'))
);

create index proposal_drafts_org_target_created_idx
  on public.proposal_drafts(organization_id, target_type, target_id, created_at desc);

create index proposal_drafts_candidate_idx
  on public.proposal_drafts(prospect_candidate_id);

create index proposal_drafts_school_idx
  on public.proposal_drafts(school_id);

create trigger proposal_drafts_set_updated_at
before update on public.proposal_drafts
for each row execute function public.set_updated_at();

alter table public.proposal_drafts enable row level security;

create policy "Org members can read proposal drafts"
on public.proposal_drafts for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Org writers can manage proposal drafts"
on public.proposal_drafts for all
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));

alter table public.agent_executions
  drop constraint agent_executions_agent_name_check;

alter table public.agent_executions
  add constraint agent_executions_agent_name_check
  check (
    agent_name in (
      'ProspectGenerationAgent',
      'ProspectEnrichmentAgent',
      'OutreachDraftAgent',
      'ContactDiscoveryAgent',
      'MeetingPrepAgent',
      'ProposalGenerationAgent',
      'FutureContactDiscoveryAgent',
      'FutureMeetingPrepAgent'
    )
  );
