# Phase 1 Security Sprint — Testing Report

**Project:** Catalyst CRM  
**Sprint:** Phase 1 Security (Tasks 1–15)  
**Date:** 2026-07-03  
**Test lead:** Engineering / Security

---

## Executive summary

Phase 1 testing combined **automated build/lint verification** after each task, **manual browser and role-based procedures** documented in the security checklist, and **local dependency audit** validation. No dedicated automated security test suite was added in Phase 1.

**Overall test result:** Pass for Phase 1 exit criteria, with documented gaps in automated regression coverage.

---

## Test environment

| Item | Configuration |
| --- | --- |
| OS | Windows 10/11 (developer workstations) |
| Node.js | 20.x (CI); local via `C:\Program Files\nodejs` |
| Framework | Next.js 16.2.10, React 19 |
| Database | Supabase (when env vars configured); sample data fallback when not |
| App URL | `http://localhost:3000` (HTTP dev server) |
| Auth | Supabase email/password test users with `organization_members` rows |

---

## Automated testing performed

### Per-task gates (Tasks 1–15)

Every implementation task ran:

```bash
npm run lint    # ESLint — PASS (all tasks)
npm run build   # next build — PASS (all tasks)
```

### Task 15 — CI workflow validation

| Check | Method | Result |
| --- | --- | --- |
| Workflow file syntax | Local review of `.github/workflows/ci.yml` | Pass |
| Local equivalent | `npm ci`, lint, build, audit | Pass (audit exits 1 — known issue) |
| GitHub Actions execution | Pending first push/PR with workflow | Not verified in this report |

### Dependency audit

```bash
npm audit --audit-level=moderate
```

| Finding | Severity | Result |
| --- | --- | --- |
| PostCSS GHSA-qx2v-qp2m-jg93 via Next.js | Moderate | Fail (expected); documented; CI non-blocking |

---

## Manual testing performed

### Task 1 — Server session

| Test | Expected | Result |
| --- | --- | --- |
| Unauthenticated `requireUser()` | Returns null / no user | Pass (dev verification) |
| Authenticated session | User available in server context | Pass |

### Task 2 — Auth routes

| Test | Expected | Result |
| --- | --- | --- |
| Visit `/login` | Login form renders | Pass |
| Sign in with Supabase user | Redirect to `/` | Pass |
| Visit `/logout` | Session cleared; redirect to login | Pass |

### Task 3 — Middleware

| Test | Expected | Result |
| --- | --- | --- |
| Logged out → `/` | Redirect to `/login` | Pass |
| Logged out → `/schools/school-1` | Redirect to `/login` | Pass |
| Logged in → `/` | Dashboard loads | Pass |
| Logged in → `/schools/[id]` | Profile loads | Pass |
| `/login`, `/auth/callback` | Accessible without prior session | Pass |

### Task 4 — Org/role schema

| Test | Expected | Result |
| --- | --- | --- |
| Apply migration | Tables `organizations`, `organization_members` exist | Pass (manual DB) |
| Insert membership | Role enum accepts four values | Pass |

### Task 5 — Ownership fields

| Test | Expected | Result |
| --- | --- | --- |
| Create interview/school | `organization_id`, `created_by` populated | Pass (manual) |

### Task 6 — RLS

| Test | Expected | Result |
| --- | --- | --- |
| User A (Org A) reads Org A data | Allowed | Pass (documented procedure) |
| User A reads Org B data | Denied | Pass (documented procedure) |
| `read_only` INSERT/UPDATE | Denied | Pass |
| `sales` create interview in own org | Allowed | Pass |
| `admin` delete in own org | Allowed | Pass |

*Note: Full RLS matrix should be re-run in staging before each pilot expansion.*

### Task 7 — Service role removal

| Test | Expected | Result |
| --- | --- | --- |
| App without `SUPABASE_SERVICE_ROLE_KEY` | Reads/writes work for authenticated user | Pass |
| Cross-org data access | Denied by RLS | Pass |

### Task 8 — Server action role guards

| Test | Expected | Result |
| --- | --- | --- |
| `read_only` submit interview | Denied with user-safe error | Pass |
| `sales` submit in own org | Allowed | Pass |
| `sales` forged `school_id` (other org) | Denied | Pass |
| `read_only` run research agent | Denied | Pass |

### Task 9 — Validation

| Test | Expected | Result |
| --- | --- | --- |
| Empty required fields | Validation error shown | Pass |
| Invalid UUID `school_id` | Rejected | Pass |
| Invalid website URL | Rejected | Pass |
| Oversized raw notes (>10k) | Rejected | Pass |

### Task 10 — SSRF hardening

| Test | Expected | Result |
| --- | --- | --- |
| `https://www.asu.edu` (public HTTPS) | Allowed | Pass |
| `http://localhost:3000` | Blocked | Pass |
| `http://169.254.169.254` | Blocked | Pass |
| Private IP URL | Blocked | Pass |

### Task 11 — Rate limiting

| Test | Expected | Result |
| --- | --- | --- |
| >10 interviews in 15 min | User-safe rate limit error | Pass |
| >3 research runs in 15 min | User-safe rate limit error | Pass |

### Task 12 — Audit logs

| Test | Expected | Result |
| --- | --- | --- |
| Submit interview | `audit_events` row: `interview.create` | Pass |
| Run research | Rows: `university_research.run`, `.save` | Pass |
| Audit metadata | No raw notes in metadata | Pass |

### Task 13 — Field redaction

| Test | Expected | Result |
| --- | --- | --- |
| `read_only` on `/schools/[id]` | Restricted fields show "Restricted"; banner visible | Pass |
| `sales` / `admin` same page | Full field values visible | Pass |
| `super_admin` | Full data (even without org membership) | Pass |

### Task 14 — Privacy copy

| Test | Expected | Result |
| --- | --- | --- |
| Discovery form | PII/FERPA warning; rule-based summary note | Pass |
| Research agent | Public web fetch disclosure | Pass |
| Outreach generator | Privacy reminder | Pass |
| README | Privacy section matches in-app copy | Pass |

---

## Tests not performed (gaps)

| Gap | Risk | Phase 2 action |
| --- | --- | --- |
| Automated E2E (Playwright/Cypress) | Regression undetected | Add auth + role E2E suite |
| Automated RLS integration tests | Policy drift | Supabase local + test users |
| Load/stress testing | Rate limit under concurrency unknown | k6 or artillery on actions |
| Penetration test | Unknown attack paths | Third-party or internal pentest |
| CI run on GitHub | Workflow untested in remote | Push branch; verify Actions tab |
| pglast migration parse | Skipped (tool unavailable) | Add SQL review in CI |
| MFA / session fixation | Not in scope | Phase 2 |
| Direct API redaction bypass test | R-001 | Attempt `read_only` Supabase client SELECT |

---

## Test evidence

| Evidence type | Location |
| --- | --- |
| Checklist test procedures | `docs/phase-1-security-checklist.md` |
| RLS policy documentation | `docs/supabase-rls-audit.md` |
| SSRF controls | `lib/safeFetch.ts`, `docs/security-audit.md` |
| CI workflow | `.github/workflows/ci.yml` |
| Build/lint logs | Local developer sessions; future CI artifacts |

---

## Sign-off

| Role | Assessment |
| --- | --- |
| Engineering | Automated gates pass; manual procedures sufficient for Phase 1 closure |
| Security | Accept with residual risks documented in risk register |
| CTO | Approve controlled internal pilot; require Phase 2 test automation before production |

**Phase 1 testing status: PASS (with documented gaps)**
