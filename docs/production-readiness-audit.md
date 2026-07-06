# Production Readiness Audit — Catalyst CRM

**Version:** 1.0  
**Audit date:** July 6, 2026 (UTC-5)  
**Branch / tag audited:** `phase-2` @ `40d4523` (`v0.4-pilot-ready`)  
**Primary live URL:** `https://catalyst-crm-tau.vercel.app`  
**Audit type:** Documentation + codebase + limited live probes (no Vercel/Supabase dashboard API access)

**Compared against:**

- `docs/deployment-runbook.md`
- `docs/pilot-launch-readiness-checklist.md`
- `docs/pilot-qa-results.md`

**Status legend:**

| Status | Meaning |
| --- | --- |
| **PASS** | Requirement met with evidence |
| **WARNING** | Partially met, unverified externally, or acceptable gap with documented mitigation |
| **FAIL** | Requirement not met or blocking for production pilot go-live |

---

## Executive summary

| Area | Overall | Notes |
| --- | --- | --- |
| **Staging / preview readiness** | **WARNING** | Auth + E2E smoke pass on live Vercel URL; several operational checks incomplete |
| **Production readiness** | **FAIL** | No verified isolated production Supabase + Vercel Production configuration |
| **Recommendation** | **NOT READY** for first external university pilot on production | Continue staging validation; complete §“Required actions” below |

**Evidence highlights:**

- Playwright smoke: **3/3 passed** on `https://catalyst-crm-tau.vercel.app` (2026-07-06, `docs/pilot-qa-results.md`)
- Unit CI baseline: **70 tests**, lint clean, build success
- Live probe: `GET /api/monitoring-test` → **404** (test route correctly disabled)
- `docs/pilot-qa-results.md`: production environment **not verified** this cycle

---

## Audit methodology

1. Reviewed deployment runbook requirements against repository artifacts (migrations, middleware, headers, monitoring, E2E).
2. Cross-checked pilot launch checklist must-fix items and QA results.
3. Performed limited unauthenticated HTTP probes against the deployed Vercel URL.
4. **Did not** access Vercel or Supabase dashboards — Production/Preview env var matrices and remote Auth URL settings are inferred from behavior and documentation unless marked FAIL.

---

## 1. Vercel Production environment variables

Per `docs/deployment-runbook.md` §14.3, §6.4, §18.2.

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 1.1 | `NEXT_PUBLIC_SUPABASE_URL` set on **Production** scope | **FAIL** | No production URL documented; QA states production not verified |
| 1.2 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` set on **Production** scope | **FAIL** | Cannot confirm; no production smoke recorded |
| 1.3 | Production Supabase project ref **≠** staging/preview ref | **FAIL** | Only staging ref observed locally (`yypklldfgdqoxvmfjrml`); production isolation not demonstrated |
| 1.4 | `SUPABASE_SERVICE_ROLE_KEY` **not** set on Production | **FAIL** | Not auditable without Vercel dashboard access |
| 1.5 | `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` on Production | **FAIL** | QA-4: code restored; Vercel DSN verification pending (`docs/pilot-qa-results.md` §4) |
| 1.6 | `SENTRY_ENABLE_TEST_ROUTE` **unset/false** on Production | **WARNING** | Live `/api/monitoring-test` returns 404 on preview URL (correct when disabled); Production scope not verified |
| 1.7 | Optional build vars (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`) | **WARNING** | Source maps upload optional; not confirmed |

**Section verdict:** **FAIL**

---

## 2. Vercel Preview environment variables

Per `docs/deployment-runbook.md` §6.3, §8.1, §8.4.

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 2.1 | `NEXT_PUBLIC_SUPABASE_URL` set for Preview | **PASS** | Login form enabled; E2E sign-in succeeds (`docs/pilot-qa-results.md` §3) |
| 2.2 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` set for Preview | **PASS** | Functional auth against `https://catalyst-crm-tau.vercel.app` |
| 2.3 | Preview uses **staging** Supabase (not production) | **WARNING** | Local `.env.local` ref `yypklldfgdqoxvmfjrml`; Vercel Preview values not read from dashboard |
| 2.4 | `SUPABASE_SERVICE_ROLE_KEY` **not** set on Preview | **WARNING** | Required by runbook; not confirmed via dashboard |
| 2.5 | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` on Preview | **WARNING** | Monitoring code present; no confirmed Sentry event; test route disabled (404) |
| 2.6 | `SENTRY_ENABLE_TEST_ROUTE=true` only during verification | **WARNING** | Currently 404 on deployed URL — appropriate post-verification **or** never enabled; staging Sentry verification not recorded |
| 2.7 | Fail-closed without Supabase on Vercel (Task 2.4) | **PASS** | Runbook + `lib/supabaseServer.ts`; preview deployment requires env vars for auth |

**Section verdict:** **WARNING** (functional pass; dashboard confirmation incomplete)

**Local dev note:** `.env.local` has a **leading space** before the anon key value — fix locally to avoid subtle auth issues (`WARNING` for developer hygiene, not Vercel).

---

## 3. Supabase production project configuration

Per `docs/deployment-runbook.md` §14.2, §14.5.

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 3.1 | Dedicated production Supabase project created | **FAIL** | Not documented or verified in QA |
| 3.2 | All 11 migrations applied on production | **FAIL** | Checklist §14.5 unchecked; no production promote recorded |
| 3.3 | RLS enabled on CRM tables | **FAIL** | Cannot verify remote production DB |
| 3.4 | Read-only views exist (`interviews_readonly`, `follow_ups_readonly`) | **FAIL** | Migration in repo; production apply not confirmed |
| 3.5 | Pilot organization + memberships provisioned | **FAIL** | Operational item pending (`docs/pilot-launch-readiness-checklist.md` §2) |
| 3.6 | Staging verification marker absent in production | **FAIL** | Not tested |
| 3.7 | Region / data residency documented | **FAIL** | Not recorded in pilot docs |

**Section verdict:** **FAIL**

---

## 4. Supabase staging project configuration

Per `docs/deployment-runbook.md` §3, §5, §10.

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 4.1 | Staging project exists and is wired to Vercel Preview | **PASS** | Auth + dashboard E2E pass on live URL |
| 4.2 | Known project ref | **WARNING** | Local ref `yypklldfgdqoxvmfjrml`; Vercel↔Supabase fingerprint not run (runbook §10) |
| 4.3 | All 11 migrations present in repository | **PASS** | `supabase/migrations/` (11 timestamped files) |
| 4.4 | Migrations applied on remote staging | **WARNING** | Inferred from working auth/CRM; formal checklist not signed off |
| 4.5 | RLS enabled (schema) | **PASS** | `enable row level security` in initial + org migrations |
| 4.6 | Org-scoped RLS policies deployed (schema) | **PASS** | `20260703144000_replace_broad_rls_policies.sql` |
| 4.7 | Admin membership policies | **PASS** | `20260704203000_add_organization_members_admin_policies.sql` |
| 4.8 | Read-only safe views (schema) | **PASS** | `20260703160000_add_readonly_safe_views.sql` |
| 4.9 | Cross-org denial tested on staging | **FAIL** | QA §4: pending; checklist §3 item 12 open |
| 4.10 | `read_only` redaction verified on staging | **FAIL** | QA §4: pending |

**Section verdict:** **WARNING** (schema + auth strong; runtime privacy matrix incomplete)

---

## 5. Auth redirect URLs

Per `docs/deployment-runbook.md` §7, §14.4.

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 5.1 | Supabase **Site URL** matches preview deployment origin | **WARNING** | Manual + E2E login work on `catalyst-crm-tau.vercel.app`; dashboard setting not read |
| 5.2 | `/auth/callback` in Supabase redirect allow list | **PASS** | Sign-in flow completes to `/` (E2E + QA); OAuth path exists in `app/auth/callback/route.ts` |
| 5.3 | Wildcard or per-preview URLs for PR deployments | **WARNING** | Runbook notes plan-dependent; not verified |
| 5.4 | Production Site URL + callback configured | **FAIL** | No production URL / project verified |
| 5.5 | Sign-out clears session (`/logout`) | **PASS** | QA §4 manual pass |
| 5.6 | Auth redirect loop resolved | **PASS** | Fixed `79dc8f5`; user + QA confirmed |

**Section verdict:** **WARNING** for staging; **FAIL** for production Auth config

---

## 6. RLS policies

Per migrations + `docs/supabase-rls-audit.md` (referenced in README).

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 6.1 | Broad `using (true)` policies removed | **PASS** | Dropped in `replace_broad_rls_policies` migration |
| 6.2 | Org-scoped SELECT via `has_org_access()` | **PASS** | Policies on schools, contacts, outreach, interviews, follow_ups |
| 6.3 | Role-scoped writes via `can_write_org()` / `can_manage_org()` | **PASS** | Insert/update/delete policies in migration |
| 6.4 | `security definer` helper functions with restricted grants | **PASS** | `is_super_admin`, `has_org_access`, etc. |
| 6.5 | RLS on `organizations`, `organization_members`, `audit_events` | **PASS** | Later migrations |
| 6.6 | Automated RLS matrix tests (Task 2.3) | **FAIL** | Scale Track; not implemented |
| 6.7 | Manual two-org denial test | **FAIL** | Open in QA + readiness checklist |
| 6.8 | DB read-only views for sensitive columns | **PASS** | Schema migration; app routing in Task 2.1B complete per readiness checklist |

**Section verdict:** **WARNING** (policy design PASS in code; runtime verification FAIL)

---

## 7. Middleware protection

Per `middleware.ts` + Task 2.34.

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 7.1 | `/` and `/schools/*` require authentication | **PASS** | `isProtectedPath`; E2E + QA |
| 7.2 | Unauthenticated users redirected to `/login` | **PASS** | QA + intended behavior |
| 7.3 | `/login` redirects authenticated users to dashboard | **PASS** | E2E flow |
| 7.4 | `/settings/*` requires admin/super_admin | **PASS** | Code: `canAccessSettingsRoutes`; manual test **WARNING** (not re-run in QA) |
| 7.5 | Soft navigation / prefetch does not cache login redirect incorrectly | **PASS** | `isSoftNavigationRequest` + fixes in `79dc8f5`, `e706169` |
| 7.6 | Session cookie refresh on requests | **PASS** | Supabase SSR middleware pattern |
| 7.7 | Public routes remain public (`/login`, `/auth/callback`, `/logout`) | **PASS** | Matcher + path logic |
| 7.8 | `Cache-Control: no-store` on auth responses | **PASS** | `applySessionCookies` + middleware |

**Section verdict:** **PASS** (code + auth smoke); **WARNING** on settings route manual re-test

---

## 8. Security headers

Per `next.config.ts` + `docs/deployment-runbook.md` §15–§16.

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 8.1 | `Content-Security-Policy` configured | **PASS** | `buildContentSecurityPolicy()` in `next.config.ts` |
| 8.2 | `unsafe-eval` **not** allowed on Vercel/production CSP | **PASS** | `isLocalDevelopment()` gate; fix `e6519c2` |
| 8.3 | Supabase + Sentry in `connect-src` | **PASS** | `*.supabase.co`, `*.ingest.sentry.io` |
| 8.4 | `Strict-Transport-Security` on Vercel (`VERCEL=1`) | **PASS** | Code path present; live HEAD probe inconclusive (timeout) |
| 8.5 | `X-Frame-Options: DENY` | **PASS** | Configured |
| 8.6 | `X-Content-Type-Options: nosniff` | **PASS** | Configured |
| 8.7 | `Referrer-Policy` + `Permissions-Policy` | **PASS** | Configured |
| 8.8 | Login/dashboard functional under CSP | **PASS** | E2E 3/3 on deployed URL |
| 8.9 | `securityheaders.com` scan recorded | **FAIL** | Checklist §3 item 14 open |
| 8.10 | Custom production domain HTTPS | **FAIL** | Using default `*.vercel.app` URL |

**Section verdict:** **WARNING** (implementation PASS; external scan + production domain FAIL)

---

## 9. Error monitoring configuration

Per Task 2.32 + `docs/deployment-runbook.md` §18.

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 9.1 | `@sentry/nextjs` integrated | **PASS** | `instrumentation.ts`, `sentry.*.config.ts`, `withSentryConfig` |
| 9.2 | Monitoring disabled without DSN (safe default) | **PASS** | `isMonitoringEnabled()` in `lib/monitoring.ts` |
| 9.3 | PII scrubbing (`beforeSend`, `sendDefaultPii: false`) | **PASS** | `lib/monitoring.ts`; 5 unit tests in `tests/monitoring/scrub.test.ts` |
| 9.4 | `app/global-error.tsx` captures React errors | **PASS** | File present |
| 9.5 | `SENTRY_DSN` set on Vercel Preview | **WARNING** | Not confirmed; no test event recorded |
| 9.6 | `SENTRY_DSN` set on Vercel Production | **FAIL** | Not verified |
| 9.7 | Staging verification via `/api/monitoring-test` | **FAIL** | QA §4 pending; live URL returns 404 (route disabled) |
| 9.8 | Production test route disabled | **PASS** | 404 on deployed URL; runbook requires unset on Production |
| 9.9 | Alert rules / on-call routing in Sentry | **FAIL** | Operational; not documented as complete |

**Section verdict:** **WARNING** (code PASS; operational configuration FAIL)

---

## 10. Playwright smoke test configuration

Per Task 2.29 PLT + `docs/deployment-runbook.md` §8.4.

| # | Check | Status | Evidence |
| --- | --- | --- | --- |
| 10.1 | Playwright installed; `npm run test:e2e` script | **PASS** | `package.json`, `@playwright/test` |
| 10.2 | `playwright.config.ts` with `E2E_BASE_URL` | **PASS** | Config loads `.env.e2e.local` |
| 10.3 | Required env vars documented | **PASS** | Runbook §8.4; `.env.example`; `e2e/env.ts` |
| 10.4 | Skip with clear message when env missing | **PASS** | Observed in CI/local runs without secrets |
| 10.5 | Placeholder credential rejection | **PASS** | `validateE2eCredentials()`; fix `40d4523` |
| 10.6 | Auth smoke spec (`/login`, sign-in, dashboard) | **PASS** | `e2e/auth.spec.ts` |
| 10.7 | Login error diagnostics on failure | **PASS** | `e2e/helpers/auth.ts` |
| 10.8 | **Executed** against live staging URL | **PASS** | 3/3 on `https://catalyst-crm-tau.vercel.app` (2026-07-06) |
| 10.9 | E2E in GitHub Actions CI | **WARNING** | Not wired; manual only (`ci.yml` comments) |
| 10.10 | Full redaction/role E2E suite (Task 2.29 ST) | **WARNING** | Deferred by design |
| 10.11 | E2E against production URL | **FAIL** | Not run; no production URL established |

**Section verdict:** **WARNING** (staging smoke PASS; CI + production coverage gaps)

---

## Consolidated scorecard

| # | Audit area | Verdict |
| --- | --- | --- |
| 1 | Vercel Production environment variables | **FAIL** |
| 2 | Vercel Preview environment variables | **WARNING** |
| 3 | Supabase production project configuration | **FAIL** |
| 4 | Supabase staging project configuration | **WARNING** |
| 5 | Auth redirect URLs | **WARNING** (staging) / **FAIL** (production) |
| 6 | RLS policies | **WARNING** |
| 7 | Middleware protection | **PASS** |
| 8 | Security headers | **WARNING** |
| 9 | Error monitoring configuration | **WARNING** |
| 10 | Playwright smoke test configuration | **WARNING** |

---

## Alignment with pilot documents

| Document | Finding |
| --- | --- |
| `docs/pilot-launch-readiness-checklist.md` | PLT **code** complete; **operational** must-fix items (§3) largely open — audit confirms |
| `docs/pilot-qa-results.md` | Staging **GO** / external pilot **NO-GO** — audit **agrees** |
| `docs/deployment-runbook.md` | Preview/staging path partially satisfied; Production §14 checklist **not** satisfied |

---

## Required actions before production pilot

Priority order from failed and warning items:

1. **Create and wire production Supabase project** — separate ref; apply migrations §14.5  
2. **Set Vercel Production env vars** — staging keys must not appear in Production scope  
3. **Configure production Auth redirect URLs** in Supabase production project  
4. **Run production smoke** — runbook §14.6 + readiness checklist §5  
5. **Configure and verify Sentry** on Preview then Production — runbook §18  
6. **Complete manual matrix** — `read_only` redaction, cross-org RLS, CRM mutations, admin settings  
7. **Record securityheaders.com scan** on production HTTPS URL  
8. **Deliver IT/security packet** and complete incident runbook contacts + tabletop  
9. **Optional:** Add E2E job to CI with GitHub secrets for regression safety  

---

## Overall production readiness verdict

| Environment | Verdict |
| --- | --- |
| **Preview / staging (`catalyst-crm-tau.vercel.app`)** | **WARNING** — suitable for internal QA and rehearsal; complete open WARNING/FAIL items before external users |
| **Production (first university pilot)** | **FAIL** — do not onboard external pilot until Required actions complete |

---

## Sign-off

| Role | Name | Date |
| --- | --- | --- |
| Audit author | Engineering (automated/doc review) | 2026-07-06 |
| Engineering lead | | |
| Executive sponsor | | |

---

*Re-run this audit after production promote, Sentry verification, and completion of `docs/pilot-launch-readiness-checklist.md` §9.*
