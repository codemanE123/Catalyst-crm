# Authentication and Authorization Audit

Scope: Documentation-only audit of authentication, session handling, route protection, roles, admin access, frontend/backend checks, and recommended role model.

## Executive summary

The current application has no implemented authentication or authorization flow. There is no login page, no session handling, no middleware, no protected routes, no user or organization ownership fields, no role storage, and no admin access model. Server actions can be invoked without user/role checks. Supabase RLS is enabled at the table level, but the current policies grant every authenticated Supabase user global read/write access, and the app can use a service-role key in request-path code, which can bypass RLS entirely.

This is acceptable only for a prototype with sample data. It is not safe for production or real CRM data.

## How users log in

Current state:

- Users do not log in.
- There is no login route.
- There is no signup route.
- There is no password reset route.
- There is no OAuth flow.
- There is no Supabase Auth UI or server-side session retrieval.

Evidence:

- Only two page routes exist:
  - `/`
  - `/schools/[id]`
- No `middleware.ts` exists.
- No `app/api` routes exist.
- No auth-specific route files exist.

Risk:

- Anyone who can access the deployed app can access the dashboard and school profile pages.

Recommended fix:

- Add Supabase Auth or another identity provider.
- Add:
  - `/login`
  - `/logout`
  - `/auth/callback`
  - optional `/forgot-password`
- Add route middleware that redirects unauthenticated users to `/login`.

## How sessions are handled

Current state:

- Sessions are not handled.
- No cookies are read.
- No `headers()` or `cookies()` session context is used.
- Supabase clients are created with static env keys and `persistSession: false`.
- No user session is passed into Supabase queries or server actions.

Current Supabase client behavior:

```ts
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```

Risk:

- Reads/writes are not user-scoped.
- If `SUPABASE_SERVICE_ROLE_KEY` is configured, RLS can be bypassed.
- If anon key is used, RLS policies still do not restrict data by user or organization.

Recommended fix:

- Use `@supabase/ssr` or equivalent server-side session-aware Supabase client.
- Create a server client from request cookies for user actions.
- Use service-role only for controlled backend jobs, never normal user flows.
- Add a helper such as:

```ts
async function requireUser() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    redirect("/login");
  }

  return data.user;
}
```

## Which routes are protected

Current protected routes:

- None.

Current unprotected routes:

- `/`
- `/schools/[id]`

Effective mutation surfaces also unprotected:

- `createInterviewNote`
- `researchUniversityProfile`

Recommended protection:

```ts
// middleware.ts
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|auth).*)"]
};
```

Middleware should:

- Read the session.
- Redirect unauthenticated users to `/login`.
- Allow only auth/callback/static assets without a session.

## How roles are stored

Current state:

- Roles are not stored.
- No `roles` table exists.
- No `organization_members` table exists.
- No role claim is read from JWT/app metadata.
- Text fields like `owner` are not security principals.

Risk:

- The app cannot distinguish Super Admin, Admin, Sales, or Read Only users.
- All access decisions are impossible to enforce correctly.

Recommended storage:

```sql
create type public.app_role as enum (
  'super_admin',
  'admin',
  'sales',
  'read_only'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'sales',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
```

Recommended ownership additions:

```sql
alter table public.schools
  add column organization_id uuid references public.organizations(id),
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id),
  add column assigned_to uuid references auth.users(id);
```

Child tables should inherit access via `schools.organization_id`, or include denormalized `organization_id` columns maintained by triggers.

## How admin access works

Current state:

- Admin access does not exist.
- No admin role.
- No platform-admin table.
- No admin-only route or policy.
- If `SUPABASE_SERVICE_ROLE_KEY` is set, server code may effectively act as unrestricted admin.

Risk:

- Admin capability is implicit and unsafe.
- Service role bypasses RLS without app-level checks.
- There is no audit trail for admin actions.

Recommended pattern:

- Use role-based organization membership for normal admins.
- Use a separate `platform_admins` table only for true cross-tenant super admins.
- Never expose platform admin actions through normal user flows.
- Log every super-admin action.

Recommended table:

```sql
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
```

## Whether frontend-only protection exists

Current state:

- No frontend route hiding or conditional auth rendering exists.
- No frontend-only protection exists.

Important note:

- Frontend-only protection would not be sufficient. Even if dashboard widgets were hidden, server actions and data access must enforce authentication and authorization on the backend.

Recommended approach:

- Use frontend role checks only for UX.
- Enforce all decisions on the server and in RLS.

## Where backend checks are missing

Backend checks are missing in:

### `getDashboardData`

Missing:

- Require authenticated user.
- Filter schools/contacts/metrics by organization.
- Restrict sensitive fields by role.

### `getSchoolProfileData`

Missing:

- Require authenticated user.
- Verify user can access the requested school.
- Prevent enumeration of school IDs across organizations.

### `createInterviewNote`

Missing:

- Require authenticated user.
- Validate `school_id` belongs to user's organization.
- Check user role can create interviews.
- Stamp `created_by` and organization.
- Validate/limit all fields.

### `researchUniversityProfile`

Missing:

- Require authenticated user.
- Check user role can create/update school research profiles.
- Check organization context.
- Avoid service-role upsert in request path.
- Add audit log for research runs.

## Recommended role model

### Super Admin

Purpose:

- Platform-level operational support.
- Cross-organization emergency access.
- System configuration and migrations.

Permissions:

- Read all organizations.
- Manage organizations and admins.
- Perform emergency data repair.
- View audit logs.

Restrictions:

- Should not be used for normal CRM work.
- Should require MFA.
- Should have every action audited.
- Should not rely on client-side checks.

### Admin

Purpose:

- Organization-level administrator.

Permissions:

- Manage organization users.
- Read/create/update/delete CRM records within their organization.
- Assign schools/follow-ups.
- Configure organization-level settings.

Restrictions:

- No access to other organizations.
- No platform-level settings.

### Sales

Purpose:

- Normal CRM operator.

Permissions:

- Read CRM records within their organization.
- Create/update schools, contacts, outreach, interviews, follow-ups.
- Run university research agent for organization records.
- Update assigned records.

Restrictions:

- Cannot manage users.
- Cannot delete high-value records unless explicitly allowed.
- Cannot access other organizations.

### Read Only

Purpose:

- Viewer, advisor, executive stakeholder.

Permissions:

- Read dashboard/profile data within their organization.
- View research results and reports.

Restrictions:

- Cannot create/update/delete CRM records.
- Cannot run mutating server actions.
- Cannot manage users.

## Recommended permission matrix

| Capability | Super Admin | Admin | Sales | Read Only |
| --- | --- | --- | --- | --- |
| View own org dashboard | Yes | Yes | Yes | Yes |
| View all orgs | Yes | No | No | No |
| Create/update schools | Yes | Yes | Yes | No |
| Delete schools | Yes | Yes | No by default | No |
| Create/update contacts | Yes | Yes | Yes | No |
| Create outreach | Yes | Yes | Yes | No |
| Create interviews | Yes | Yes | Yes | No |
| Create follow-ups | Yes | Yes | Yes | No |
| Run research agent | Yes | Yes | Yes | No by default |
| Manage users | Yes | Yes, own org | No | No |
| Change roles | Yes | Yes, own org except Super Admin | No | No |
| View audit logs | Yes | Yes, own org | No | No |

## Recommended RLS helpers

```sql
create or replace function public.current_user_role(org_id uuid)
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select om.role
  from public.organization_members om
  where om.organization_id = org_id
    and om.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.has_role(
  org_id uuid,
  allowed_roles public.app_role[]
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

create or replace function public.is_super_admin()
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

## Recommended route protection

Routes requiring authentication:

- `/`
- `/schools/[id]`

Server actions requiring authentication:

- `createInterviewNote`
- `researchUniversityProfile`

Recommended route behavior:

- Unauthenticated user accessing `/` -> redirect to `/login`.
- Unauthenticated user accessing `/schools/[id]` -> redirect to `/login`.
- Authenticated user without org membership -> show onboarding/no organization state.
- Authenticated user without access to school -> 404 or access denied.

## Recommended backend checks by action

### `createInterviewNote`

Required checks:

1. User is authenticated.
2. `school_id` is valid UUID.
3. User belongs to the school's organization.
4. Role is `super_admin`, `admin`, or `sales`.
5. Input fields pass schema validation.
6. Insert stamps `created_by = auth.uid()`.

### `researchUniversityProfile`

Required checks:

1. User is authenticated.
2. Role is `super_admin`, `admin`, or `sales`.
3. Organization context is explicit.
4. URL is validated and SSRF-safe.
5. Upsert writes `organization_id`, `created_by`, `updated_by`.
6. Research run is audit logged.

### `getDashboardData`

Required checks:

1. User is authenticated.
2. User has at least `read_only` role in selected organization.
3. Queries filter by organization.
4. Sensitive fields are omitted or redacted for restricted roles.

### `getSchoolProfileData`

Required checks:

1. User is authenticated.
2. User has at least `read_only` role in school organization.
3. Query filters by both `id` and accessible organization.
4. Return 404/access denied if not accessible.

## Recommended implementation sequence

1. Add Supabase Auth and login/logout/callback routes.
2. Add middleware for route protection.
3. Add `organizations`, `organization_members`, `platform_admins`, and `app_role`.
4. Add ownership columns to core tables.
5. Backfill current records into a default organization.
6. Replace broad RLS policies with organization/role-scoped policies.
7. Refactor Supabase clients to use session-scoped clients for user actions.
8. Remove `SUPABASE_SERVICE_ROLE_KEY` from normal server actions.
9. Add server-side validation and role checks to all server actions.
10. Add tests for each role and cross-organization denial.

## Final assessment

The current authentication and authorization posture is not production-ready. There is no login, no session handling, no route protection, no role storage, no admin model, and no backend authorization checks. The recommended role model should be implemented with organization-scoped membership, strict RLS, route middleware, and server-side role checks before real CRM data is used.
