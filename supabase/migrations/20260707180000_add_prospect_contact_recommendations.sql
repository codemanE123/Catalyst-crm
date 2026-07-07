create table public.prospect_contact_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_type text not null,
  target_id text not null,
  prospect_candidate_id uuid references public.prospect_candidates(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  agent_execution_id uuid references public.agent_executions(id) on delete set null,
  recommended_title text not null,
  department text,
  priority integer not null,
  rationale text not null,
  suggested_outreach_angle text not null,
  confidence_score numeric(4, 3) not null,
  review_status text not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prospect_contact_recommendations_target_type_check
    check (target_type in ('prospect_candidate', 'school')),
  constraint prospect_contact_recommendations_review_status_check
    check (review_status in ('pending_review', 'dismissed')),
  constraint prospect_contact_recommendations_priority_check
    check (priority between 1 and 5)
);

create index prospect_contact_recommendations_org_target_idx
  on public.prospect_contact_recommendations(organization_id, target_type, target_id);

create index prospect_contact_recommendations_candidate_idx
  on public.prospect_contact_recommendations(prospect_candidate_id);

create index prospect_contact_recommendations_school_idx
  on public.prospect_contact_recommendations(school_id);

create trigger prospect_contact_recommendations_set_updated_at
before update on public.prospect_contact_recommendations
for each row execute function public.set_updated_at();

alter table public.prospect_contact_recommendations enable row level security;

create policy "Org members can read prospect contact recommendations"
on public.prospect_contact_recommendations for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Org writers can manage prospect contact recommendations"
on public.prospect_contact_recommendations for all
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
      'FutureContactDiscoveryAgent',
      'FutureMeetingPrepAgent'
    )
  );
