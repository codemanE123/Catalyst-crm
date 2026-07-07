alter table public.prospect_candidates
  add column promoted_school_id uuid references public.schools(id) on delete set null;

create index prospect_candidates_promoted_school_id_idx
  on public.prospect_candidates(promoted_school_id)
  where promoted_school_id is not null;
