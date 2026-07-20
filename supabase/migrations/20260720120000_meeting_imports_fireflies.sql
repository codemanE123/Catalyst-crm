-- Phase 5.x.1: Fireflies meeting import staging (HITL before interviews)

create table if not exists public.meeting_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'fireflies',
  provider_meeting_id text not null,
  school_id uuid references public.schools(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  interview_id uuid references public.interviews(id) on delete set null,
  meeting_title text,
  meeting_started_at timestamptz,
  meeting_ended_at timestamptz,
  participants_json jsonb not null default '[]'::jsonb,
  digest_text text,
  transcript_excerpt text,
  source_url text,
  match_status text not null default 'unmatched',
  match_confidence numeric(4, 3),
  review_status text not null default 'pending_review',
  error_code text,
  error_message text,
  payload_hash text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_imports_provider_check
    check (provider in ('fireflies')),
  constraint meeting_imports_match_status_check
    check (match_status in ('unmatched', 'suggested', 'linked')),
  constraint meeting_imports_review_status_check
    check (review_status in ('pending_review', 'accepted', 'rejected', 'failed')),
  constraint meeting_imports_digest_len_check
    check (digest_text is null or char_length(digest_text) <= 5000),
  constraint meeting_imports_transcript_len_check
    check (transcript_excerpt is null or char_length(transcript_excerpt) <= 10000),
  constraint meeting_imports_title_len_check
    check (meeting_title is null or char_length(meeting_title) <= 500),
  constraint meeting_imports_provider_meeting_unique
    unique (organization_id, provider, provider_meeting_id)
);

create index if not exists meeting_imports_org_review_created_idx
  on public.meeting_imports(organization_id, review_status, created_at desc);

create index if not exists meeting_imports_school_idx
  on public.meeting_imports(school_id);

create index if not exists meeting_imports_provider_meeting_idx
  on public.meeting_imports(provider, provider_meeting_id);

drop trigger if exists meeting_imports_set_updated_at on public.meeting_imports;
create trigger meeting_imports_set_updated_at
before update on public.meeting_imports
for each row execute function public.set_updated_at();

alter table public.meeting_imports enable row level security;

drop policy if exists meeting_imports_select on public.meeting_imports;
create policy meeting_imports_select
  on public.meeting_imports
  for select
  to authenticated
  using (public.has_org_access(organization_id));

drop policy if exists meeting_imports_write on public.meeting_imports;
create policy meeting_imports_write
  on public.meeting_imports
  for all
  to authenticated
  using (public.can_write_org(organization_id))
  with check (public.can_write_org(organization_id));
