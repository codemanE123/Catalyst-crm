# Phase 1 Security Implementation Checklist

Scope: Phase 1 only. This is a planning document. Do not modify application code until a task is explicitly selected for implementation.

Phase 1 goal: make the prototype safe enough for controlled internal testing with real CRM data by adding authentication, organization-scoped authorization, safer Supabase access, input validation, SSRF protections, rate limits, and minimum audit/privacy controls.

## Task 1: Add Supabase server session support

- Exact files to edit:
  - `package.json`
  - `package-lock.json`
  - `lib/supabase.ts`
  - New file: `lib/supabaseServer.ts`
- What will change:
  - Add `@supabase/ssr`.
  - Create a request-aware Supabase server client that reads cookies.
  - Stop using static anon/service keys for user-scoped reads/writes.
  - Add helper functions such as `getServerSupabaseClient()` and `requireUser()`.
- How to test it:
  - `npm install @supabase/ssr`
  - `npm run lint`
  - `npm run build`
  - Add a temporary local route/page test or server-action check to confirm unauthenticated requests return no user.
- Rollback plan:
  - Revert the commit.
  - Remove `@supabase/ssr` from `package.json` and `package-lock.json`.
  - Restore previous Supabase client creation in `lib/supabase.ts`.
- Git commit message:
  - `Add Supabase server session client`

## Task 2: Add login, logout, and auth callback routes

- Exact files to edit:
  - New file: `app/login/page.tsx`
  - New file: `app/logout/route.ts`
  - New file: `app/auth/callback/route.ts`
  - `app/layout.tsx`
  - `README.md`
- What will change:
  - Add login UI using Supabase Auth.
  - Add callback route for Supabase Auth redirects.
  - Add logout route to clear sessions.
  - Document required Supabase Auth redirect URLs.
- How to test it:
  - `npm run lint`
  - `npm run build`
  - Manual browser test:
    - Visit `/login`.
    - Sign in with configured Supabase Auth user.
    - Confirm redirect to `/`.
    - Visit `/logout`.
    - Confirm session clears and user returns to `/login`.
- Rollback plan:
  - Revert the commit.
  - Remove auth routes.
  - Remove README auth setup notes.
- Git commit message:
  - `Add Supabase authentication routes`

## Task 3: Protect app routes with middleware

- Exact files to edit:
  - New file: `middleware.ts`
  - `app/page.tsx`
  - `app/schools/[id]/page.tsx`
- What will change:
  - Add middleware requiring an authenticated session for `/` and `/schools/:id`.
  - Allow `/login`, `/auth/callback`, static assets, and Next internals.
  - Update pages to assume authenticated context.
- How to test it:
  - `npm run lint`
  - `npm run build`
  - Manual browser test:
    - Logged out: visit `/`, expect redirect to `/login`.
    - Logged out: visit `/schools/school-1`, expect redirect to `/login`.
    - Logged in: visit `/`, dashboard loads.
    - Logged in: visit `/schools/school-1`, profile loads if authorized.
- Rollback plan:
  - Revert the commit.
  - Remove `middleware.ts`.
  - Restore unprotected route behavior.
- Git commit message:
  - `Protect dashboard routes with auth middleware`

## Task 4: Add organization, membership, and role schema

- Exact files to edit:
  - New migration: `supabase/migrations/<timestamp>_add_organizations_and_roles.sql`
  - `lib/supabase.ts`
  - New file: `lib/authz.ts`
- What will change:
  - Add `organizations`.
  - Add `organization_members`.
  - Add `app_role` enum with:
    - `super_admin`
    - `admin`
    - `sales`
    - `read_only`
  - Add helper functions for membership and role checks.
- How to test it:
  - Parse migrations with `pglast`.
  - Apply migration to a local/test Supabase database.
  - Verify tables exist.
  - Verify inserting membership records works.
- Rollback plan:
  - Revert the migration commit before production apply.
  - If already applied in non-prod, create rollback migration dropping role/membership tables after backing up data.
- Git commit message:
  - `Add organization membership role schema`

## Task 5: Add ownership columns to CRM tables

- Exact files to edit:
  - New migration: `supabase/migrations/<timestamp>_add_crm_ownership_fields.sql`
  - `lib/supabase.ts`
  - `lib/universityResearch.ts`
- What will change:
  - Add `organization_id`, `created_by`, `updated_by`, and `assigned_to` where appropriate.
  - Backfill existing rows into a default organization.
  - Update inserts/upserts to write ownership fields.
- How to test it:
  - Parse migrations with `pglast`.
  - Apply migration to test database.
  - Create a school/interview/research profile.
  - Confirm ownership fields are populated.
- Rollback plan:
  - Revert if migration not applied.
  - If applied, create rollback migration removing ownership columns only after confirming no production dependency.
- Git commit message:
  - `Add CRM ownership fields`

## Task 6: Replace broad RLS policies

- Exact files to edit:
  - New migration: `supabase/migrations/<timestamp>_replace_broad_rls_policies.sql`
  - `docs/supabase-rls-audit.md`
- What will change:
  - Drop current `using (true)` / `with check (true)` policies.
  - Add organization-scoped policies for `schools`, `contacts`, `outreach`, `interviews`, and `follow_ups`.
  - Add role-specific write/delete policies.
- How to test it:
  - Parse migrations with `pglast`.
  - In test database:
    - User A in Org A can read Org A data.
    - User A cannot read Org B data.
    - Read Only cannot insert/update.
    - Sales can create interviews in own org.
    - Admin can manage own org.
- Rollback plan:
  - Reapply previous broad policies only in non-production emergency.
  - Prefer fixing scoped policies rather than restoring broad access.
- Git commit message:
  - `Replace broad RLS with organization policies`

## Task 7: Remove service-role key from user request paths

- Exact files to edit:
  - `lib/supabase.ts`
  - `lib/universityResearch.ts`
  - `.env.example` if added later
  - `README.md`
- What will change:
  - Stop selecting `SUPABASE_SERVICE_ROLE_KEY` in request-path helpers.
  - Use session-scoped Supabase client for user actions.
  - Reserve service role for future background jobs only.
- How to test it:
  - `npm run lint`
  - `npm run build`
  - Manual test:
    - Authenticated user can read own org data.
    - Unauthorized user cannot access other org data.
  - Confirm app works without `SUPABASE_SERVICE_ROLE_KEY`.
- Rollback plan:
  - Revert the commit.
  - Temporarily restore service role only in a private non-production environment if blocked.
- Git commit message:
  - `Remove service role from user actions`

## Task 8: Add backend authorization guards to server actions

- Exact files to edit:
  - New file: `lib/authz.ts`
  - `lib/supabase.ts`
  - `lib/universityResearch.ts`
- What will change:
  - Add `requireRole()` helper.
  - Enforce:
    - `createInterviewNote`: `sales`, `admin`, or `super_admin`.
    - `researchUniversityProfile`: `sales`, `admin`, or `super_admin`.
  - Ensure `read_only` cannot mutate.
- How to test it:
  - `npm run lint`
  - `npm run build`
  - Server-action tests or manual tests:
    - Read Only submit interview: denied.
    - Sales submit interview in own org: allowed.
    - Sales submit forged `school_id` from another org: denied.
- Rollback plan:
  - Revert the commit.
  - Keep route middleware if already working.
- Git commit message:
  - `Add role guards to server actions`

## Task 9: Add server-side validation schemas

- Exact files to edit:
  - `package.json`
  - `package-lock.json`
  - New file: `lib/validation.ts`
  - `lib/supabase.ts`
  - `lib/universityResearch.ts`
- What will change:
  - Add a validation library, recommended: `zod`.
  - Validate:
    - UUIDs.
    - dates.
    - enum values.
    - URL shape.
    - max lengths for raw notes, summaries, contact fields, and research inputs.
  - Return typed errors instead of silent failures.
- How to test it:
  - `npm install zod`
  - `npm run lint`
  - `npm run build`
  - Manual test:
    - Empty/invalid interview fields fail safely.
    - Invalid website fails safely.
    - Oversized raw notes fail safely.
- Rollback plan:
  - Revert commit.
  - Remove `zod` from package files.
- Git commit message:
  - `Add server action validation schemas`

## Task 10: Harden university research URL fetching

- Exact files to edit:
  - `lib/universityResearch.ts`
  - New file: `lib/safeFetch.ts`
  - `docs/security-audit.md`
- What will change:
  - Add SSRF-safe fetch helper.
  - Allow only HTTPS.
  - Block localhost, private IPs, link-local IPs, metadata IPs, and unsafe redirects.
  - Add response size limits.
  - Preserve existing timeout behavior.
- How to test it:
  - `npm run lint`
  - `npm run build`
  - Manual/server tests:
    - `https://www.asu.edu` works.
    - `http://localhost:3000` blocked.
    - `http://169.254.169.254` blocked.
    - private IP URL blocked.
- Rollback plan:
  - Revert commit.
  - Disable research action temporarily if safe fetch blocks needed production URLs.
- Git commit message:
  - `Harden research agent URL fetching`

## Task 11: Add rate limiting for server actions

- Exact files to edit:
  - `package.json`
  - `package-lock.json`
  - New file: `lib/rateLimit.ts`
  - `lib/supabase.ts`
  - `lib/universityResearch.ts`
- What will change:
  - Add simple durable rate limit strategy.
  - Recommended options:
    - Supabase table-backed rate limit for portability.
    - Upstash Redis if infrastructure allows.
  - Limit research runs more strictly than interview submissions.
- How to test it:
  - `npm run lint`
  - `npm run build`
  - Trigger action repeatedly.
  - Confirm limit returns user-safe error.
- Rollback plan:
  - Revert commit.
  - Temporarily raise rate limits if false positives occur.
- Git commit message:
  - `Add server action rate limits`

## Task 12: Add audit logs for sensitive actions

- Exact files to edit:
  - New migration: `supabase/migrations/<timestamp>_add_audit_events.sql`
  - New file: `lib/auditLog.ts`
  - `lib/supabase.ts`
  - `lib/universityResearch.ts`
- What will change:
  - Add append-only `audit_events`.
  - Log:
    - interview create/update.
    - university research run/save.
    - school status changes, once implemented.
    - role/admin changes, once implemented.
  - Store metadata without raw notes or secrets.
- How to test it:
  - Parse migration with `pglast`.
  - Submit interview.
  - Run research agent.
  - Confirm audit rows are created with actor, organization, action, table, record ID.
- Rollback plan:
  - Revert commit before production apply.
  - If applied, leave audit table in place rather than dropping logs unless non-production.
- Git commit message:
  - `Add audit events for sensitive actions`

## Task 13: Add field-level privacy redaction

- Exact files to edit:
  - `app/schools/[id]/page.tsx`
  - `lib/supabase.ts`
  - `lib/authz.ts`
- What will change:
  - Hide or redact Restricted fields for `read_only` role:
    - raw interview notes.
    - budget.
    - budget owner.
    - objections.
    - sensitive follow-up notes.
  - Keep public/internal fields visible.
- How to test it:
  - `npm run lint`
  - `npm run build`
  - Manual role tests:
    - Read Only sees redacted restricted fields.
    - Sales/Admin see full fields in own org.
- Rollback plan:
  - Revert commit.
  - Temporarily restrict profile route to Sales+ if redaction is incorrect.
- Git commit message:
  - `Add role-based privacy redaction`

## Task 14: Add privacy warnings and consent copy for AI-like features

- Exact files to edit:
  - `app/components/DiscoveryInterviewForm.tsx`
  - `app/components/UniversityResearchAgent.tsx`
  - `app/components/OutreachEmailGenerator.tsx`
  - `README.md`
- What will change:
  - Clarify current summaries are rule-based/local.
  - Add warning not to enter student PII or protected education records.
  - Clarify research agent fetches public websites and search result pages.
- How to test it:
  - `npm run lint`
  - `npm run build`
  - Manual browser review of helper text.
- Rollback plan:
  - Revert commit.
- Git commit message:
  - `Add AI and privacy guidance copy`

## Task 15: Add CI/security checks

- Exact files to edit:
  - New file: `.github/workflows/ci.yml`
  - `package.json` if scripts are added
- What will change:
  - Add CI steps:
    - `npm ci`
    - `npm run lint`
    - `npm run build`
    - `npm audit --audit-level=moderate`
  - Optionally add secret scanning if repository tooling supports it.
- How to test it:
  - Open PR and confirm CI runs.
  - Run equivalent commands locally.
- Rollback plan:
  - Revert workflow commit.
  - Temporarily mark audit step non-blocking if Next transitive PostCSS advisory blocks CI.
- Git commit message:
  - `Add CI security checks`

## Recommended Phase 1 order

1. Add Supabase server session support.
2. Add login/logout/auth callback.
3. Protect app routes with middleware.
4. Add organization, membership, and role schema.
5. Add ownership columns to CRM tables.
6. Replace broad RLS policies.
7. Remove service-role key from user request paths.
8. Add backend authorization guards.
9. Add server-side validation schemas.
10. Harden university research URL fetching.
11. Add rate limiting.
12. Add audit logs.
13. Add field-level privacy redaction.
14. Add privacy warnings and consent copy.
15. Add CI/security checks.

## Phase 1 exit criteria

- Unauthenticated users cannot access dashboard/profile routes.
- Read Only users cannot mutate data.
- Users cannot access records outside their organization.
- Service role is not used in user-triggered actions.
- Server actions validate inputs.
- Research agent blocks unsafe URLs.
- Sensitive actions produce audit events.
- Restricted fields are hidden from Read Only users.
- CI verifies lint/build/security checks.
