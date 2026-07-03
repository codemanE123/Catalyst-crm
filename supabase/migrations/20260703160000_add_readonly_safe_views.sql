-- Phase 2 Task 2.1A: read-only safe views (schema only).
-- Restricted interview and follow-up columns are omitted from column list.
-- Application routing to these views is a separate task (2.1B).

create view public.interviews_readonly
with (security_invoker = true)
as
select
  id,
  school_id,
  contact_id,
  organization_id,
  interviewer,
  interview_date,
  sentiment,
  notes,
  follow_up,
  pain_points,
  current_tools,
  buyer,
  pilot_interest,
  referrals,
  next_step,
  created_by,
  updated_by,
  created_at,
  updated_at
from public.interviews;

create view public.follow_ups_readonly
with (security_invoker = true)
as
select
  id,
  school_id,
  contact_id,
  outreach_id,
  interview_id,
  organization_id,
  title,
  due_date,
  status,
  owner,
  completed_at,
  created_by,
  updated_by,
  assigned_to,
  created_at,
  updated_at
from public.follow_ups;

comment on view public.interviews_readonly is
  'Read-only safe interview projection; omits raw_notes, budget, budget_owner, objections.';

comment on view public.follow_ups_readonly is
  'Read-only safe follow-up projection; omits sensitive notes.';

grant select on public.interviews_readonly to authenticated;
grant select on public.follow_ups_readonly to authenticated;
