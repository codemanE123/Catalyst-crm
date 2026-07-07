create table public.meeting_prep_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  prospect_candidate_id uuid references public.prospect_candidates(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  agent_execution_id uuid references public.agent_executions(id) on delete set null,
  meeting_objective text not null,
  key_context jsonb not null default '[]'::jsonb,
  likely_priorities jsonb not null default '[]'::jsonb,
  suggested_questions jsonb not null default '[]'::jsonb,
  recommended_securecell_offering text not null,
  objections_to_prepare_for jsonb not null default '[]'::jsonb,
  next_step_recommendation text not null,
  confidence_score numeric(4, 3) not null,
  review_status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_prep_briefs_target_type_check
    check (target_type in ('prospect_candidate', 'school')),
  constraint meeting_prep_briefs_review_status_check
    check (review_status in ('pending_review', 'dismissed'))
);

create index meeting_prep_briefs_org_target_created_idx
  on public.meeting_prep_briefs(organization_id, target_type, target_id, created_at desc);

create index meeting_prep_briefs_candidate_idx
  on public.meeting_prep_briefs(prospect_candidate_id);

create index meeting_prep_briefs_school_idx
  on public.meeting_prep_briefs(school_id);

create trigger meeting_prep_briefs_set_updated_at
before update on public.meeting_prep_briefs
for each row execute function public.set_updated_at();

alter table public.meeting_prep_briefs enable row level security;

create policy "Org members can read meeting prep briefs"
on public.meeting_prep_briefs for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Org writers can manage meeting prep briefs"
on public.meeting_prep_briefs for all
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
      'FutureContactDiscoveryAgent',
      'FutureMeetingPrepAgent'
    )
  );
