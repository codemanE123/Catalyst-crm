-- Phase 4.7: retry/backoff fields + atomic claim helpers for agent executions

alter table public.agent_executions
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_error_code text;

alter table public.agent_executions
  drop constraint if exists agent_executions_max_attempts_check;

alter table public.agent_executions
  add constraint agent_executions_max_attempts_check
  check (max_attempts >= 1 and max_attempts <= 10);

create index if not exists agent_executions_queued_retry_idx
  on public.agent_executions (status, next_retry_at, created_at)
  where status = 'queued';

create index if not exists agent_executions_running_started_idx
  on public.agent_executions (status, started_at)
  where status = 'running';

create or replace function public.recover_stale_agent_executions(
  p_stale_after_minutes integer default 15
)
returns setof public.agent_executions
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.agent_executions
  set
    status = 'queued',
    next_retry_at = now(),
    started_at = null,
    error_message = coalesce(error_message, 'Recovered stale running execution.'),
    last_error_code = coalesce(last_error_code, 'stale_running'),
    updated_at = now()
  where status = 'running'
    and started_at is not null
    and started_at < now() - make_interval(mins => greatest(p_stale_after_minutes, 1))
  returning *;
end;
$$;

create or replace function public.claim_next_agent_executions(
  p_limit integer default 5
)
returns setof public.agent_executions
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_limit integer := greatest(1, least(coalesce(p_limit, 5), 25));
begin
  return query
  with candidates as (
    select e.id
    from public.agent_executions e
    left join public.agent_executions d
      on d.id = e.depends_on_execution_id
    where e.status = 'queued'
      and (e.next_retry_at is null or e.next_retry_at <= now())
      and (
        e.depends_on_execution_id is null
        or d.status = 'completed'
      )
    order by e.created_at asc, e.id asc
    for update of e skip locked
    limit claim_limit
  )
  update public.agent_executions e
  set
    status = 'running',
    started_at = now(),
    attempt_count = e.attempt_count + 1,
    error_message = null,
    updated_at = now()
  from candidates c
  where e.id = c.id
  returning e.*;
end;
$$;

revoke all on function public.recover_stale_agent_executions(integer) from public;
revoke all on function public.claim_next_agent_executions(integer) from public;
grant execute on function public.recover_stale_agent_executions(integer) to service_role;
grant execute on function public.claim_next_agent_executions(integer) to service_role;
