# API Routes and Server Actions Audit

Scope: Documentation-only audit of API routes, server actions, and server-side data loaders.

## Executive summary

The project does not define any `app/api/*` API routes. The effective backend/API surface is made up of:

1. Server-rendered page data loaders:
   - `getDashboardData`
   - `getSchoolProfileData`
2. Server actions:
   - `createInterviewNote`
   - `researchUniversityProfile`

None of these currently enforce application authentication, roles, organization ownership, or robust server-side validation. The code relies on sample fallback data when Supabase is not configured and uses Supabase directly when environment variables exist. If `SUPABASE_SERVICE_ROLE_KEY` is configured, request-path actions can bypass RLS.

## Route/action inventory

| Surface | Type | Path/name | Auth | Role | Primary risk |
| --- | --- | --- | --- | --- | --- |
| Dashboard page | Server route | `/` | None | None | Unauthenticated CRM data exposure |
| School profile page | Server route | `/schools/[id]` | None | None | School ID enumeration/data exposure |
| Dashboard data loader | Server function | `getDashboardData` | None | None | Broad CRM reads |
| School profile data loader | Server function | `getSchoolProfileData` | None | None | Reads sensitive school detail by ID |
| Discovery interview action | Server action | `createInterviewNote` | None | None | Unauthenticated writes |
| University research action | Server action | `researchUniversityProfile` | None | None | SSRF, unauthenticated upsert/research |

## 1. Route: `/`

- Route name/path: `/`
- Implementation:
  - `app/page.tsx`
- What it does:
  - Renders the main CRM dashboard.
  - Loads schools, contacts, pipeline metrics, and CEO metrics through `getDashboardData`.
  - Hosts client components for discovery interviews, university research, and outreach email generation.
- Required auth:
  - Current: none.
  - Recommended: authenticated user session required.
- Required role:
  - Current: none.
  - Recommended: `Read Only`, `Sales`, `Admin`, or `Super Admin` may view dashboard, scoped to organization.
- Input validation:
  - Current: no route params or query params.
  - Recommended: validate organization context once multi-org routing is added.
- Data accessed:
  - `schools`
  - `contacts`
  - `outreach` count metrics
  - `interviews` count metrics
  - `follow_ups` count metrics
- Risks:
  - Unauthenticated dashboard access.
  - Sensitive CRM/contact data exposure.
  - Metrics may query all CRM rows when Supabase is configured.
  - If service role key is configured, RLS can be bypassed.
- Recommended improvements:
  - Protect route with middleware.
  - Require authenticated session.
  - Add organization selector/context.
  - Scope all queries by organization.
  - Redact sensitive fields for `Read Only` if needed.

## 2. Route: `/schools/[id]`

- Route name/path: `/schools/[id]`
- Implementation:
  - `app/schools/[id]/page.tsx`
- What it does:
  - Renders a school profile for the dynamic `id`.
  - Shows account notes, contacts, outreach history, interview summaries, status, next follow-up, and university research fields.
- Required auth:
  - Current: none.
  - Recommended: authenticated user session required.
- Required role:
  - Current: none.
  - Recommended:
    - `Read Only`: view school profile in own organization.
    - `Sales`: view and update assigned/organization records.
    - `Admin`: full org access.
    - `Super Admin`: audited platform access.
- Input validation:
  - Current:
    - `id` is passed directly to `getSchoolProfileData`.
    - No UUID validation.
  - Recommended:
    - Validate `id` as UUID.
    - Query by both `id` and authorized `organization_id`.
- Data accessed:
  - One `schools` row.
  - Related `contacts`.
  - Related `outreach`.
  - Related `interviews`.
  - Next open `follow_ups`.
- Risks:
  - School ID enumeration.
  - Cross-organization data exposure.
  - Sensitive data exposure: contacts, phone numbers, raw notes, buyer, budget, objections, follow-ups.
  - Uses fallback sample behavior if Supabase lookup misses.
- Recommended improvements:
  - Require session.
  - Enforce school access before loading child records.
  - Return 404 or access denied for unauthorized schools.
  - Avoid fallback sample data for unknown IDs in production.
  - Add role-based field redaction.

## 3. Server function: `getDashboardData`

- Route name/path:
  - `getDashboardData`
- Implementation:
  - `lib/supabase.ts`
- What it does:
  - Creates a Supabase client from env vars.
  - Returns sample dashboard data if Supabase is not configured.
  - Reads schools and contacts.
  - Builds pipeline stages.
  - Builds CEO metrics using count queries across outreach, interviews, and follow-ups.
- Required auth:
  - Current: none.
  - Recommended: authenticated session required.
- Required role:
  - Current: none.
  - Recommended: `Read Only` or higher for organization-scoped data.
- Input validation:
  - Current: no inputs.
  - Recommended: validate organization context once added.
- Data accessed:
  - `schools`
  - `contacts`
  - `outreach`
  - `interviews`
  - `follow_ups`
- Risks:
  - Reads all schools and contacts, not organization-scoped.
  - Count queries aggregate all rows.
  - Uses `SUPABASE_SERVICE_ROLE_KEY` if present.
  - Silently falls back to sample data if Supabase is unavailable.
- Recommended improvements:
  - Accept authenticated user/org context.
  - Use session-scoped Supabase client.
  - Add organization filters to all reads/counts.
  - Surface data loading errors separately from sample/demo mode.
  - Add pagination for large datasets.

## 4. Server function: `getSchoolProfileData`

- Route name/path:
  - `getSchoolProfileData(schoolId)`
- Implementation:
  - `lib/supabase.ts`
- What it does:
  - Loads a single school by ID.
  - Loads related contacts, outreach, interviews, and next follow-up.
  - Returns sample profile data if Supabase is absent or school not found.
- Required auth:
  - Current: none.
  - Recommended: authenticated session required.
- Required role:
  - Current: none.
  - Recommended: `Read Only` or higher for the school's organization.
- Input validation:
  - Current:
    - `schoolId` is used directly in `.eq("id", schoolId)`.
  - Recommended:
    - Validate UUID format.
    - Validate user has access to the school's organization.
- Data accessed:
  - `schools`
  - `contacts`
  - `outreach`
  - `interviews`
  - `follow_ups`
- Risks:
  - ID enumeration.
  - Cross-organization exposure.
  - Sensitive data exposure.
  - Fallback to sample data can hide missing/unauthorized records.
- Recommended improvements:
  - Require session.
  - Query by `id` and authorized organization.
  - Return explicit unauthorized/not-found states.
  - Remove sample fallback in production.
  - Add field-level redaction by role.

## 5. Server action: `createInterviewNote`

- Route name/path:
  - `createInterviewNote(formData)`
- Implementation:
  - `lib/supabase.ts`
- What it does:
  - Inserts a row into `interviews`.
  - Stores school ID, interviewer, date, sentiment, notes, raw notes, pain points, current tools, buyer, budget, budget owner, objections, pilot interest, referrals, and next step.
  - No-ops when Supabase is not configured.
- Required auth:
  - Current: none.
  - Recommended: authenticated session required.
- Required role:
  - Current: none.
  - Recommended:
    - `Sales`, `Admin`, or `Super Admin` can create.
    - `Read Only` cannot create.
- Input validation:
  - Current:
    - Browser form has some `required` fields.
    - Server action reads raw `FormData`.
    - No server-side schema validation.
  - Recommended:
    - Validate `school_id` UUID.
    - Validate `school_id` belongs to user's organization.
    - Validate date format.
    - Validate sentiment and pilot interest enum values.
    - Add max lengths for all text fields.
    - Require `created_by = auth.uid()`.
- Data accessed:
  - Writes `interviews`.
  - Implicitly trusts `school_id`.
- Risks:
  - Unauthenticated write.
  - Cross-organization write by forged `school_id`.
  - Invalid enum/data values.
  - Oversized raw notes.
  - No audit trail.
  - No CSRF/origin checks.
  - If service-role key is set, RLS bypass is possible.
- Recommended improvements:
  - Add `requireUser()`.
  - Add role guard: `Sales+`.
  - Use user-scoped Supabase client.
  - Validate input with a shared server schema.
  - Stamp `created_by`, `updated_by`, `organization_id`.
  - Return typed success/error state.
  - Add rate limiting.

## 6. Server action: `researchUniversityProfile`

- Route name/path:
  - `researchUniversityProfile(previousState, formData)`
- Implementation:
  - `lib/universityResearch.ts`
- What it does:
  - Accepts school name and optional website.
  - Discovers a website if not supplied.
  - Searches DuckDuckGo HTML results for topic pages.
  - Fetches public university pages.
  - Extracts profile fields.
  - Upserts into `schools` if Supabase is configured.
  - Returns preview data otherwise.
- Required auth:
  - Current: none.
  - Recommended: authenticated session required.
- Required role:
  - Current: none.
  - Recommended:
    - `Sales`, `Admin`, or `Super Admin` can run.
    - `Read Only` cannot run by default.
- Input validation:
  - Current:
    - `school_name` is trimmed and checked for presence.
    - `website` is normalized to `https://` if no protocol.
    - No robust URL validation or SSRF protection.
  - Recommended:
    - Validate URL protocol is `https`.
    - Block localhost, private IPs, link-local IPs, metadata endpoints.
    - Validate DNS resolution and redirects.
    - Limit school name length.
    - Limit fetch size and response time.
- Data accessed:
  - External public websites.
  - DuckDuckGo HTML search.
  - Upserts `schools`.
- Risks:
  - SSRF.
  - Missing auth and role checks.
  - Missing rate limits.
  - External service abuse.
  - Untrusted scraped content.
  - Upsert can overwrite existing school fields.
  - Uses `SUPABASE_SERVICE_ROLE_KEY` if present.
  - No audit log of research run.
- Recommended improvements:
  - Require session and `Sales+` role.
  - Add explicit organization context.
  - Use a background job queue.
  - Add SSRF-safe fetch utility.
  - Add rate limits and caching.
  - Save research output to an evidence table instead of overwriting text fields directly.
  - Add audit logs and source confidence.

## Client-only functions not considered backend API routes

These are client-side helpers, not backend API surfaces:

- `DiscoveryInterviewForm.generateSummary`
  - Heuristic summarizer running in browser state.
  - Risk: output quality and misleading AI labeling, but not backend auth risk.
- `OutreachEmailGenerator.generateEmail`
  - Client-only template generation.
  - Risk: low; no backend data access.
- `OutreachEmailGenerator.copyEmail`
  - Clipboard only.
  - Risk: low.

## Missing API route concerns

No explicit API routes were found:

- No `app/api/*`.
- No route handlers with custom CORS.
- No file upload endpoints.
- No webhook endpoints.

However, server actions should still be treated as backend API endpoints for security review.

## Recommended role requirements

| Surface | Super Admin | Admin | Sales | Read Only |
| --- | --- | --- | --- | --- |
| `/` dashboard | Yes | Yes | Yes | Yes |
| `/schools/[id]` | Yes | Own org | Own org | Own org read-only |
| `getDashboardData` | Yes | Own org | Own org | Own org read-only |
| `getSchoolProfileData` | Yes | Own org | Own org | Own org read-only |
| `createInterviewNote` | Yes | Own org | Own org | No |
| `researchUniversityProfile` | Yes | Own org | Own org | No by default |

## Recommended implementation checklist

1. Add authentication middleware for `/` and `/schools/[id]`.
2. Add `requireUser()` and `requireRole()` helpers for server actions.
3. Replace static Supabase key clients with session-scoped server clients.
4. Add organization ownership columns and scoped RLS policies.
5. Add input validation schemas for every server action.
6. Add rate limiting for mutation and research actions.
7. Add SSRF-safe fetch wrapper for research.
8. Add typed success/error returns for actions.
9. Add audit logging for writes and research runs.
10. Add tests covering unauthenticated, unauthorized, and cross-organization access.

## Final assessment

The codebase currently has no traditional API routes, but its server actions and server-rendered loaders are API-equivalent surfaces. They are not production-safe until authentication, authorization, input validation, organization scoping, RLS tightening, SSRF protection, and rate limiting are added.
