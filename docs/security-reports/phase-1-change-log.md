# Phase 1 Security Sprint — Change Log

**Project:** Catalyst CRM  
**Scope:** Tasks 1–15 per `docs/phase-1-security-checklist.md`  
**Date range:** 2026-07-02 — 2026-07-03

This log records what changed in each task, grouped by deliverable. It is the authoritative inventory of Phase 1 security work.

---

## Task 1: Add Supabase server session support

**Commit message (recommended):** `Add Supabase server session client`

| File | Change |
| --- | --- |
| `package.json` | Added `@supabase/ssr` dependency |
| `package-lock.json` | Lockfile update |
| `lib/supabaseServer.ts` | **New** — `getServerSupabaseClient()`, `requireUser()` |
| `lib/supabase.ts` | Removed static service-role client; uses session client for user-scoped access |

---

## Task 2: Add login, logout, and auth callback routes

**Commit message (recommended):** `Add Supabase authentication routes`

| File | Change |
| --- | --- |
| `app/login/page.tsx` | **New** — email/password login UI |
| `app/logout/route.ts` | **New** — session termination |
| `app/auth/callback/route.ts` | **New** — OAuth/magic-link callback handler |
| `app/layout.tsx` | Sign in / Sign out header links |
| `README.md` | Auth setup and Supabase redirect URL documentation |

---

## Task 3: Protect app routes with middleware

**Commit message (recommended):** `Protect dashboard routes with auth middleware`

| File | Change |
| --- | --- |
| `middleware.ts` | **New** — requires session for `/` and `/schools/*` |
| `app/page.tsx` | Assumes authenticated context |
| `app/schools/[id]/page.tsx` | `requireUser()` + redirect to login |

---

## Task 4: Add organization, membership, and role schema

**Commit message (recommended):** `Add organization membership role schema`

| File | Change |
| --- | --- |
| `supabase/migrations/20260703142600_add_organizations_and_roles.sql` | **New** — `organizations`, `organization_members`, `app_role` enum |
| `lib/supabase.ts` | Types for `AppRole`, `OrganizationMember` |
| `lib/authz.ts` | **New** — membership and role helper functions |

---

## Task 5: Add ownership columns to CRM tables

**Commit message (recommended):** `Add CRM ownership fields`

| File | Change |
| --- | --- |
| `supabase/migrations/20260703143300_add_crm_ownership_fields.sql` | **New** — ownership columns + default org backfill |
| `lib/supabase.ts` | `getRecordOwnershipFields()`; writes ownership on insert |
| `lib/universityResearch.ts` | Ownership fields on research save |

---

## Task 6: Replace broad RLS policies

**Commit message (recommended):** `Replace broad RLS with organization policies`

| File | Change |
| --- | --- |
| `supabase/migrations/20260703144000_replace_broad_rls_policies.sql` | **New** — org-scoped RLS; helper functions `is_super_admin`, `has_org_access`, `can_write_org`, `can_manage_org` |
| `docs/supabase-rls-audit.md` | Documented new policy model |

---

## Task 7: Remove service-role key from user request paths

**Commit message (recommended):** `Remove service role from user actions`

| File | Change |
| --- | --- |
| `lib/supabase.ts` | Session client only for reads/writes |
| `lib/universityResearch.ts` | Session client only |
| `.env.example` | **New** — anon key only; service role commented |
| `README.md` | Documented that service role is not required for user actions |

---

## Task 8: Add backend authorization guards to server actions

**Commit message (recommended):** `Add role guards to server actions`

| File | Change |
| --- | --- |
| `lib/authz.ts` | `MUTATION_ROLES`, `requireRole()`, `getSchoolOrganizationId()` |
| `lib/supabase.ts` | `createInterviewNote` guarded for `sales`/`admin`/`super_admin` |
| `lib/universityResearch.ts` | `researchUniversityProfile` role + org guards |

---

## Task 9: Add server-side validation schemas

**Commit message (recommended):** `Add server action validation schemas`

| File | Change |
| --- | --- |
| `package.json` | Added `zod` |
| `package-lock.json` | Lockfile update |
| `lib/validation.ts` | **New** — `validateInterviewNote()`, `validateUniversityResearchInput()` |
| `lib/supabase.ts` | Validation before interview insert; `InterviewActionResult` |
| `lib/universityResearch.ts` | Validation before research |
| `app/components/DiscoveryInterviewForm.tsx` | `useActionState` for validation error display |

---

## Task 10: Harden university research URL fetching

**Commit message (recommended):** `Harden research agent URL fetching`

| File | Change |
| --- | --- |
| `lib/safeFetch.ts` | **New** — HTTPS-only, IP/localhost/metadata blocks, redirect validation, 2MB limit, 5s timeout |
| `lib/universityResearch.ts` | `fetchPage()` uses `safeFetchText()` |
| `docs/security-audit.md` | Updated with SSRF mitigation notes |

---

## Task 11: Add rate limiting for server actions

**Commit message (recommended):** `Add server action rate limits`

| File | Change |
| --- | --- |
| `supabase/migrations/20260703152200_add_rate_limit_events.sql` | **New** — `rate_limit_events` table |
| `lib/rateLimit.ts` | **New** — `enforceRateLimit()` |
| `lib/supabase.ts` | Rate limit on `createInterviewNote` (10 / 15 min) |
| `lib/universityResearch.ts` | Rate limit on research (3 / 15 min) |

---

## Task 12: Add audit logs for sensitive actions

**Commit message (recommended):** `Add audit events for sensitive actions`

| File | Change |
| --- | --- |
| `supabase/migrations/20260703152700_add_audit_events.sql` | **New** — append-only `audit_events` |
| `lib/auditLog.ts` | **New** — `recordAuditEvent()`, `AUDIT_ACTIONS` |
| `lib/supabase.ts` | Audit on interview create |
| `lib/universityResearch.ts` | Audit on research run and save |

**Logged actions:**
- `interview.create`
- `university_research.run`
- `university_research.save`

---

## Task 13: Add field-level privacy redaction

**Commit message (recommended):** `Add role-based privacy redaction`

| File | Change |
| --- | --- |
| `lib/authz.ts` | `RESTRICTED_FIELD_PLACEHOLDER`, `shouldRedactRestrictedFields()` |
| `lib/supabase.ts` | `applyRestrictedFieldRedaction()` in `getSchoolProfileData()` |
| `app/schools/[id]/page.tsx` | Redacted UI styling; privacy banner for `read_only` |

**Redacted fields for `read_only`:**
- `interviews.raw_notes`
- `interviews.budget`
- `interviews.budget_owner`
- `interviews.objections`
- `follow_ups.notes` (next open follow-up)

---

## Task 14: Add privacy warnings and consent copy

**Commit message (recommended):** `Add AI and privacy guidance copy`

| File | Change |
| --- | --- |
| `app/components/DiscoveryInterviewForm.tsx` | PII/FERPA warning; rule-based summary disclosure |
| `app/components/UniversityResearchAgent.tsx` | Public web fetch disclosure |
| `app/components/OutreachEmailGenerator.tsx` | Privacy reminder for outreach drafts |
| `README.md` | **Privacy and data handling** section |

---

## Task 15: Add CI/security checks

**Commit message (recommended):** `Add CI security checks`

| File | Change |
| --- | --- |
| `.github/workflows/ci.yml` | **New** — CI on push/PR: `npm ci`, lint, build, audit |

**CI behavior:**
- Lint and build: **blocking**
- `npm audit --audit-level=moderate`: **non-blocking** due to transitive PostCSS advisory in Next.js (GHSA-qx2v-qp2m-jg93)

---

## Dependency changes (Phase 1)

| Package | Purpose |
| --- | --- |
| `@supabase/ssr` | Cookie-bound server sessions |
| `zod` | Server action input validation |

---

## Migration apply order

Apply in timestamp order:

1. `20260702200600_initial_crm_schema.sql` (pre-Phase 1)
2. `20260702210800_add_discovery_interview_fields.sql`
3. `20260702212500_add_ai_summary_interview_fields.sql`
4. `20260702221300_add_university_research_profile_fields.sql`
5. `20260703142600_add_organizations_and_roles.sql`
6. `20260703143300_add_crm_ownership_fields.sql`
7. `20260703144000_replace_broad_rls_policies.sql`
8. `20260703152200_add_rate_limit_events.sql`
9. `20260703152700_add_audit_events.sql`

---

## Files intentionally unchanged in Phase 1

- No changes to production RLS after Task 6 (Tasks 13–15 used app layer or docs/CI only).
- No new middleware changes after Task 3.
- `app/globals.css`, outreach components logic, and core CRM schema (pre-security migrations) unchanged except where listed above.
