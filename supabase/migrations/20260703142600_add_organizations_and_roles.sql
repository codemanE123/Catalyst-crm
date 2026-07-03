create type public.app_role as enum (
  'super_admin',
  'admin',
  'sales',
  'read_only'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'read_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx
  on public.organization_members(user_id);

create index organization_members_organization_id_idx
  on public.organization_members(organization_id);

create trigger set_organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger set_organization_members_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

create policy "Members can read organizations they belong to"
on public.organizations for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = organizations.id
      and om.user_id = auth.uid()
  )
);

create policy "Users can read their organization memberships"
on public.organization_members for select
to authenticated
using (user_id = auth.uid());
