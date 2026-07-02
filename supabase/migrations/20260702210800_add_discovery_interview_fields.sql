alter table public.interviews
  add column pain_points text,
  add column current_tools text,
  add column budget_owner text,
  add column objections text,
  add column pilot_interest text
    check (
      pilot_interest is null
      or pilot_interest in ('High', 'Medium', 'Low', 'None')
    ),
  add column referrals text,
  add column next_step text;
