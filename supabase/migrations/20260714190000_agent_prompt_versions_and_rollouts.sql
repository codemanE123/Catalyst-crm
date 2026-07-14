-- Phase 4.11: agent prompt versions and controlled rollouts

create table if not exists public.agent_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  prompt_key text not null,
  version text not null,
  agent_name text not null,
  status text not null default 'draft',
  description text,
  system_prompt text not null,
  user_prompt_template text not null,
  output_schema_version text not null,
  provider text not null,
  model text not null,
  temperature numeric(4, 3) not null default 0.200,
  max_output_tokens integer not null,
  safety_policy_version text not null,
  change_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deprecated_at timestamptz,
  constraint agent_prompt_versions_status_check
    check (status in ('draft', 'active', 'deprecated', 'archived')),
  constraint agent_prompt_versions_prompt_key_check
    check (char_length(prompt_key) between 1 and 120),
  constraint agent_prompt_versions_version_check
    check (char_length(version) between 1 and 64),
  constraint agent_prompt_versions_template_length_check
    check (
      char_length(system_prompt) + char_length(user_prompt_template) <= 100000
    ),
  constraint agent_prompt_versions_max_tokens_check
    check (max_output_tokens > 0 and max_output_tokens <= 16000),
  constraint agent_prompt_versions_temperature_check
    check (temperature >= 0 and temperature <= 2)
);

-- Unique key+version per org scope (null org = global)
create unique index if not exists agent_prompt_versions_key_version_scope_uidx
  on public.agent_prompt_versions (
    prompt_key,
    version,
    (coalesce(organization_id::text, ''))
  );

-- Only one active version per prompt_key + org scope
create unique index if not exists agent_prompt_versions_one_active_scope_uidx
  on public.agent_prompt_versions (
    prompt_key,
    (coalesce(organization_id::text, ''))
  )
  where status = 'active';

create index if not exists agent_prompt_versions_prompt_key_idx
  on public.agent_prompt_versions(prompt_key);

create index if not exists agent_prompt_versions_agent_name_idx
  on public.agent_prompt_versions(agent_name);

create index if not exists agent_prompt_versions_status_idx
  on public.agent_prompt_versions(status);

create index if not exists agent_prompt_versions_organization_id_idx
  on public.agent_prompt_versions(organization_id);

create index if not exists agent_prompt_versions_created_at_idx
  on public.agent_prompt_versions(created_at desc);

-- Immutable content once leaving draft (except lifecycle timestamps/status)
create or replace function public.prevent_active_prompt_version_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if new.system_prompt is distinct from old.system_prompt
      or new.user_prompt_template is distinct from old.user_prompt_template
      or new.output_schema_version is distinct from old.output_schema_version
      or new.provider is distinct from old.provider
      or new.model is distinct from old.model
      or new.temperature is distinct from old.temperature
      or new.max_output_tokens is distinct from old.max_output_tokens
      or new.safety_policy_version is distinct from old.safety_policy_version
      or new.prompt_key is distinct from old.prompt_key
      or new.version is distinct from old.version
      or new.agent_name is distinct from old.agent_name
      or new.organization_id is distinct from old.organization_id
    then
      raise exception 'Activated prompt versions are immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agent_prompt_versions_immutable_active
  on public.agent_prompt_versions;

create trigger agent_prompt_versions_immutable_active
before update on public.agent_prompt_versions
for each row execute function public.prevent_active_prompt_version_mutation();

create table if not exists public.agent_rollouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  agent_name text not null,
  prompt_key text not null,
  control_prompt_version_id uuid not null
    references public.agent_prompt_versions(id) on delete restrict,
  treatment_prompt_version_id uuid not null
    references public.agent_prompt_versions(id) on delete restrict,
  rollout_type text not null,
  rollout_percentage integer not null default 0,
  status text not null default 'draft',
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agent_rollouts_status_check
    check (status in ('draft', 'active', 'paused', 'completed', 'cancelled')),
  constraint agent_rollouts_type_check
    check (
      rollout_type in (
        'percentage',
        'organization_allowlist',
        'user_allowlist',
        'fixed_control',
        'fixed_treatment'
      )
    ),
  constraint agent_rollouts_percentage_check
    check (rollout_percentage in (0, 10, 25, 50, 100))
);

create index if not exists agent_rollouts_organization_id_idx
  on public.agent_rollouts(organization_id);

create index if not exists agent_rollouts_status_idx
  on public.agent_rollouts(status);

create index if not exists agent_rollouts_prompt_key_idx
  on public.agent_rollouts(prompt_key);

create index if not exists agent_rollouts_agent_name_idx
  on public.agent_rollouts(agent_name);

create index if not exists agent_rollouts_created_at_idx
  on public.agent_rollouts(created_at desc);

-- At most one active rollout per prompt_key + scope
create unique index if not exists agent_rollouts_one_active_scope_uidx
  on public.agent_rollouts (
    prompt_key,
    (coalesce(organization_id::text, ''))
  )
  where status = 'active';

alter table public.agent_prompt_versions enable row level security;
alter table public.agent_rollouts enable row level security;

-- Helper: org admin (or super_admin)
create or replace function public.can_manage_org_prompts(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or (
      org_id is not null
      and exists (
        select 1
        from public.organization_members om
        where om.organization_id = org_id
          and om.user_id = auth.uid()
          and om.role = 'admin'
      )
    );
$$;

revoke all on function public.can_manage_org_prompts(uuid) from public;
grant execute on function public.can_manage_org_prompts(uuid) to authenticated;

-- Prompt versions SELECT:
-- global readable by users with any mutation-capable membership (sales+) or super_admin
-- org-specific only by org members with access
create policy "Prompt versions select scoped"
on public.agent_prompt_versions for select
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id is null
    and exists (
      select 1
      from public.organization_members om
      where om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
  or (
    organization_id is not null
    and public.has_org_access(organization_id)
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = agent_prompt_versions.organization_id
        and om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
);

-- INSERT: global = super_admin; org = admin of that org
create policy "Prompt versions insert managed"
on public.agent_prompt_versions for insert
to authenticated
with check (
  (
    organization_id is null
    and public.is_super_admin()
  )
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
);

create policy "Prompt versions update managed"
on public.agent_prompt_versions for update
to authenticated
using (
  (
    organization_id is null
    and public.is_super_admin()
  )
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
)
with check (
  (
    organization_id is null
    and public.is_super_admin()
  )
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
);

-- No delete policy: archive instead (read_only and sales cannot modify)

create policy "Rollouts select scoped"
on public.agent_rollouts for select
to authenticated
using (
  public.is_super_admin()
  or (
    organization_id is null
    and exists (
      select 1
      from public.organization_members om
      where om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
  or (
    organization_id is not null
    and public.has_org_access(organization_id)
    and exists (
      select 1
      from public.organization_members om
      where om.organization_id = agent_rollouts.organization_id
        and om.user_id = auth.uid()
        and om.role in ('sales', 'admin', 'super_admin')
    )
  )
);

create policy "Rollouts insert managed"
on public.agent_rollouts for insert
to authenticated
with check (
  (
    organization_id is null
    and public.is_super_admin()
  )
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
);

create policy "Rollouts update managed"
on public.agent_rollouts for update
to authenticated
using (
  (
    organization_id is null
    and public.is_super_admin()
  )
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
)
with check (
  (
    organization_id is null
    and public.is_super_admin()
  )
  or (
    organization_id is not null
    and public.can_manage_org_prompts(organization_id)
  )
);
