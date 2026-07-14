-- Phase 5.4: async prospect enrichment status values

alter table public.prospect_candidates
  drop constraint if exists prospect_candidates_enrichment_status_check;

alter table public.prospect_candidates
  add constraint prospect_candidates_enrichment_status_check
  check (
    enrichment_status in (
      'not_enriched',
      'queued',
      'running',
      'enriched',
      'failed',
      'blocked',
      'policy_denied',
      'budget_denied'
    )
  );
