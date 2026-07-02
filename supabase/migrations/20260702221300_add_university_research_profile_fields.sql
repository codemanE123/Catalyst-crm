alter table public.schools
  add column enrollment text,
  add column public_private text
    check (
      public_private is null
      or public_private in ('Public', 'Private', 'Unknown')
    ),
  add column hbcu boolean,
  add column community_college boolean,
  add column state text,
  add column ai_programs text,
  add column cyber_programs text,
  add column healthcare_programs text,
  add column innovation_center text,
  add column entrepreneurship_center text,
  add column career_services_office text,
  add column workforce_development_office text,
  add column profile_sources text[] not null default '{}';
