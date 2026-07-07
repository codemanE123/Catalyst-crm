alter table public.prospect_candidates
  add column enrichment_summary text,
  add column outreach_angle text,
  add column recommended_next_step text,
  add column enrichment_status text not null default 'not_enriched',
  add column enriched_at timestamptz;

alter table public.prospect_candidates
  add constraint prospect_candidates_enrichment_status_check
  check (enrichment_status in ('not_enriched', 'enriched', 'failed', 'blocked'));
