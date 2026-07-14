-- Phase 4.9: approval assignments + expanded review statuses for AI artifacts

-- Expand review_status on contact recommendations
alter table public.prospect_contact_recommendations
  drop constraint if exists prospect_contact_recommendations_review_status_check;

alter table public.prospect_contact_recommendations
  add constraint prospect_contact_recommendations_review_status_check
  check (
    review_status in (
      'pending_review',
      'accepted',
      'needs_revision',
      'dismissed'
    )
  );

-- Expand review_status on meeting prep briefs
alter table public.meeting_prep_briefs
  drop constraint if exists meeting_prep_briefs_review_status_check;

alter table public.meeting_prep_briefs
  add constraint meeting_prep_briefs_review_status_check
  check (
    review_status in (
      'pending_review',
      'accepted',
      'needs_revision',
      'dismissed'
    )
  );

-- Expand review_status on proposal drafts
alter table public.proposal_drafts
  drop constraint if exists proposal_drafts_review_status_check;

alter table public.proposal_drafts
  add constraint proposal_drafts_review_status_check
  check (
    review_status in (
      'pending_review',
      'accepted',
      'needs_revision',
      'dismissed'
    )
  );

create table if not exists public.approval_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  approval_type text not null,
  source_id text not null,
  assigned_to uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete cascade,
  priority text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_assignments_type_check
    check (
      approval_type in (
        'prospect_candidate',
        'prospect_enrichment',
        'outreach_draft',
        'contact_recommendation',
        'meeting_prep',
        'proposal_draft'
      )
    ),
  constraint approval_assignments_priority_check
    check (
      priority is null
      or priority in ('low', 'normal', 'high', 'urgent')
    ),
  constraint approval_assignments_unique_source
    unique (approval_type, source_id)
);

create index if not exists approval_assignments_org_idx
  on public.approval_assignments(organization_id, created_at desc);

create index if not exists approval_assignments_assignee_idx
  on public.approval_assignments(assigned_to, organization_id);

create trigger approval_assignments_set_updated_at
before update on public.approval_assignments
for each row execute function public.set_updated_at();

alter table public.approval_assignments enable row level security;

create policy "Org members can read approval assignments"
on public.approval_assignments for select
to authenticated
using (public.has_org_access(organization_id));

create policy "Org writers can manage approval assignments"
on public.approval_assignments for all
to authenticated
using (public.can_write_org(organization_id))
with check (public.can_write_org(organization_id));
