-- Partners (corporate / industry) + optional school contacts + membership invites

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  partner_type text not null default 'Other',
  website text,
  industry text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partners_name_len_check
    check (char_length(name) <= 200),
  constraint partners_type_check
    check (partner_type in ('Corporate', 'Industry partner', 'Other')),
  constraint partners_website_len_check
    check (website is null or char_length(website) <= 500),
  constraint partners_industry_len_check
    check (industry is null or char_length(industry) <= 120),
  constraint partners_notes_len_check
    check (notes is null or char_length(notes) <= 4000)
);

create index if not exists partners_organization_id_idx
  on public.partners(organization_id);

create index if not exists partners_org_name_idx
  on public.partners(organization_id, name);

drop trigger if exists partners_set_updated_at on public.partners;
create trigger partners_set_updated_at
before update on public.partners
for each row execute function public.set_updated_at();

alter table public.partners enable row level security;

drop policy if exists partners_select on public.partners;
create policy partners_select
  on public.partners
  for select
  to authenticated
  using (public.has_org_access(organization_id));

drop policy if exists partners_insert on public.partners;
create policy partners_insert
  on public.partners
  for insert
  to authenticated
  with check (public.can_write_org(organization_id));

drop policy if exists partners_update on public.partners;
create policy partners_update
  on public.partners
  for update
  to authenticated
  using (public.can_write_org(organization_id))
  with check (public.can_write_org(organization_id));

drop policy if exists partners_delete on public.partners;
create policy partners_delete
  on public.partners
  for delete
  to authenticated
  using (public.can_manage_org(organization_id));

-- Contacts may belong to a school OR a partner (not both)
alter table public.contacts
  alter column school_id drop not null;

alter table public.contacts
  add column if not exists partner_id uuid references public.partners(id) on delete cascade;

alter table public.contacts
  add column if not exists linkedin_url text;

alter table public.contacts
  drop constraint if exists contacts_affiliation_check;

alter table public.contacts
  add constraint contacts_affiliation_check
  check (
    (school_id is not null and partner_id is null)
    or (school_id is null and partner_id is not null)
  );

alter table public.contacts
  drop constraint if exists contacts_linkedin_len_check;

alter table public.contacts
  add constraint contacts_linkedin_len_check
  check (linkedin_url is null or char_length(linkedin_url) <= 500);

create index if not exists contacts_partner_id_idx
  on public.contacts(partner_id);

-- Extra school associations (mainly for partner contacts)
create table if not exists public.contact_linked_schools (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id, school_id)
);

create index if not exists contact_linked_schools_school_idx
  on public.contact_linked_schools(school_id);

alter table public.contact_linked_schools enable row level security;

drop policy if exists contact_linked_schools_select on public.contact_linked_schools;
create policy contact_linked_schools_select
  on public.contact_linked_schools
  for select
  to authenticated
  using (public.has_org_access(organization_id));

drop policy if exists contact_linked_schools_write on public.contact_linked_schools;
create policy contact_linked_schools_write
  on public.contact_linked_schools
  for all
  to authenticated
  using (public.can_write_org(organization_id))
  with check (public.can_write_org(organization_id));

-- Team invite links (hashed token; raw token shown once)
create table if not exists public.membership_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null,
  role public.app_role not null default 'sales',
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  max_uses integer not null default 25,
  use_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint membership_invites_token_hash_unique unique (token_hash),
  constraint membership_invites_role_check
    check (role in ('sales', 'read_only', 'admin')),
  constraint membership_invites_max_uses_check
    check (max_uses > 0 and max_uses <= 500),
  constraint membership_invites_use_count_check
    check (use_count >= 0 and use_count <= max_uses)
);

create index if not exists membership_invites_org_created_idx
  on public.membership_invites(organization_id, created_at desc);

alter table public.membership_invites enable row level security;

drop policy if exists membership_invites_select on public.membership_invites;
create policy membership_invites_select
  on public.membership_invites
  for select
  to authenticated
  using (
    public.can_manage_org(organization_id)
    or public.is_super_admin()
  );

drop policy if exists membership_invites_insert on public.membership_invites;
create policy membership_invites_insert
  on public.membership_invites
  for insert
  to authenticated
  with check (
    public.can_manage_org(organization_id)
    or public.is_super_admin()
  );

drop policy if exists membership_invites_update on public.membership_invites;
create policy membership_invites_update
  on public.membership_invites
  for update
  to authenticated
  using (
    public.can_manage_org(organization_id)
    or public.is_super_admin()
  )
  with check (
    public.can_manage_org(organization_id)
    or public.is_super_admin()
  );
