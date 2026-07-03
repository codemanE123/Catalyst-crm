# Catalyst CRM Security Audit

> **Document status:** Original repository security audit (pre–Phase 1). Findings
> below describe the **prototype baseline**. For the **current security posture**,
> see `docs/pilot-it-security-packet.md`, `docs/security-reports/phase-1-security-completion-report.md`,
> and `docs/phase-2-roadmap.md`. Sections marked **Historical** are retained for
> context and must not be read as open vulnerabilities unless no remediation status
> is listed.

Scope: Full repository security audit of the Next.js, Supabase, and Tailwind codebase at prototype stage.

Constraint: Documentation-only audit. No application code was modified in this original pass.

## Current security posture (summary)

Phase 1 (Tasks 1–15) and Phase 2 Tasks 2.1–2.2 implemented the critical and high
remediations from this audit. The application now has:

- Session authentication and middleware protection for `/` and `/schools/*`
- Organization-scoped RLS and role-based server-action guards
- Session-scoped Supabase client (no service-role in user request paths)
- Zod validation, SSRF-hardened research fetches, rate limits, audit events
- Read-only field privacy: database views (2.1) + app-layer backup redaction
- Security unit tests in CI (2.2): authz, SSRF, validation

**Pilot IT review packet:** `docs/pilot-it-security-packet.md`

## Remediation status (Phase 1 & Phase 2)

| Original finding | Status |
| --- | --- |
| 1. Missing application authentication | **Resolved** — Phase 1 Tasks 2–3 (`middleware.ts`, `/login`) |
| 2. Missing authorization on server actions | **Resolved** — Phase 1 Tasks 8–9 (`lib/authz.ts`, role guards) |
| 3. Unsafe service-role usage | **Resolved** — Phase 1 Task 7 (session client only in user paths) |
| 4. Broad Supabase RLS | **Resolved** — Phase 1 Task 6 (org-scoped policies) |
| 5. SSRF in research agent | **Mitigated** — Phase 1 Task 10 (`lib/safeFetch.ts`); DNS rebinding gap remains low priority |
| 6. Missing rate limits | **Resolved** — Phase 1 Task 11 (`lib/rateLimit.ts`) |
| 7. Missing input validation | **Resolved** — Phase 1 Task 9 (`lib/validation.ts`) |
| 8. CSRF on server actions | **Accepted** — Supabase SSR cookie model + session guards; explicit origin checks deferred |
| 9. Sensitive data via unauthenticated UI | **Resolved** — Phase 1 Task 3 + Task 13 redaction; Phase 2 Task 2.1 DB views |
| 10. Weak error handling | **Partially improved** — typed action errors; monitoring planned Task 2.32 |
| 11–16. Lower severity items | **Unchanged or improved** — see individual findings |

## Executive summary (historical baseline)

The codebase was a prototype CRM with no committed secrets found and no obvious direct XSS sinks such as `dangerouslySetInnerHTML`. The highest risks at audit time were production-readiness gaps: no application authentication, no server-action authorization, broad Supabase RLS policies, service-role key use in request-path code, and server-side fetching of user-supplied URLs in the university research agent.

**These gaps are addressed for pilot scope** as summarized in [Remediation status](#remediation-status-phase-1--phase-2).

## Priority order (historical remediation plan)

1. Add application authentication and protect all dashboard/profile/server-action paths.
2. Add authorization and tenant/organization ownership checks.
3. Remove `SUPABASE_SERVICE_ROLE_KEY` from normal request-path data access.
4. Replace broad Supabase RLS policies with least-privilege policies.
5. Harden university research URL fetching against SSRF and add rate limits.
6. Add server-side input validation and length limits for all server actions.
7. Add CSRF/rate-limit strategy for mutation server actions.
8. Add structured error handling and audit logging without private data leakage.
9. Add tests for auth, RLS assumptions, input validation, and research-agent URL safety.

Steps 1–8 and item 9 (unit tests for authz/SSRF/validation) are **complete** (Phase 1 + Phase 2 Task 2.2). Automated RLS matrix tests are **Phase 2 Task 2.3** (Scale Track).

## Findings (historical baseline with remediation status)

### 1. Missing application authentication

- **Remediation:** Resolved — Phase 1 Tasks 2–3
- Severity: Critical
- File/location (at audit time):
  - `app/page.tsx`
  - `app/schools/[id]/page.tsx`
  - No auth middleware or login route existed.
- Risk: Any deployed user can access CRM dashboard and school profile pages.
- Why it matters: The app displays CRM data, contact details, discovery notes, outreach history, and researched school intelligence. Without authentication, a deployed environment exposes this data to anyone who can reach the URL.
- Recommended fix:
  - Add Supabase Auth or another identity provider.
  - Add route protection middleware.
  - Require a valid session before rendering dashboard/profile pages.
  - Redirect unauthenticated users to login.
- Priority: 1

### 2. Missing authorization checks on server actions

- **Remediation:** Resolved — Phase 1 Tasks 8–9
- Severity: Critical
- File/location:
  - `lib/supabase.ts` -> `createInterviewNote`
  - `lib/universityResearch.ts` -> `researchUniversityProfile`
- Risk: Server actions mutate or attempt to mutate CRM records without checking user identity, role, organization, or school ownership.
- Why it matters: Once Supabase is configured, any caller who can trigger the action can create interview records or run research/upsert school profile data.
- Recommended fix:
  - Fetch and validate the authenticated user/session in every server action.
  - Enforce organization and role checks before writes.
  - Reject unauthenticated requests.
  - Add server-action tests for unauthorized access.
- Priority: 2

### 3. Unsafe service-role environment variable usage

- **Remediation:** Resolved — Phase 1 Task 7 (`lib/supabaseServer.ts`; user paths use anon session client)
- Severity: Critical
- File/location:
  - `lib/supabase.ts` uses `SUPABASE_SERVICE_ROLE_KEY` before anon key.
  - `lib/universityResearch.ts` uses `SUPABASE_SERVICE_ROLE_KEY` before anon key.
- Risk: If configured, service-role access can bypass Supabase RLS in request-path code.
- Why it matters: RLS is the database enforcement boundary. Bypassing it in unauthenticated or insufficiently authorized server actions can expose or mutate all CRM rows.
- Recommended fix:
  - Do not use `SUPABASE_SERVICE_ROLE_KEY` in general app actions.
  - Use a user-scoped Supabase server client bound to the authenticated session.
  - Reserve service role for internal jobs with explicit authorization and isolated modules.
  - Validate server-only env loading to prevent accidental client exposure.
- Priority: 3

### 4. Supabase RLS policies are overly broad

- **Remediation:** Resolved — Phase 1 Task 6; read-only views Phase 2 Task 2.1
- Severity: High
- File/location:
  - `supabase/migrations/20260702200600_initial_crm_schema.sql`
  - Policies use `to authenticated`, `using (true)`, and `with check (true)` for all core tables.
- Risk: Any authenticated Supabase user can read and manage every row.
- Why it matters: This prevents multi-tenant isolation, role separation, account ownership, and least-privilege access.
- Recommended fix:
  - Add ownership columns such as `organization_id`, `created_by`, `updated_by`.
  - Create role tables or claims-based role checks.
  - Replace `using (true)` with organization/user-scoped predicates.
  - Separate read/write/delete policies.
- Priority: 4

### 5. SSRF risk in university research agent

- Severity: High
- Status: Mitigated in Phase 1 Task 10
- File/location:
  - `lib/safeFetch.ts`
  - `lib/universityResearch.ts`
  - `normalizeWebsite`, `discoverWebsite`, `discoverTopicPages`, `fetchPage`, `researchUniversityProfile`
- Prior risk: The server fetched user-supplied websites and discovered URLs without blocking internal/private hosts.
- Implemented controls:
  - `safeFetchText()` allows only `https://` URLs.
  - Blocks `localhost`, private IPv4 ranges, link-local/metadata ranges such as `169.254.0.0/16`, and selected IPv6 local ranges.
  - Rejects URL credentials, manual redirect chains are revalidated, and redirect depth is capped.
  - Response bodies are limited to 2 MB and requests keep the existing 5 second timeout.
  - User-influenced page fetches use `safeFetchText()`; fixed DuckDuckGo search requests remain separate trusted outbound calls.
- Remaining gaps:
  - No DNS-resolution IP verification before fetch.
  - ~~No per-user rate limits on research fetches (Task 11).~~ **Resolved** — Phase 1 Task 11
- Priority: 5

### 6. Missing rate limits

- **Remediation:** Resolved — Phase 1 Task 11
- Severity: High
- File/location:
  - `lib/universityResearch.ts` server action and public fetch loop.
  - `lib/supabase.ts` discovery interview insert action.
- Risk: Server actions can be invoked repeatedly without throttling.
- Why it matters: The research agent performs multiple outbound HTTP requests. Without limits, it can cause resource exhaustion, third-party abuse, Supabase write spam, or denial of service.
- Recommended fix:
  - Add per-user/IP rate limits.
  - Add global concurrency limits for research.
  - Move research jobs to a queue.
  - Cache research results by school/website.
- Priority: 6

### 7. Missing server-side input validation and length limits

- **Remediation:** Resolved — Phase 1 Task 9; covered by `tests/validation/schemas.test.ts` (Task 2.2)
- Severity: High
- File/location:
  - `lib/supabase.ts` -> `createInterviewNote`
  - `lib/universityResearch.ts` -> `researchUniversityProfile`
  - Client forms under `app/components`
- Risk: Raw `FormData` values are written to Supabase or used in fetch logic without schema validation.
- Why it matters: Invalid enum values, oversized text, malformed URLs, or unexpected values can cause data quality issues, failed writes, resource abuse, and security bypasses.
- Recommended fix:
  - Add server-side schema validation with maximum lengths.
  - Validate UUIDs, dates, enums, URLs, and text lengths.
  - Treat client validation as convenience only.
  - Return sanitized, structured errors.
- Priority: 7

### 8. CSRF exposure on mutation server actions

- **Remediation:** Accepted risk for pilot — session required on mutations; Supabase SSR cookies; full origin-check strategy deferred
- Severity: Medium
- File/location:
  - `createInterviewNote`
  - `researchUniversityProfile`
- Risk: Server actions mutate state but do not include explicit CSRF protection or origin checks.
- Why it matters: If auth cookies are added later, cross-site form submissions could potentially trigger authenticated mutations unless framework and deployment protections are explicitly validated.
- Recommended fix:
  - Once auth is added, verify SameSite cookie settings.
  - Validate `Origin`/`Host` on mutation actions.
  - Add CSRF tokens for sensitive actions if cookie-based auth is used.
  - Keep server actions behind session and role checks.
- Priority: 8

### 9. Sensitive data exposure through unauthenticated UI

- **Remediation:** Resolved — Phase 1 Tasks 3, 13; Phase 2 Task 2.1 database views
- Severity: High
- File/location:
  - `app/page.tsx`
  - `app/schools/[id]/page.tsx`
  - `lib/supabase.ts` sample and live data paths.
- Risk: Contact names, emails, phone numbers, interview notes, objections, budgets, buyer details, and follow-up notes can render without authentication.
- Why it matters: This is CRM and sales intelligence data. Even if sample data is currently used locally, the live path will expose sensitive data unless protected.
- Recommended fix:
  - Add authentication and authorization.
  - Minimize data selected for list views.
  - Redact sensitive details for roles that do not need them.
  - Add field-level access policy for interview/budget notes if needed.
- Priority: 9

### 10. Weak error handling and silent failures

- **Remediation:** Partially improved — explicit server-action errors; error monitoring planned Phase 2 Task 2.32
- Severity: Medium
- File/location:
  - `lib/supabase.ts` returns sample/no-op behavior on missing Supabase and does not surface insert errors.
  - `lib/universityResearch.ts` catches fetch failures and returns fallback/preview behavior.
- Risk: Operational failures are hidden from users and maintainers.
- Why it matters: Failed inserts, broken Supabase permissions, failed external fetches, and bad research output may appear successful or partially successful.
- Recommended fix:
  - Return explicit typed error states from server actions.
  - Log server-side errors with request IDs.
  - Show user-safe errors in UI.
  - Add monitoring for Supabase write failures and research fetch failures.
- Priority: 10

### 11. XSS risk from untrusted scraped content is currently low but should be controlled

- Severity: Low
- File/location:
  - `lib/universityResearch.ts` scrapes public website text.
  - `app/components/UniversityResearchAgent.tsx` renders research output.
  - `app/schools/[id]/page.tsx` renders persisted research output.
- Risk: Public website content is untrusted and displayed in the UI.
- Why it matters: React escapes string output by default, which reduces direct XSS risk. However, future use of rich HTML rendering or markdown could turn this into a high-risk surface.
- Recommended fix:
  - Keep rendering scraped content as escaped text.
  - Do not introduce `dangerouslySetInnerHTML` for research output.
  - Sanitize any future rich-text rendering.
  - Keep research summaries concise and source-attributed.
- Priority: 11

### 12. SQL injection risk is currently low

- Severity: Low
- File/location:
  - `lib/supabase.ts`
  - `lib/universityResearch.ts`
- Risk: No raw SQL string construction was found in application code.
- Why it matters: Supabase query builder methods are used instead of concatenated SQL, reducing SQL injection risk.
- Recommended fix:
  - Continue avoiding raw SQL construction from user input.
  - If RPC/raw SQL is introduced, use parameterized functions only.
  - Add validation for values used in filters/upserts.
- Priority: 12

### 13. No unsafe file upload surface found

- Severity: Low
- File/location:
  - No file input or upload API route found.
- Risk: No current upload endpoint was identified.
- Why it matters: File upload vulnerabilities are not present in the current surface, but future attachments/imports could introduce malware, storage, and access-control risks.
- Recommended fix:
  - If uploads are added, validate MIME/type/size, scan files, store outside public paths by default, and enforce signed URL access.
- Priority: 13

### 14. No overly permissive CORS configuration found

- Severity: Low
- File/location:
  - No custom CORS configuration or API route handlers found.
- Risk: The app does not currently define permissive CORS headers.
- Why it matters: CORS risk is limited by the absence of custom route handlers. Future APIs should not default to wildcard origins for authenticated endpoints.
- Recommended fix:
  - Keep authenticated APIs same-origin by default.
  - If CORS is needed, allowlist exact origins and methods.
- Priority: 14

### 15. Logging of private data not currently observed

- Severity: Low
- File/location:
  - No explicit application logging of form values or private CRM fields found.
- Risk: No current evidence of private data being logged by application code.
- Why it matters: Once observability is added, raw notes, budgets, buyers, emails, and phone numbers should not be logged.
- Recommended fix:
  - Add structured logging with redaction rules.
  - Never log raw interview notes, contacts, API keys, service role keys, or full scraped payloads.
- Priority: 15

### 16. Exposed secrets not found in repository

- Severity: Low
- File/location:
  - Repository scan found env variable names but no committed secret values.
  - `README.md` documents blank env variable placeholders.
- Risk: No hard-coded API key or private key was identified.
- Why it matters: This is good, but future commits can accidentally expose `.env` contents.
- Recommended fix:
  - Keep `.env*.local` ignored.
  - Add secret scanning in CI.
  - Use platform secret storage.
  - Rotate keys immediately if ever committed.
- Priority: 16

## Additional observations by checklist item (historical snapshot)

At audit time:

- Exposed API keys or secrets: No concrete secret values found.
- Unsafe environment variable usage: Service-role fallback in request-path helpers was unsafe — **resolved** Task 7.
- Missing authentication checks: Present and critical — **resolved** Tasks 2–3.
- Missing authorization checks: Present and critical — **resolved** Tasks 8–9.
- Insecure API routes: No API routes; server actions lacked auth — **resolved**.
- Supabase RLS issues: Broad authenticated read/manage policies — **resolved** Task 6.
- SQL injection risks: Low currently; no raw SQL found.
- XSS risks: Low currently due to React escaping, but scraped content must remain escaped.
- CSRF risks: Medium future/current server-action mutation concern once auth is cookie-based — **mitigated** by session + role guards.
- Unsafe file uploads: None found.
- Overly permissive CORS: None found.
- Sensitive data exposure: High due to unauthenticated UI — **resolved** Tasks 3, 13, 2.1.
- Weak error handling: Medium — **partially improved**.
- Logging of private data: Not observed.
- Missing rate limits: High — **resolved** Task 11.

## Recommended remediation sequence (historical — largely complete)

1. Implement authentication middleware and route protection.
2. Replace service-role runtime access with user-scoped Supabase clients.
3. Add organization/user ownership columns and least-privilege RLS.
4. Add authorization checks to all server actions.
5. Add validation schemas and max lengths for every server action.
6. Add SSRF protection and rate limits for university research.
7. Add structured error handling and audit logging.
8. Add security tests for auth, RLS, validation, and URL blocking. ✅ Unit tests (2.2); RLS matrix (2.3 ST)
9. Add CI secret scanning and dependency audit gates. ✅ CI lint/test/build; audit step with documented PostCSS exception (2.38 pending)
10. Re-review before deploying with real CRM data. ⏳ Pilot Launch Gate — `docs/phase-2-roadmap.md`

## References

- `docs/phase-2-roadmap.md` — implementation source of truth
- `docs/pilot-it-security-packet.md` — university IT/security review
- `docs/pilot-onboarding-checklist.md` — onboarding and smoke verification
- `docs/supabase-rls-audit.md` — RLS and read-only views
- `docs/security-reports/phase-1-security-completion-report.md` — Phase 1 closure
- `docs/verification/readonly-view-verification.md` — manual view verification
- `tests/authz/redaction.test.ts`, `tests/safeFetch/ssrf.test.ts`, `tests/validation/schemas.test.ts` — CI security unit tests
