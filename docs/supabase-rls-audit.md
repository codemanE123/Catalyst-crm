# Supabase Database Design and RLS Audit

Scope: Documentation-only audit of the current Supabase schema and Row Level Security strategy.

## Executive summary

The current schema has a solid prototype foundation: five core CRM tables, foreign keys, indexes, timestamps, and RLS enabled. The critical gap is ownership. There are no `user_id`, `organization_id`, team membership, or role columns, and every current RLS policy grants all authenticated users global read/write access. In a production CRM, this would allow one authenticated user to see and change every other user's schools, contacts, outreach, interviews, and follow-ups.

## Current tables

### `schools`

- Purpose: Primary CRM account record.
- Key fields: `id`, `name`, `district`, `location`, `status`, `owner`, `next_step`, `website`, `notes`, timestamps.
- Added research fields: `enrollment`, `public_private`, `hbcu`, `community_college`, `state`, program/center/office fields, `profile_sources`.
- Current uniqueness: `(name, district)`.
- RLS: Enabled.
- Current policy problem: any authenticated user can read/manage all rows.

### `contacts`

- Purpose: People associated with a school.
- Key relationship: `school_id references schools(id) on delete cascade`.
- Optional fields: role, email, phone, relationship, last touch, notes.
- RLS: Enabled.
- Current policy problem: any authenticated user can read/manage all rows.

### `outreach`

- Purpose: Outreach activity history.
- Key relationships:
  - `school_id references schools(id) on delete cascade`
  - `contact_id references contacts(id) on delete set null`
- RLS: Enabled.
- Current policy problem: any authenticated user can read/manage all rows.

### `interviews`

- Purpose: Discovery/interview notes and AI-summary fields.
- Key relationships:
  - `school_id references schools(id) on delete cascade`
  - `contact_id references contacts(id) on delete set null`
- RLS: Enabled.
- Current policy problem: any authenticated user can read/manage all rows.

### `follow_ups`

- Purpose: Next actions tied to schools, contacts, outreach, or interviews.
- Key relationships:
  - `school_id references schools(id) on delete cascade`
  - `contact_id references contacts(id) on delete set null`
  - `outreach_id references outreach(id) on delete set null`
  - `interview_id references interviews(id) on delete set null`
- RLS: Enabled.
- Current policy problem: any authenticated user can read/manage all rows.

## Relationships and foreign keys

Current relationship model:

```text
schools
├── contacts.school_id
├── outreach.school_id
├── interviews.school_id
└── follow_ups.school_id

contacts
├── outreach.contact_id
├── interviews.contact_id
└── follow_ups.contact_id

outreach
└── follow_ups.outreach_id

interviews
└── follow_ups.interview_id
```

Strengths:

- Child records cascade when a school is deleted.
- Optional references use `on delete set null`, which preserves historical records when contacts/outreach/interviews are removed.
- Indexes exist on high-use foreign keys and timeline fields.

Concerns:

- No ownership columns exist on parent or child tables.
- No team/organization table exists.
- No role table exists.
- `owner` fields are free-form text, not foreign keys to users.
- Research/profile source data is embedded on `schools`, not normalized.

## Index review

Current indexes:

- `contacts(school_id)`
- `contacts(last_touch desc)`
- `outreach(school_id)`
- `outreach(contact_id)`
- `outreach(outreach_date desc)`
- `interviews(school_id)`
- `interviews(contact_id)`
- `interviews(interview_date desc)`
- `follow_ups(school_id)`
- `follow_ups(contact_id)`
- `follow_ups(due_date)`
- `follow_ups(status)`

Recommended additional indexes after ownership is added:

```sql
create index schools_organization_id_idx on public.schools(organization_id);
create index schools_created_by_idx on public.schools(created_by);
create index organization_members_user_id_idx on public.organization_members(user_id);
create index organization_members_org_role_idx on public.organization_members(organization_id, role);
create index contacts_school_org_idx on public.contacts(school_id);
create index outreach_school_org_idx on public.outreach(school_id);
create index interviews_school_org_idx on public.interviews(school_id);
create index follow_ups_school_org_idx on public.follow_ups(school_id);
```

If high-volume filtering by organization is common, child tables should also include denormalized `organization_id` with FK consistency triggers or app-enforced consistency.

## User ownership fields

Current state:

- Missing.
- No table has `created_by`, `updated_by`, `assigned_to`, or `user_id`.
- Current `owner` is plain text and cannot enforce access.

Recommended fields:

```sql
alter table public.schools
  add column organization_id uuid not null references public.organizations(id),
  add column created_by uuid not null references auth.users(id),
  add column updated_by uuid references auth.users(id),
  add column assigned_to uuid references auth.users(id);

alter table public.contacts
  add column created_by uuid not null references auth.users(id),
  add column updated_by uuid references auth.users(id);

alter table public.outreach
  add column created_by uuid not null references auth.users(id),
  add column updated_by uuid references auth.users(id);

alter table public.interviews
  add column created_by uuid not null references auth.users(id),
  add column updated_by uuid references auth.users(id);

alter table public.follow_ups
  add column created_by uuid not null references auth.users(id),
  add column updated_by uuid references auth.users(id),
  add column assigned_to uuid references auth.users(id);
```

## Organization/team ownership fields

Current state:

- Missing.
- No team, organization, or membership model exists.

Recommended organization model:

```sql
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.organization_role as enum (
  'owner',
  'admin',
  'member',
  'viewer'
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
```

Recommended ownership strategy:

- `schools.organization_id` is the root ownership field.
- Child table access is inherited through `schools.organization_id`.
- `organization_members` determines whether `auth.uid()` can read/write rows.

## Role-based access

Recommended roles:

- `owner`: full organization access, member management, all CRM data.
- `admin`: full CRM data access, no owner transfer.
- `member`: create/update assigned or organization CRM data.
- `viewer`: read-only access.

Recommended helper functions:

```sql
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(
  org_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
      and om.role = any(allowed_roles)
  );
$$;

create or replace function public.school_org_id(school_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select s.organization_id
  from public.schools s
  where s.id = school_id;
$$;
```

Important: Review `security definer` helper functions carefully. Keep `search_path` fixed and avoid exposing helpers that return more data than needed.

## Tables missing RLS

Current core tables with RLS enabled:

- `schools`
- `contacts`
- `outreach`
- `interviews`
- `follow_ups`

No current core CRM table is missing RLS.

Future tables that must have RLS immediately:

- `organizations`
- `organization_members`
- Any audit log table.
- Any research source/evidence table.
- Any uploaded-file metadata table.

Recommended RLS enablement:

```sql
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
```

## Risks of users seeing other users' data

Current risk: Critical.

Reason:

- RLS policies use `to authenticated using (true)` and `with check (true)`.
- Any authenticated user can read all schools, contacts, outreach, interviews, and follow-ups.
- Any authenticated user can write all rows.
- There is no organization boundary.
- Service-role access in server code can bypass RLS entirely.

Impact examples:

- A user from Organization A can read Organization B's contacts.
- A user can view interview notes containing budgets, objections, buyer names, and next actions.
- A user can modify or delete another user's CRM data.
- A user can overwrite researched school profile fields.

## Admin access patterns

Recommended pattern:

- Avoid using `service_role` for normal user actions.
- Use authenticated user session clients for CRUD.
- Use `service_role` only for:
  - Background jobs.
  - Data migrations.
  - Admin-only maintenance endpoints.
  - Trusted server processes with explicit audit logs.

Recommended admin policy:

- App admins should still be scoped to an organization unless they are platform admins.
- Platform admin access should not be implemented with normal client paths.
- Every admin write should be logged.

Recommended platform admin table:

```sql
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
  );
$$;
```

Use platform admin checks sparingly and never as a replacement for organization-scoped policies.

## Recommended replacement RLS policies

The following SQL is a recommended starting point after adding `organizations`, `organization_members`, and ownership columns.

### Drop current broad policies

```sql
drop policy if exists "Authenticated users can read schools" on public.schools;
drop policy if exists "Authenticated users can manage schools" on public.schools;
drop policy if exists "Authenticated users can read contacts" on public.contacts;
drop policy if exists "Authenticated users can manage contacts" on public.contacts;
drop policy if exists "Authenticated users can read outreach" on public.outreach;
drop policy if exists "Authenticated users can manage outreach" on public.outreach;
drop policy if exists "Authenticated users can read interviews" on public.interviews;
drop policy if exists "Authenticated users can manage interviews" on public.interviews;
drop policy if exists "Authenticated users can read follow ups" on public.follow_ups;
drop policy if exists "Authenticated users can manage follow ups" on public.follow_ups;
```

### Organizations

```sql
create policy "Members can read their organizations"
on public.organizations
for select
to authenticated
using (public.is_org_member(id) or public.is_platform_admin());

create policy "Org owners can update organizations"
on public.organizations
for update
to authenticated
using (
  public.has_org_role(id, array['owner']::public.organization_role[])
  or public.is_platform_admin()
)
with check (
  public.has_org_role(id, array['owner']::public.organization_role[])
  or public.is_platform_admin()
);
```

### Organization members

```sql
create policy "Members can read org membership"
on public.organization_members
for select
to authenticated
using (
  public.is_org_member(organization_id)
  or public.is_platform_admin()
);

create policy "Owners and admins can manage org members"
on public.organization_members
for all
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'admin']::public.organization_role[]
  )
  or public.is_platform_admin()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'admin']::public.organization_role[]
  )
  or public.is_platform_admin()
);
```

### Schools

```sql
create policy "Org members can read schools"
on public.schools
for select
to authenticated
using (
  public.is_org_member(organization_id)
  or public.is_platform_admin()
);

create policy "Org members can create schools"
on public.schools
for insert
to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  and created_by = auth.uid()
  or public.is_platform_admin()
);

create policy "Org members can update schools"
on public.schools
for update
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or assigned_to = auth.uid()
  or public.is_platform_admin()
)
with check (
  public.has_org_role(
    organization_id,
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or assigned_to = auth.uid()
  or public.is_platform_admin()
);

create policy "Owners and admins can delete schools"
on public.schools
for delete
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner', 'admin']::public.organization_role[]
  )
  or public.is_platform_admin()
);
```

### Contacts

```sql
create policy "Org members can read contacts"
on public.contacts
for select
to authenticated
using (
  public.is_org_member(public.school_org_id(school_id))
  or public.is_platform_admin()
);

create policy "Org members can create contacts"
on public.contacts
for insert
to authenticated
with check (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  and created_by = auth.uid()
  or public.is_platform_admin()
);

create policy "Org members can update contacts"
on public.contacts
for update
to authenticated
using (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or public.is_platform_admin()
)
with check (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or public.is_platform_admin()
);

create policy "Owners and admins can delete contacts"
on public.contacts
for delete
to authenticated
using (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin']::public.organization_role[]
  )
  or public.is_platform_admin()
);
```

### Outreach

```sql
create policy "Org members can read outreach"
on public.outreach
for select
to authenticated
using (
  public.is_org_member(public.school_org_id(school_id))
  or public.is_platform_admin()
);

create policy "Org members can create outreach"
on public.outreach
for insert
to authenticated
with check (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  and created_by = auth.uid()
  or public.is_platform_admin()
);

create policy "Org members can update outreach"
on public.outreach
for update
to authenticated
using (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or public.is_platform_admin()
)
with check (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or public.is_platform_admin()
);

create policy "Owners and admins can delete outreach"
on public.outreach
for delete
to authenticated
using (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin']::public.organization_role[]
  )
  or public.is_platform_admin()
);
```

### Interviews

```sql
create policy "Org members can read interviews"
on public.interviews
for select
to authenticated
using (
  public.is_org_member(public.school_org_id(school_id))
  or public.is_platform_admin()
);

create policy "Org members can create interviews"
on public.interviews
for insert
to authenticated
with check (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  and created_by = auth.uid()
  or public.is_platform_admin()
);

create policy "Org members can update interviews"
on public.interviews
for update
to authenticated
using (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or public.is_platform_admin()
)
with check (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or public.is_platform_admin()
);

create policy "Owners and admins can delete interviews"
on public.interviews
for delete
to authenticated
using (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin']::public.organization_role[]
  )
  or public.is_platform_admin()
);
```

### Follow-ups

```sql
create policy "Org members can read follow ups"
on public.follow_ups
for select
to authenticated
using (
  public.is_org_member(public.school_org_id(school_id))
  or assigned_to = auth.uid()
  or public.is_platform_admin()
);

create policy "Org members can create follow ups"
on public.follow_ups
for insert
to authenticated
with check (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  and created_by = auth.uid()
  or public.is_platform_admin()
);

create policy "Org members can update follow ups"
on public.follow_ups
for update
to authenticated
using (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or assigned_to = auth.uid()
  or public.is_platform_admin()
)
with check (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin', 'member']::public.organization_role[]
  )
  or assigned_to = auth.uid()
  or public.is_platform_admin()
);

create policy "Owners and admins can delete follow ups"
on public.follow_ups
for delete
to authenticated
using (
  public.has_org_role(
    public.school_org_id(school_id),
    array['owner', 'admin']::public.organization_role[]
  )
  or public.is_platform_admin()
);
```

## Additional recommended constraints

To keep child records inside the same organization as their parent school:

```sql
-- If denormalized organization_id is added to child tables, enforce it.
-- Example for contacts:
alter table public.contacts
  add column organization_id uuid references public.organizations(id);

create or replace function public.set_child_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select organization_id
  into new.organization_id
  from public.schools
  where id = new.school_id;

  return new;
end;
$$;
```

Apply equivalent triggers to `outreach`, `interviews`, and `follow_ups` if denormalized organization IDs are used.

## Migration strategy

1. Create `organizations`, `organization_members`, and optional `platform_admins`.
2. Backfill a default organization for existing rows.
3. Add nullable `organization_id`, `created_by`, `updated_by`, and `assigned_to` fields.
4. Backfill ownership fields.
5. Add indexes.
6. Deploy application code that writes ownership fields.
7. Replace broad RLS policies with scoped policies.
8. Make ownership columns `not null` after backfill.
9. Remove service-role usage from normal user request paths.
10. Add tests for cross-organization access denial.

## Final assessment

The database design is acceptable for a prototype but not safe for production multi-user CRM use. The immediate blocker is not table coverage; it is the lack of ownership and role boundaries. Before production, add organization membership, user ownership fields, scoped RLS policies, and a strict admin/service-role pattern.
