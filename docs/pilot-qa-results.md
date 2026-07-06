# Pilot QA Results — Catalyst CRM

**Version:** 1.0  
**Audience:** Catalyst leadership, engineering, partnerships, and operations  
**Branch tested:** `phase-2` (commit `40d4523`, tag `v0.4-pilot-ready`)  
**Companion documents:** `docs/pilot-launch-readiness-checklist.md`, `docs/pilot-onboarding-checklist.md`, `docs/deployment-runbook.md`

---

## 1. Date of QA

**July 6, 2026** (UTC-5)

QA covered Phase 2 Pilot Launch Track features deployed to Vercel preview/staging, automated smoke tests, and targeted manual verification performed during the same sprint.

---

## 2. Live URL tested

| Environment | URL | Supabase project | Notes |
| --- | --- | --- | --- |
| **Vercel preview / staging** | `https://catalyst-crm-tau.vercel.app` | Staging (via Vercel Preview env vars) | Primary URL for E2E and manual auth testing |
| **Local development** | `http://localhost:3000` | Dev project (`.env.local`) | Used for CSP dev fix verification and manual login |

**Not verified in this QA cycle:** dedicated production URL with isolated production Supabase project.

---

## 3. E2E smoke test result

**Tool:** Playwright (`npm run test:e2e`)  
**Spec:** `e2e/auth.spec.ts` (Task 2.29 PLT subset)  
**Credentials source:** `.env.e2e.local` (not committed)

| Run | Date | Target | Result | Notes |
| --- | --- | --- | --- | --- |
| Initial | 2026-07-06 | `https://catalyst-crm-tau.vercel.app` | **2 failed, 1 passed** | Placeholder email `your-test-user-email` failed HTML5 validation; form never submitted |
| After env fix attempt | 2026-07-06 | Same | **3 skipped** | Invalid placeholder `your-real-test-email` caught by test validation |
| **Final** | **2026-07-06** | Same | **3 passed (11.0s)** | Valid Supabase Auth user (`larry@elstecgroup.com`) |

**Final passing tests:**

| # | Test | Result |
| --- | --- | --- |
| 1 | `/login` loads | Pass |
| 2 | Authenticated user can sign in | Pass |
| 3 | Dashboard loads after login | Pass |

**Automated unit/CI baseline (same day):** `npm run test` — 70 passed; `npm run lint` — clean; `npm run build` — success.

---

## 4. Manual workflows tested

| Workflow | Method | Result | Evidence |
| --- | --- | --- | --- |
| `/login` page load | Manual + E2E | **Pass** | Form visible; Supabase configured on Vercel |
| Email/password sign-in | Manual + E2E | **Pass** | Lands on dashboard at `/` |
| Dashboard load after sign-in | Manual + E2E | **Pass** | Heading “School partnership pipeline dashboard” visible |
| Back to dashboard from school profile (no redirect loop) | Manual | **Pass** | User confirmed after auth redirect-loop fix (`79dc8f5`) |
| School profile load | Manual | **Pass** | Profile accessible when authenticated |
| Sign out | Manual | **Pass** | Session cleared via `/logout` |
| Local dev CSP / React Fast Refresh | Manual (`npm run dev`) | **Pass** after fix | `unsafe-eval` allowed only in local development |
| Outreach logging | Code review only | **Not manually re-tested this session** | Implemented Task 2.11 |
| Follow-up create/complete | Code review only | **Not manually re-tested this session** | Implemented Task 2.12 |
| School create/update | Code review only | **Not manually re-tested this session** | Implemented Task 2.13 |
| Contact create/update | Code review only | **Not manually re-tested this session** | Implemented Task 2.14 |
| Admin membership UI (`/settings/members`) | Not tested this session | **Pending** | Task 2.6 |
| `read_only` redaction spot-check | Not tested this session | **Pending** | Task 2.1 verification doc |
| Cross-org RLS denial | Not tested this session | **Pending** | Requires two org test users |
| Sentry staging verification | Not tested this session | **Pending** | Task 2.32 — code restored; Vercel DSN + `/api/monitoring-test` not verified |

---

## 5. Issues found

| ID | Severity | Issue | How discovered |
| --- | --- | --- | --- |
| QA-1 | **High** | Auth redirect loop — sign-in succeeded but navigation back to dashboard re-triggered login | Manual testing on school profile |
| QA-2 | **High** | E2E smoke stayed on `/login` — tests used documentation placeholder emails invalid for `type="email"` | Playwright failure snapshot |
| QA-3 | **Medium** | Local dev CSP blocked `eval()` required by React Fast Refresh | Browser console on `npm run dev` |
| QA-4 | **Medium** | Sentry error monitoring removed during unrelated research-agent revert | Pilot launch readiness review |
| QA-5 | **Low** | Stale IT security packet text said incident runbook was “to be created” | Documentation review |
| QA-6 | **Low** | OneDrive file locks caused intermittent Git object deletion failures on push | Local Git operations |
| QA-7 | **Info** | Full manual CRM matrix (roles, redaction, cross-org) not executed in this QA window | Scope gap vs readiness checklist §5 |

---

## 6. Issues fixed

| ID | Fix | Commit / artifact | Status |
| --- | --- | --- | --- |
| QA-1 | Middleware session refresh; prefetch-safe login redirects; auth callback cookie forwarding | `79dc8f5`, related auth fixes | **Fixed** — user confirmed |
| QA-2 | E2E env loading (`.env.e2e.local`); email/password validation; `Promise.all` navigation wait; login error diagnostics | `40d4523`, `e2e/env.ts`, `e2e/helpers/auth.ts` | **Fixed** — 3/3 E2E pass |
| QA-3 | CSP `unsafe-eval` only when `NODE_ENV=development` and not on Vercel | `e6519c2` | **Fixed** |
| QA-4 | Restored `@sentry/nextjs` integration with PII scrubbing (Task 2.32) | Task 2.32 implementation | **Fixed in code** — Vercel DSN verification pending |
| QA-5 | Updated `docs/pilot-it-security-packet.md` to link live incident runbook | `c21712e` | **Fixed** |
| QA-6 | Operational workaround (pause OneDrive sync, retry push) | N/A | **Workaround documented** — consider repo outside OneDrive |
| QA-7 | — | — | **Open** — run `docs/pilot-launch-readiness-checklist.md` §5 before go-live |

---

## 7. Remaining risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Production Supabase not yet isolated and smoke-tested separately from staging | Medium | High | Complete deployment runbook §14 before first external pilot |
| Sentry not configured on Vercel Preview/Production | Medium | Medium | Set `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`; run §18.4 staging verification |
| Role/redaction/RLS matrix not executed end-to-end | Medium | High | Manual §5 checklist with `read_only` + cross-org test users |
| IT/security packet not yet delivered to university | Medium | High | Partnerships to send `docs/pilot-it-security-packet.md` + MOU appendix |
| Incident runbook contacts not filled; no tabletop | Medium | Medium | Complete `docs/incident-response-runbook.md` contact tree; schedule walkthrough |
| MFA not enforced in app (documented only) | Medium | Medium | Enable MFA on Catalyst operator accounts per `docs/auth-hardening.md` |
| E2E smoke not wired in CI (manual only) | Low | Medium | Acceptable for first pilot; optional GitHub Actions job with secrets |
| Full E2E redaction suite deferred (Task 2.29 ST) | Low | Medium | Manual read-only verification until Scale Track |
| OneDrive sync interfering with Git on Windows | Medium | Low | Move clone to non-synced path for daily development |
| npm PostCSS advisory (documented exception) | High | Low | Tracked in `docs/dependency-audit-exceptions.md`; review 2026-10-01 |

---

## 8. Go / No-Go recommendation

### Staging / internal rehearsal — **GO**

**Rationale:**

- Live Vercel URL accepts sign-in and serves the dashboard.
- Playwright smoke tests pass (3/3) against `https://catalyst-crm-tau.vercel.app` with valid credentials.
- Auth redirect loop resolved.
- PLT code tasks are complete on `phase-2`; tag `v0.4-pilot-ready` pushed.

**Approved for:** continued internal use, staging demos, and completing the operational checklist.

---

### First external university pilot — **NO-GO** (conditional)

**Rationale:**

The following Pilot Launch Gate items from `docs/pilot-launch-readiness-checklist.md` §3 remain **unverified** in this QA cycle:

1. Production environment isolated from staging with production smoke complete  
2. Sentry configured and verified on staging/production  
3. Full manual verification matrix (roles, CRM mutations, redaction, cross-org RLS)  
4. IT/security packet delivered; pilot MOU signed  
5. Incident contacts named and tabletop completed  
6. Security headers scan on production URL  

**Recommendation:** Proceed to **Go** for first university onboarding only after the above items are checked off in `docs/pilot-launch-readiness-checklist.md` §9.

| Decision | Status |
| --- | --- |
| **Staging / internal GO** | Recommended |
| **First university pilot GO** | **Not yet** — complete operational checklist first |
| **Target re-review** | After production promote + §5 manual matrix + Sentry verification |

---

## Sign-off (optional)

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Engineering lead | | | |
| Partnerships lead | | | |
| Executive sponsor | | | |

---

*Update this document after each major QA pass or production promote.*
