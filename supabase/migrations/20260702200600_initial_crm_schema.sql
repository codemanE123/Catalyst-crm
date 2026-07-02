create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text,
  location text,
  status text not null default 'Prospect'
    check (status in ('Prospect', 'Contacted', 'Interviewing', 'Partner')),
  owner text,
  next_step text,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, district)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  relationship text not null default 'New'
    check (relationship in ('New', 'Warm', 'Champion', 'Needs follow-up')),
  last_touch date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outreach (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null
    check (channel in ('Email', 'Call', 'Meeting', 'LinkedIn', 'Event', 'Other')),
  subject text,
  message text,
  outcome text,
  outreach_date date not null default current_date,
  owner text,
  next_step text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  interviewer text not null,
  interview_date date not null,
  sentiment text not null
    check (sentiment in ('Strong fit', 'Warm', 'Needs nurturing', 'Not a fit')),
  notes text not null,
  follow_up text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  outreach_id uuid references public.outreach(id) on delete set null,
  interview_id uuid references public.interviews(id) on delete set null,
  title text not null,
  due_date date,
  status text not null default 'Open'
    check (status in ('Open', 'Scheduled', 'Done', 'Blocked')),
  owner text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_school_id_idx on public.contacts(school_id);
create index contacts_last_touch_idx on public.contacts(last_touch desc);
create index outreach_school_id_idx on public.outreach(school_id);
create index outreach_contact_id_idx on public.outreach(contact_id);
create index outreach_date_idx on public.outreach(outreach_date desc);
create index interviews_school_id_idx on public.interviews(school_id);
create index interviews_contact_id_idx on public.interviews(contact_id);
create index interviews_date_idx on public.interviews(interview_date desc);
create index follow_ups_school_id_idx on public.follow_ups(school_id);
create index follow_ups_contact_id_idx on public.follow_ups(contact_id);
create index follow_ups_due_date_idx on public.follow_ups(due_date);
create index follow_ups_status_idx on public.follow_ups(status);

create trigger set_schools_updated_at
before update on public.schools
for each row execute function public.set_updated_at();

create trigger set_contacts_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create trigger set_outreach_updated_at
before update on public.outreach
for each row execute function public.set_updated_at();

create trigger set_interviews_updated_at
before update on public.interviews
for each row execute function public.set_updated_at();

create trigger set_follow_ups_updated_at
before update on public.follow_ups
for each row execute function public.set_updated_at();

alter table public.schools enable row level security;
alter table public.contacts enable row level security;
alter table public.outreach enable row level security;
alter table public.interviews enable row level security;
alter table public.follow_ups enable row level security;

create policy "Authenticated users can read schools"
on public.schools for select
to authenticated
using (true);

create policy "Authenticated users can manage schools"
on public.schools for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read contacts"
on public.contacts for select
to authenticated
using (true);

create policy "Authenticated users can manage contacts"
on public.contacts for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read outreach"
on public.outreach for select
to authenticated
using (true);

create policy "Authenticated users can manage outreach"
on public.outreach for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read interviews"
on public.interviews for select
to authenticated
using (true);

create policy "Authenticated users can manage interviews"
on public.interviews for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users can read follow ups"
on public.follow_ups for select
to authenticated
using (true);

create policy "Authenticated users can manage follow ups"
on public.follow_ups for all
to authenticated
using (true)
with check (true);
