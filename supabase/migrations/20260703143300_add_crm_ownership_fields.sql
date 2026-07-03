insert into public.organizations (name, slug)
values ('Default Organization', 'default')
on conflict (slug) do nothing;

alter table public.schools
  add column organization_id uuid references public.organizations(id),
  add column created_by uuid references auth.users(id) on delete set null,
  add column updated_by uuid references auth.users(id) on delete set null,
  add column assigned_to uuid references auth.users(id) on delete set null;

alter table public.contacts
  add column organization_id uuid references public.organizations(id),
  add column created_by uuid references auth.users(id) on delete set null,
  add column updated_by uuid references auth.users(id) on delete set null;

alter table public.outreach
  add column organization_id uuid references public.organizations(id),
  add column created_by uuid references auth.users(id) on delete set null,
  add column updated_by uuid references auth.users(id) on delete set null,
  add column assigned_to uuid references auth.users(id) on delete set null;

alter table public.interviews
  add column organization_id uuid references public.organizations(id),
  add column created_by uuid references auth.users(id) on delete set null,
  add column updated_by uuid references auth.users(id) on delete set null;

alter table public.follow_ups
  add column organization_id uuid references public.organizations(id),
  add column created_by uuid references auth.users(id) on delete set null,
  add column updated_by uuid references auth.users(id) on delete set null,
  add column assigned_to uuid references auth.users(id) on delete set null;

update public.schools
set organization_id = (select id from public.organizations where slug = 'default')
where organization_id is null;

update public.contacts
set organization_id = schools.organization_id
from public.schools
where contacts.school_id = schools.id
  and contacts.organization_id is null;

update public.outreach
set organization_id = schools.organization_id
from public.schools
where outreach.school_id = schools.id
  and outreach.organization_id is null;

update public.interviews
set organization_id = schools.organization_id
from public.schools
where interviews.school_id = schools.id
  and interviews.organization_id is null;

update public.follow_ups
set organization_id = schools.organization_id
from public.schools
where follow_ups.school_id = schools.id
  and follow_ups.organization_id is null;

alter table public.schools
  alter column organization_id set not null;

alter table public.contacts
  alter column organization_id set not null;

alter table public.outreach
  alter column organization_id set not null;

alter table public.interviews
  alter column organization_id set not null;

alter table public.follow_ups
  alter column organization_id set not null;

create index schools_organization_id_idx on public.schools(organization_id);
create index contacts_organization_id_idx on public.contacts(organization_id);
create index outreach_organization_id_idx on public.outreach(organization_id);
create index interviews_organization_id_idx on public.interviews(organization_id);
create index follow_ups_organization_id_idx on public.follow_ups(organization_id);
