create extension if not exists pg_trgm;

create index if not exists schools_search_name_trgm_idx
  on public.schools using gin (name gin_trgm_ops);

create index if not exists schools_search_website_trgm_idx
  on public.schools using gin (website gin_trgm_ops);

create index if not exists schools_search_location_trgm_idx
  on public.schools using gin (location gin_trgm_ops);

create index if not exists schools_search_state_trgm_idx
  on public.schools using gin (state gin_trgm_ops);

create index if not exists contacts_search_name_trgm_idx
  on public.contacts using gin (name gin_trgm_ops);

create index if not exists contacts_search_role_trgm_idx
  on public.contacts using gin (role gin_trgm_ops);

create index if not exists schools_organization_name_idx
  on public.schools (organization_id, name);

create index if not exists contacts_organization_name_idx
  on public.contacts (organization_id, name);
