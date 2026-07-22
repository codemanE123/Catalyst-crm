-- CSV import fields shown on the schools directory

alter table public.schools
  add column if not exists city text;

alter table public.schools
  add column if not exists school_type text;

alter table public.schools
  add column if not exists priority_contact text;

alter table public.schools
  drop constraint if exists schools_city_len_check;

alter table public.schools
  add constraint schools_city_len_check
    check (city is null or char_length(city) <= 120);

alter table public.schools
  drop constraint if exists schools_school_type_len_check;

alter table public.schools
  add constraint schools_school_type_len_check
    check (school_type is null or char_length(school_type) <= 120);

alter table public.schools
  drop constraint if exists schools_priority_contact_len_check;

alter table public.schools
  add constraint schools_priority_contact_len_check
    check (priority_contact is null or char_length(priority_contact) <= 200);
