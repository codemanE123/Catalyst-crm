# Pilot Launch Readiness Checklist

**Version:** 1.0  
**Audience:** Catalyst leadership, engineering, partnerships, and operations  
**Purpose:** Go / No-Go gate before onboarding the **first university pilot**  
**Source of truth:** `docs/phase-2-roadmap.md` §19 (Pilot Launch Gate)  
**Last reviewed:** 2026-07-06 (branch `phase-2`)

**Companion documents:**

- `docs/pilot-onboarding-checklist.md` — step-by-step onboarding
- `docs/pilot-it-security-packet.md` — share with university IT/legal
- `docs/deployment-runbook.md` — staging, production, E2E smoke (§8.4)
- `docs/incident-response-runbook.md` — severity, rollback, communications
- `docs/auth-hardening.md` — MFA and session hygiene

---

## How to use this document

1. Confirm **code tasks** in §1–§2 match the deployed branch.
2. Complete **must-fix** items in §3 before inviting pilot users.
3. Run **manual verification** (§5) on staging, then production.
4. Record evidence in the **Go / No-Go** table (§9).

**Legend:** ✅ Done in repo · ⚠️ Done in code but needs operational verification · ❌ Not done

---

## 1. Completed Pilot Launch tasks

Pilot Launch Track (PLT) tasks from `docs/phase-2-roadmap.md`. Status reflects the `phase-2` branch as of 2026-07-06.

| Task | Title | Status | Evidence |
| --- | --- | --- | --- |
| **2.0** | Pilot onboarding & IT security packet | ✅ | `docs/pilot-onboarding-checklist.md`, `docs/pilot-it-security-packet.md` |
| **2.1** | Database-enforced read-only views | ✅ | Migration `20260703160000_add_readonly_safe_views.sql`; `docs/verification/readonly-view-verification.md` |
| **2.2** | Security unit tests + CI | ✅ | `tests/` (authz, validation, SSRF, supabaseServer); `.github/workflows/ci.yml` |
| **2.4** | Fail closed without Supabase in production | ✅ | `lib/supabaseServer.ts`; no sample data on Vercel when env vars missing |
| **2.5** | MFA & session hardening documentation | ✅ | `docs/auth-hardening.md` |
| **2.6** | Admin membership management UI | ✅ | `app/settings/members/page.tsx`; membership audit actions |
| **2.9** | Staging deployment runbook | ✅ | `docs/deployment-runbook.md` |
| **2.10** | Production deployment & security headers | ✅ | `next.config.ts` headers; runbook §14–§16 |
| **2.11** | Outreach logging | ✅ | `lib/actions/outreach.ts`, `app/components/OutreachLogForm.tsx` |
| **2.12** | Follow-up management | ✅ | `lib/actions/followUps.ts`, `app/components/FollowUpPanel.tsx` |
| **2.13** | School create and update | ✅ | `lib/actions/schools.ts`, `app/components/SchoolForm.tsx` |
| **2.14** | Contact create and update | ✅ | `lib/actions/contacts.ts`, `app/components/ContactForm.tsx` |
| **2.29** | E2E smoke tests (PLT subset) | ✅ | `e2e/auth.spec.ts`, `playwright.config.ts`, `npm run test:e2e` |
| **2.31** | Documentation sync pass | ⚠️ | `README.md` aligned; `docs/pilot-it-security-packet.md` still references incident runbook as “to be created” (stale — fix before IT send) |
| **2.32** | Error monitoring (Sentry or equivalent) | ✅ | `lib/monitoring.ts`, `instrumentation.ts`, `app/global-error.tsx` |
| **2.34** | Middleware guards for settings routes | ✅ | `middleware.ts`; `/settings/*` admin-gated |
| **2.35** | Incident response runbook | ✅ | `docs/incident-response-runbook.md` |
| **2.38** | Dependency audit allowlist with expiry | ✅ | `docs/dependency-audit-exceptions.md`; CI audit step documented |

**CRM audit coverage (incremental, per tasks 2.11–2.14):** `outreach.create`, `follow_up.create`, `follow_up.complete`, `school.create`, `school.update`, `contact.create`, `contact.update` in `lib/auditLog.ts`.

---

## 2. Remaining Pilot Launch tasks

All PLT **code tasks** are complete. Remaining work is **operational verification** before the first pilot:

**Operational completion (not separate tasks, but required for Pilot Launch Gate):**

| Item | Status | Owner |
| --- | --- | --- |
| Staging URL live with staging Supabase | ⚠️ Verify | Engineering |
| Production URL live with production Supabase | ⚠️ Verify | Engineering |
| E2E smoke executed against staging (not skipped) | ⚠️ Verify | Engineering |
| Pilot users and memberships provisioned | ⚠️ Verify | Operations |
| IT/security packet sent to university | ⚠️ Verify | Partnerships |
| Incident runbook tabletop walkthrough | ⚠️ Verify | Leadership + Engineering |
| MFA enabled for Catalyst `admin` / `sales` accounts | ⚠️ Recommended | Operations |

---

## 3. Must-fix items before first pilot

Blockers — do **not** onboard the first university until these pass.

| # | Item | Why | How to verify |
| --- | --- | --- | --- |
| 1 | **Configure Task 2.32 on Vercel** (Sentry DSN + staging verification) | Pilot Launch Gate exit criteria; no production blind spots | `docs/deployment-runbook.md` §18 |
| 2 | **Production Supabase isolated from staging** | Data breach / cross-environment contamination | Project refs differ; §10 of deployment runbook |
| 3 | **All migrations applied on production** | Schema/RLS drift breaks auth and privacy | Runbook §14.5 checklist |
| 4 | **Production env vars correct** | App fail-closed or wrong database | `NEXT_PUBLIC_SUPABASE_*` on Vercel Production only |
| 5 | **No sample data in production** | Task 2.4; institutional trust | Logged-out `/` redirects to `/login`; no demo schools |
| 6 | **Auth redirect URLs for production** | Login loops / blocked sign-in | Supabase Auth → Site URL + `/auth/callback` |
| 7 | **E2E smoke pass on staging** | Task 2.29 PLT | `E2E_BASE_URL`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD` → `npm run test:e2e` |
| 8 | **Manual smoke on production** | End-to-end pilot path | Runbook §14.6 + §5 below |
| 9 | **Pilot org, users, and roles provisioned** | Users cannot work without memberships | `docs/pilot-onboarding-checklist.md` Phase C |
| 10 | **IT/security packet delivered** | University approval (P2-R6) | MOU appendix + `docs/pilot-it-security-packet.md` |
| 11 | **Fix stale doc reference in security packet** | IT reviewer confusion | Update § referencing incident runbook “to be created” |
| 12 | **Cross-org access denied** | RLS regression | Two test users in different orgs cannot read each other’s schools |
| 13 | **`read_only` redaction spot-check** | Privacy commitment (2.1) | `docs/verification/readonly-view-verification.md` on staging/production |
| 14 | **Security headers functional scan** | Task 2.10 | `securityheaders.com` + login still works (runbook §16) |
| 15 | **Incident contacts named** | Task 2.35 operational | Fill contact tree in `docs/incident-response-runbook.md` |

---

## 4. Nice-to-have items

Acceptable to defer until **after** first pilot (Scale Track or post-pilot hardening).

| Item | Task | Rationale |
| --- | --- | --- |
| Full E2E suite (`e2e/redaction.spec.ts`, role matrix) | 2.29 (ST) | Smoke subset sufficient for Pilot Launch Gate |
| Automated E2E in GitHub Actions | 2.29 | Manual staging run acceptable for first pilot |
| RLS matrix automated tests | 2.3 | Manual cross-org checks sufficient initially |
| CEO dashboard v2 + metric glossary | 2.17, 2.18 | CEO v1 on home page acceptable per roadmap |
| Audit coverage gap review | 2.7 | Incremental audit on PLT mutations already shipped |
| Membership email invites | 2.33 | Manual provisioning via 2.6 acceptable for first pilot |
| CSV export / bulk import | 2.28, 2.37 | Not required for daily pilot workflow |
| Ambassador program | 2.24–2.26 | Scale Track only |
| Research v2 / LLM assistive | 2.21–2.23, 2.27 | Deferred to later phase |
| Repository outside OneDrive | — | Reduces Windows Git lock issues; not a product blocker |
| Blocking `npm audit` for PostCSS advisory | 2.38 | Documented exception until Next.js bundles patched PostCSS |
| University research agent on dashboard | — | Removed from UI; deferred per roadmap |

---

## 5. Manual verification checklist

Run on **staging** before production promote; repeat critical paths on **production** after go-live.

### Authentication and navigation

| # | Test | Staging | Production |
| --- | --- | --- | --- |
| 1 | `/login` loads; sign-in form visible | [ ] | [ ] |
| 2 | Unauthenticated `/` redirects to `/login` | [ ] | [ ] |
| 3 | Sign in as `sales` → dashboard loads | [ ] | [ ] |
| 4 | “Back to dashboard” from school profile — no redirect loop | [ ] | [ ] |
| 5 | Sign out (`/logout`) clears session | [ ] | [ ] |

### Roles and privacy

| # | Test | Staging | Production |
| --- | --- | --- | --- |
| 6 | `read_only` user sees dashboard; restricted fields redacted | [ ] | [ ] |
| 7 | `read_only` cannot see outreach/follow-up/school/contact mutation forms | [ ] | [ ] |
| 8 | `sales` can log outreach, follow-up, school, contact | [ ] | [ ] |
| 9 | Non-admin cannot access `/settings/members` | [ ] | [ ] |
| 10 | `admin` can access `/settings/members` and change roles | [ ] | [ ] |
| 11 | User in org A cannot open org B school profile | [ ] | [ ] |

### CRM workflows (sales/admin)

| # | Test | Staging | Production |
| --- | --- | --- | --- |
| 12 | Create school from dashboard | [ ] | [ ] |
| 13 | Update school status (forward-only transition) | [ ] | [ ] |
| 14 | Create contact on school profile | [ ] | [ ] |
| 15 | Update contact on school profile | [ ] | [ ] |
| 16 | Log outreach on school profile | [ ] | [ ] |
| 17 | Create and complete follow-up | [ ] | [ ] |

### Audit and ops

| # | Test | Staging | Production |
| --- | --- | --- | --- |
| 18 | CRM mutation produces `audit_events` row (metadata only) | [ ] | [ ] |
| 19 | Error monitoring receives test event (Sentry configured on Vercel) | [ ] | [ ] |
| 20 | `npm run test` + `npm run build` green on release commit | [ ] | [ ] |

---

## 6. Deployment checklist

| # | Step | Done |
| --- | --- | --- |
| 1 | GitHub CI green on release branch (`lint`, `test`, `build`) | [ ] |
| 2 | Staging: migrations applied before deploy | [ ] |
| 3 | Staging: Vercel Preview/`main` env vars → **staging** Supabase | [ ] |
| 4 | Staging smoke complete (§5 + `npm run test:e2e`) | [ ] |
| 5 | Production: migrations applied **before** first production deploy | [ ] |
| 6 | Production: Vercel **Production** env vars → **production** Supabase | [ ] |
| 7 | Production: custom domain + HTTPS assigned | [ ] |
| 8 | Production: security headers scan (runbook §16) | [ ] |
| 9 | Production smoke complete (runbook §14.6) | [ ] |
| 10 | Deployment URLs and Supabase refs recorded in pilot record | [ ] |
| 11 | Rollback owner identified (Vercel promote + runbook §11) | [ ] |

**Detailed procedures:** `docs/deployment-runbook.md` §8, §14, §16.

---

## 7. Supabase checklist

Complete per environment (**staging** and **production** separately).

| # | Step | Staging | Production |
| --- | --- | --- | --- |
| 1 | Dedicated project created; ref recorded | [ ] | [ ] |
| 2 | All 11 migrations applied in order (runbook §5) | [ ] | [ ] |
| 3 | RLS enabled on CRM tables | [ ] | [ ] |
| 4 | Read-only views exist (`interviews_readonly`, `follow_ups_readonly`) | [ ] | [ ] |
| 5 | Pilot `organizations` row created | [ ] | [ ] |
| 6 | Auth users created for approved participants only | [ ] | [ ] |
| 7 | `organization_members` rows with correct roles | [ ] | [ ] |
| 8 | Schools/contacts use correct `organization_id` | [ ] | [ ] |
| 9 | **Site URL** matches deployment origin | [ ] | [ ] |
| 10 | **Redirect URL** `{origin}/auth/callback` configured | [ ] | [ ] |
| 11 | `SUPABASE_SERVICE_ROLE_KEY` **not** in Vercel app env | [ ] | [ ] |
| 12 | Staging test markers absent in production DB | [ ] | N/A |
| 13 | MFA enabled for Catalyst operator accounts (recommended) | [ ] | [ ] |

**Provisioning SQL and examples:** `docs/pilot-onboarding-checklist.md`.

---

## 8. Vercel checklist

| # | Step | Preview / Staging | Production |
| --- | --- | --- | --- |
| 1 | Repository connected; builds succeed | [ ] | [ ] |
| 2 | `NEXT_PUBLIC_SUPABASE_URL` set (correct project ref) | [ ] | [ ] |
| 3 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` set (matches Supabase API) | [ ] | [ ] |
| 4 | `SUPABASE_SERVICE_ROLE_KEY` **not** set | [ ] | [ ] |
| 5 | `SENTRY_DSN` set (after Task 2.32) | [ ] | [ ] |
| 6 | Preview deployments use **staging** Supabase keys | [ ] | N/A |
| 7 | Production scope uses **production** keys only | N/A | [ ] |
| 8 | `/login` loads on deployment URL | [ ] | [ ] |
| 9 | Auth sign-in completes without CSP console errors | [ ] | [ ] |
| 10 | Redeploy after any env var change | [ ] | [ ] |

**E2E against Vercel:**

```powershell
$env:E2E_BASE_URL = "https://<staging-or-production-url>"
$env:E2E_USER_EMAIL = "<smoke-test-user>"
$env:E2E_USER_PASSWORD = "<password>"
npm run test:e2e
```

See `docs/deployment-runbook.md` §8.4.

---

## 9. Go / No-Go decision table

Complete at the Pilot Launch Gate review meeting. **Go** requires all **Blocker** rows marked **Pass**.

| # | Criterion | Blocker? | Pass | Fail | Evidence / link |
| --- | --- | --- | --- | --- | --- |
| 1 | All PLT code tasks complete (incl. **2.32** monitoring) | Yes | [ ] | [ ] | |
| 2 | Staging hosted with HTTPS; staging Supabase wired | Yes | [ ] | [ ] | URL: __________ |
| 3 | Production hosted with HTTPS; production Supabase wired | Yes | [ ] | [ ] | URL: __________ |
| 4 | Migrations applied on staging + production | Yes | [ ] | [ ] | |
| 5 | No sample data on production | Yes | [ ] | [ ] | |
| 6 | E2E smoke passed on staging | Yes | [ ] | [ ] | |
| 7 | Manual verification §5 passed on production | Yes | [ ] | [ ] | |
| 8 | IT/security packet sent; pilot MOU signed | Yes | [ ] | [ ] | Date: __________ |
| 9 | Incident runbook contacts filled; tabletop done | Yes | [ ] | [ ] | |
| 10 | Error monitoring configured on staging + production | Yes | [ ] | [ ] | |
| 11 | `read_only` redaction verified | Yes | [ ] | [ ] | |
| 12 | Cross-org RLS verified | Yes | [ ] | [ ] | |
| 13 | Security headers scan acceptable | Yes | [ ] | [ ] | Scan URL: __________ |
| 14 | CI green on release commit | Yes | [ ] | [ ] | |
| 15 | Pilot users provisioned with correct roles | Yes | [ ] | [ ] | |
| 16 | Catalyst admin assigned for support | No | [ ] | [ ] | Name: __________ |
| 17 | MFA on Catalyst `admin`/`sales` accounts | No | [ ] | [ ] | |
| 18 | Full E2E redaction suite (2.29 ST) | No | [ ] | [ ] | Deferred OK |

### Decision

| Field | Value |
| --- | --- |
| **Review date** | |
| **Attendees** | |
| **Release commit / tag** | |
| **Decision** | [ ] **GO** — authorize first university pilot onboarding &nbsp;&nbsp; [ ] **NO-GO** — block until failed rows resolved |
| **Failed criteria (if NO-GO)** | |
| **Target re-review date** | |
| **Approved by** | |

---

## References

- `docs/phase-2-roadmap.md` — §5 milestones, §17 tasks, §19 Pilot Launch Gate exit criteria
- `docs/pilot-onboarding-checklist.md` — onboarding phases and smoke table
- `docs/deployment-runbook.md` — staging, production, E2E, rollback
- `docs/incident-response-runbook.md` — incident severity and response
- `docs/verification/readonly-view-verification.md` — read-only privacy checks
- `docs/dependency-audit-exceptions.md` — npm audit governance (Task 2.38)

---

*Update this checklist when PLT task status changes. One task at a time — tested, committed, and verified independently.*
