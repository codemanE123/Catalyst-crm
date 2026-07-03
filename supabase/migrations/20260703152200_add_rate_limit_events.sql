create table public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_key text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx
  on public.rate_limit_events(user_id, action_key, created_at desc);

alter table public.rate_limit_events enable row level security;

create policy "Users can insert own rate limit events"
on public.rate_limit_events for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can read own rate limit events"
on public.rate_limit_events for select
to authenticated
using (user_id = auth.uid());
