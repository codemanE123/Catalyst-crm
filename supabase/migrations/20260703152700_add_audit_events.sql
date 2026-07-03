create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_table text not null,
  record_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_organization_id_idx
  on public.audit_events(organization_id, created_at desc);

create index audit_events_actor_user_id_idx
  on public.audit_events(actor_user_id, created_at desc);

create index audit_events_action_idx
  on public.audit_events(action, created_at desc);

alter table public.audit_events enable row level security;

create policy "Users can insert audit events as actor"
on public.audit_events for insert
to authenticated
with check (actor_user_id = auth.uid());

create policy "Org members can read audit events"
on public.audit_events for select
to authenticated
using (
  organization_id is null
  or public.has_org_access(organization_id)
);
