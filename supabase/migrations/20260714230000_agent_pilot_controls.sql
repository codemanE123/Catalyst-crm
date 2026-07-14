-- Phase 5.5: limited production agent pilot controls

create table if not exists public.agent_pilot_settings (
  id text primary key default 'default',
  enabled boolean not null default false,
  kill_switch boolean not null default false,
  max_organizations integer not null default 3,
  max_users integer not null default 15,
  max_daily_jobs integer not null default 50,
  max_daily_spend_usd numeric(12, 4) not null default 25,
  max_candidate_batch_size integer not null default 25,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint agent_pilot_settings_singleton_check check (id = 'default'),
  constraint agent_pilot_settings_max_orgs_check
    check (max_organizations between 1 and 1000),
  constraint agent_pilot_settings_max_users_check
    check (max_users between 1 and 10000),
  constraint agent_pilot_settings_max_jobs_check
    check (max_daily_jobs between 1 and 100000),
  constraint agent_pilot_settings_max_spend_check
    check (max_daily_spend_usd >= 0),
  constraint agent_pilot_settings_max_batch_check
    check (max_candidate_batch_size between 1 and 500)
);

insert into public.agent_pilot_settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.agent_pilot_organization_allowlist (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null default 'enabled',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint agent_pilot_org_status_check
    check (status in ('enabled', 'disabled')),
  constraint agent_pilot_org_notes_check
    check (notes is null or char_length(notes) <= 500)
);

create index if not exists agent_pilot_org_allowlist_status_idx
  on public.agent_pilot_organization_allowlist(status);

create table if not exists public.agent_pilot_user_allowlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null default 'enabled',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  primary key (user_id, organization_id),
  constraint agent_pilot_user_status_check
    check (status in ('enabled', 'disabled')),
  constraint agent_pilot_user_notes_check
    check (notes is null or char_length(notes) <= 500)
);

create index if not exists agent_pilot_user_allowlist_org_idx
  on public.agent_pilot_user_allowlist(organization_id);

create index if not exists agent_pilot_user_allowlist_status_idx
  on public.agent_pilot_user_allowlist(status);

drop trigger if exists set_agent_pilot_settings_updated_at on public.agent_pilot_settings;
create trigger set_agent_pilot_settings_updated_at
  before update on public.agent_pilot_settings
  for each row execute function public.set_updated_at();

drop trigger if exists set_agent_pilot_org_allowlist_updated_at
  on public.agent_pilot_organization_allowlist;
create trigger set_agent_pilot_org_allowlist_updated_at
  before update on public.agent_pilot_organization_allowlist
  for each row execute function public.set_updated_at();

drop trigger if exists set_agent_pilot_user_allowlist_updated_at
  on public.agent_pilot_user_allowlist;
create trigger set_agent_pilot_user_allowlist_updated_at
  before update on public.agent_pilot_user_allowlist
  for each row execute function public.set_updated_at();

alter table public.agent_pilot_settings enable row level security;
alter table public.agent_pilot_organization_allowlist enable row level security;
alter table public.agent_pilot_user_allowlist enable row level security;

-- Authenticated reads; super_admin writes for enable/disable and allowlists.
drop policy if exists agent_pilot_settings_select on public.agent_pilot_settings;
create policy agent_pilot_settings_select
  on public.agent_pilot_settings
  for select
  to authenticated
  using (true);

drop policy if exists agent_pilot_settings_update on public.agent_pilot_settings;
create policy agent_pilot_settings_update
  on public.agent_pilot_settings
  for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists agent_pilot_org_allowlist_select
  on public.agent_pilot_organization_allowlist;
create policy agent_pilot_org_allowlist_select
  on public.agent_pilot_organization_allowlist
  for select
  to authenticated
  using (
    public.is_super_admin()
    or organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists agent_pilot_org_allowlist_write
  on public.agent_pilot_organization_allowlist;
create policy agent_pilot_org_allowlist_write
  on public.agent_pilot_organization_allowlist
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists agent_pilot_user_allowlist_select
  on public.agent_pilot_user_allowlist;
create policy agent_pilot_user_allowlist_select
  on public.agent_pilot_user_allowlist
  for select
  to authenticated
  using (
    public.is_super_admin()
    or organization_id in (
      select organization_id from public.organization_members
      where user_id = auth.uid()
    )
  );

drop policy if exists agent_pilot_user_allowlist_write
  on public.agent_pilot_user_allowlist;
create policy agent_pilot_user_allowlist_write
  on public.agent_pilot_user_allowlist
  for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
