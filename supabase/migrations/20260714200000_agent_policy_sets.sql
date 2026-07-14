-- Phase 4.12: agent policy sets and configuration values

create table if not exists public.agent_policy_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  version text not null,
  status text not null default 'draft',
  description text,
  change_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  deprecated_at timestamptz,
  constraint agent_policy_sets_status_check
    check (status in ('draft', 'active', 'deprecated', 'archived')),
  constraint agent_policy_sets_name_check
    check (char_length(name) between 1 and 120),
  constraint agent_policy_sets_version_check
    check (char_length(version) between 1 and 64)
);

create unique index if not exists agent_policy_sets_version_scope_uidx
  on public.agent_policy_sets (
    version,
    (coalesce(organization_id::text, ''))
  );

create unique index if not exists agent_policy_sets_one_active_scope_uidx
  on public.agent_policy_sets (
    (coalesce(organization_id::text, ''))
  )
  where status = 'active';

create index if not exists agent_policy_sets_organization_id_idx
  on public.agent_policy_sets(organization_id);

create index if not exists agent_policy_sets_status_idx
  on public.agent_policy_sets(status);

create index if not exists agent_policy_sets_version_idx
  on public.agent_policy_sets(version);

create index if not exists agent_policy_sets_created_at_idx
  on public.agent_policy_sets(created_at desc);

create trigger agent_policy_sets_set_updated_at
before update on public.agent_policy_sets
for each row execute function public.set_updated_at();

-- Immutable content for non-draft policy sets (status/timestamps only)
create or replace function public.prevent_active_policy_set_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if new.name is distinct from old.name
      or new.version is distinct from old.version
      or new.organization_id is distinct from old.organization_id
      or new.description is distinct from old.description
    then
      raise exception 'Activated policy sets are immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agent_policy_sets_immutable_active on public.agent_policy_sets;
create trigger agent_policy_sets_immutable_active
before update on public.agent_policy_sets
for each row execute function public.prevent_active_policy_set_mutation();

create table if not exists public.agent_policy_values (
  id uuid primary key default gen_random_uuid(),
  policy_set_id uuid not null
    references public.agent_policy_sets(id) on delete cascade,
  policy_key text not null,
  value_json jsonb not null,
  value_type text not null,
  source text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_policy_values_type_check
    check (
      value_type in (
        'boolean',
        'integer',
        'decimal',
        'string',
        'string_array',
        'json'
      )
    ),
  constraint agent_policy_values_source_check
    check (
      source in (
        'system_default',
        'global_override',
        'organization_override'
      )
    ),
  constraint agent_policy_values_key_check
    check (char_length(policy_key) between 1 and 120)
);

create unique index if not exists agent_policy_values_set_key_uidx
  on public.agent_policy_values(policy_set_id, policy_key);

create index if not exists agent_policy_values_policy_set_id_idx
  on public.agent_policy_values(policy_set_id);

create index if not exists agent_policy_values_policy_key_idx
  on public.agent_policy_values(policy_key);

create index if not exists agent_policy_values_created_at_idx
  on public.agent_policy_values(created_at desc);

create trigger agent_policy_values_set_updated_at
before update on public.agent_policy_values
for each row execute function public.set_updated_at();

-- Block value mutation when parent set is not draft
create or replace function public.prevent_policy_value_mutation_outside_draft()
returns trigger
language plpgsql
as $$
declare
  parent_status text;
begin
  select status into parent_status
  from public.agent_policy_sets
  where id = coalesce(new.policy_set_id, old.policy_set_id);

  if parent_status is distinct from 'draft' then
    raise exception 'Policy values are immutable when the policy set is not draft';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists agent_policy_values_draft_only on public.agent_policy_values;
create trigger agent_policy_values_draft_only
before insert or update or delete on public.agent_policy_values
for each row execute function public.prevent_policy_value_mutation_outside_draft();

create table if not exists public.agent_policy_break_glass (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  policy_key text not null,
  reason text not null,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expired_at timestamptz,
  constraint agent_policy_break_glass_reason_check
    check (char_length(reason) >= 20),
  constraint agent_policy_break_glass_key_check
    check (char_length(policy_key) between 1 and 120)
);

create index if not exists agent_policy_break_glass_org_idx
  on public.agent_policy_break_glass(organization_id);

create index if not exists agent_policy_break_glass_expires_idx
  on public.agent_policy_break_glass(expires_at);

alter table public.agent_policy_sets enable row level security;
alter table public.agent_policy_values enable row level security;
alter table public.agent_policy_break_glass enable row level security;

-- Reuse can_manage_org_prompts for admin management of org policies

create policy "Policy sets select scoped"
on public.agent_policy_sets for select
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id is null
    and exists (
      select 1 from public.organization_members om
      where om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
  or (
    organization_id is not null
    and public.has_org_access(organization_id)
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = agent_policy_sets.organization_id
        and om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
);

create policy "Policy sets insert managed"
on public.agent_policy_sets for insert
to authenticated
with check (
  (organization_id is null and public.is_super_admin())
  or (organization_id is not null and public.can_manage_org_prompts(organization_id))
);

create policy "Policy sets update managed"
on public.agent_policy_sets for update
to authenticated
using (
  (organization_id is null and public.is_super_admin())
  or (organization_id is not null and public.can_manage_org_prompts(organization_id))
)
with check (
  (organization_id is null and public.is_super_admin())
  or (organization_id is not null and public.can_manage_org_prompts(organization_id))
);

create policy "Policy values select via set"
on public.agent_policy_values for select
to authenticated
using (
  exists (
    select 1 from public.agent_policy_sets ps
    where ps.id = agent_policy_values.policy_set_id
      and (
        public.is_super_admin()
        or (
          ps.organization_id is null
          and exists (
            select 1 from public.organization_members om
            where om.user_id = auth.uid()
              and om.role in ('sales', 'admin', 'super_admin')
          )
        )
        or (
          ps.organization_id is not null
          and public.has_org_access(ps.organization_id)
          and exists (
            select 1 from public.organization_members om
            where om.organization_id = ps.organization_id
              and om.user_id = auth.uid()
              and om.role in ('sales', 'admin', 'super_admin')
          )
        )
      )
  )
);

create policy "Policy values write via set manage"
on public.agent_policy_values for insert
to authenticated
with check (
  exists (
    select 1 from public.agent_policy_sets ps
    where ps.id = policy_set_id
      and ps.status = 'draft'
      and (
        (ps.organization_id is null and public.is_super_admin())
        or (
          ps.organization_id is not null
          and public.can_manage_org_prompts(ps.organization_id)
        )
      )
  )
);

create policy "Policy values update via set manage"
on public.agent_policy_values for update
to authenticated
using (
  exists (
    select 1 from public.agent_policy_sets ps
    where ps.id = policy_set_id
      and (
        (ps.organization_id is null and public.is_super_admin())
        or (
          ps.organization_id is not null
          and public.can_manage_org_prompts(ps.organization_id)
        )
      )
  )
)
with check (
  exists (
    select 1 from public.agent_policy_sets ps
    where ps.id = policy_set_id
      and ps.status = 'draft'
      and (
        (ps.organization_id is null and public.is_super_admin())
        or (
          ps.organization_id is not null
          and public.can_manage_org_prompts(ps.organization_id)
        )
      )
  )
);

create policy "Break glass select super admin"
on public.agent_policy_break_glass for select
to authenticated
using (public.is_super_admin());

create policy "Break glass insert super admin"
on public.agent_policy_break_glass for insert
to authenticated
with check (public.is_super_admin() and created_by = auth.uid());

create policy "Break glass update super admin"
on public.agent_policy_break_glass for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());
