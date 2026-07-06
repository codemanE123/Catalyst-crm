# Deployment Runbook — Staging, Preview, and Production

**Version:** 1.5 (Phase 2 Task 2.32)  
**Audience:** Catalyst engineering and operations  
**Companion documents:** `docs/pilot-onboarding-checklist.md`, `docs/auth-hardening.md`, `docs/pilot-it-security-packet.md`, `docs/incident-response-runbook.md`

**Scope:** Staging and preview (Task 2.9), production promote and security headers (Task 2.10), and **Sentry error monitoring** (Task 2.32).

---

## 1. Environment model

| Environment | Hosting | Supabase project | Sample data | Purpose |
| --- | --- | --- | --- | --- |
| **Local** | `npm run dev` | Dev project or none | Allowed when env vars missing and `NODE_ENV=development` | Feature development |
| **Staging** | Vercel (stable staging URL or `main` deployment) | **Dedicated staging project** | **Disabled** — fail closed without env vars | Pre-production validation, MFA rehearsal, smoke tests |
| **Preview** | Vercel per-PR deployment | **Same as staging** (recommended) | **Disabled** | Review changes before merge |
| **Production** | Vercel production (Task 2.10) | **Dedicated production project** | **Disabled** | Live pilot users |

**Rule:** Never point staging or preview deployments at the production Supabase project.

---

## 2. Architecture

```
GitHub (push / PR)
       │
       ▼
  GitHub Actions CI          Vercel (connected repo)
  lint → test → build              │
                                   ├── Preview deploy (per PR)
                                   └── Staging / Production deploy (branch-based)
                                            │
                                            ▼
                                   NEXT_PUBLIC_SUPABASE_URL
                                   NEXT_PUBLIC_SUPABASE_ANON_KEY
                                            │
                                            ▼
                                   Supabase Cloud (staging or prod project)
                                   Postgres + Auth + RLS
```

**Deployment target:** [Vercel](https://vercel.com) (Next.js) + [Supabase Cloud](https://supabase.com) (managed Postgres and Auth).

---

## 3. Staging Supabase project

### 3.1 Create the project

1. Sign in to [Supabase Dashboard](https://supabase.com/dashboard).
2. **New project** — name it clearly (e.g. `catalyst-crm-staging`).
3. Choose region (document in pilot record; match production region when possible).
4. Save the **project reference** (subdomain in API URL, e.g. `abcdefghijklmnop` in `https://abcdefghijklmnop.supabase.co`).
5. Record credentials in your team secret store — not in the git repository.

### 3.2 Retrieve API keys

From **Project Settings → API**:

| Key | Use in Vercel | Notes |
| --- | --- | --- |
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` | Public; safe in client bundle |
| **anon public** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public; RLS enforces access |
| **service_role** | **Do not set** on Vercel user-facing deployments | Bypasses RLS |

### 3.3 Apply migrations

Apply every file in `supabase/migrations/` in **timestamp order** on the staging project before first deploy. See [§5 Migration order](#5-migration-order).

Methods:

- **Supabase SQL Editor** — paste and run each file in order.
- **Supabase CLI** — `supabase db push` or `supabase migration up` when CLI is linked to the staging project.

### 3.4 Seed staging data

After migrations:

1. Create one `organizations` row for rehearsal.
2. Create Auth users and `organization_members` rows (see `docs/pilot-onboarding-checklist.md`).
3. Optionally seed schools/contacts for smoke tests.
4. Use **fake or anonymized** data only — staging is not for real student PII.

---

## 4. Vercel staging deployment

### 4.1 Connect the repository

1. [Vercel Dashboard](https://vercel.com) → **Add New Project**.
2. Import the Catalyst CRM GitHub repository.
3. Framework preset: **Next.js** (auto-detected).
4. Build command: `npm run build` (default).
5. Install command: `npm ci` (default).

### 4.2 Branch and deployment mapping (recommended)

| Vercel target | Git branch | Supabase project | Typical URL |
| --- | --- | --- | --- |
| **Production** | `main` (after Task 2.10) | Production | `https://crm.example.com` |
| **Staging** | `main` or dedicated `staging` branch | Staging | `https://staging.crm.example.com` or Vercel-assigned URL |
| **Preview** | Pull request branches | Staging | `https://catalyst-crm-<hash>-<team>.vercel.app` |

For pilot phase, a common pattern is:

- **Preview** deployments on every PR → staging Supabase env vars.
- **Production** deployment on `main` → production Supabase (Task 2.10).

Until production is configured, treat the stable `main` deployment URL as **staging**.

### 4.3 Enable preview deployments

1. Vercel project → **Settings → Git**.
2. Enable **Pull Request Comments** and **Preview Deployments**.
3. Each PR receives a unique preview URL after CI passes locally on Vercel's build.

Preview deployments use the **Preview** environment variable scope in Vercel unless overridden.

### 4.4 Custom staging domain (optional)

1. Vercel → **Settings → Domains**.
2. Add subdomain, e.g. `staging.crm.example.com`.
3. Configure DNS per Vercel instructions.
4. Assign domain to the staging branch or `main` (pre-production).
5. Update Supabase Auth redirect URLs (§6) to match the new origin.

---

## 5. Migration order

Apply on the **target Supabase project** before relying on that environment. Files live in `supabase/migrations/`.

| # | Migration file | Purpose |
| --- | --- | --- |
| 1 | `20260702200600_initial_crm_schema.sql` | Core CRM tables |
| 2 | `20260702210800_add_discovery_interview_fields.sql` | Interview fields |
| 3 | `20260702212500_add_ai_summary_interview_fields.sql` | AI summary fields |
| 4 | `20260702221300_add_university_research_profile_fields.sql` | Research profile fields |
| 5 | `20260703142600_add_organizations_and_roles.sql` | Organizations and roles |
| 6 | `20260703143300_add_crm_ownership_fields.sql` | `organization_id` ownership |
| 7 | `20260703144000_replace_broad_rls_policies.sql` | Org-scoped RLS |
| 8 | `20260703152200_add_rate_limit_events.sql` | Rate limit table |
| 9 | `20260703152700_add_audit_events.sql` | Audit events |
| 10 | `20260703160000_add_readonly_safe_views.sql` | Read-only safe views |
| 11 | `20260704203000_add_organization_members_admin_policies.sql` | Admin membership RLS |

**New migration discipline:** When adding migrations after initial staging setup, apply to staging first, run smoke tests, then production.

---

## 6. Environment variables

### 6.1 Required (staging and preview)

| Variable | Example | Vercel scope |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<staging-ref>.supabase.co` | Preview, Development (optional), Production (separate prod value in 2.10) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbG...` (staging anon key) | Preview, Development (optional), Production (separate prod value in 2.10) |

Set in Vercel → **Settings → Environment Variables**:

- **Preview** — staging Supabase URL and anon key (PR deployments).
- **Production** — production values only after Task 2.10 (do not use staging keys here).

### 6.2 Must not set (user-facing deployments)

| Variable | Reason |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS; not used by user-facing app paths |

### 6.3 Behavior without env vars

When `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing:

- **Vercel (staging/preview/production):** App fails closed with a configuration error — no sample data (Phase 2 Task 2.4).
- **Local `NODE_ENV=development`:** Sample data may render for demos.

### 6.4 Error monitoring variables (Task 2.32)

Set in Vercel when Sentry is enabled. Monitoring is **inactive** when DSN is unset.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `SENTRY_DSN` | Preview, Production | Yes (when monitoring on) | Server-side Sentry DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Preview, Production | Recommended | Client-side Sentry DSN (same project DSN) |
| `SENTRY_ENVIRONMENT` | Preview, Production | Optional | Override environment tag (`staging`, `production`) |
| `SENTRY_ENABLE_TEST_ROUTE` | Preview only | Optional | Set `true` to enable `GET /api/monitoring-test` for verification |
| `SENTRY_ORG` | Build-time | Optional | Sentry org slug for source map upload |
| `SENTRY_PROJECT` | Build-time | Optional | Sentry project slug for source map upload |
| `SENTRY_AUTH_TOKEN` | Build-time | Optional | Upload source maps in CI/Vercel builds |

**Environment mapping (default when `SENTRY_ENVIRONMENT` unset):**

| Vercel `VERCEL_ENV` | Sentry environment tag |
| --- | --- |
| `preview` | `staging` |
| `production` | `production` |
| `development` | `development` |

**Do not set** `SENTRY_DSN` on local `.env.local` unless intentionally testing — avoids polluting staging/production dashboards.

See [§18 Error monitoring (Sentry)](#18-error-monitoring-sentry--task-232) for full setup.

### 6.5 Future variables

| Variable | Task | Purpose |
| --- | --- | --- |
| Custom domain secrets | 2.10 | Production TLS (documented in Vercel Domains) |

---

## 7. Auth redirect URLs

Configure in **Supabase Dashboard → Authentication → URL Configuration** on the **staging** project.

| Setting | Staging value |
| --- | --- |
| **Site URL** | Staging deployment origin, e.g. `https://staging.crm.example.com` or your stable Vercel `main` URL |
| **Redirect URLs** | `https://<staging-origin>/auth/callback` |

For **Vercel preview** deployments, add a wildcard or each preview origin Supabase supports:

- `https://*.vercel.app/auth/callback` (if your Supabase plan supports wildcard redirect URLs), **or**
- Add individual preview URLs when testing a specific PR, **or**
- Use a stable staging URL for auth testing and previews only for UI review without login.

Also keep for local development on the same Supabase project if shared:

- `http://localhost:3000/auth/callback`

**Checklist:**

- [ ] Site URL matches the URL users open in the browser
- [ ] `/auth/callback` listed for staging origin
- [ ] Sign-in completes and lands on `/` dashboard
- [ ] Sign-out at `/logout` clears session

See `docs/auth-hardening.md` for MFA rehearsal on staging.

---

## 8. Deployment checklist

Use this checklist for **first staging setup** and **repeat deploys** after infrastructure changes.

### 8.1 One-time staging setup

- [ ] Staging Supabase project created; project ref recorded
- [ ] All migrations applied in order (§5)
- [ ] Staging organization, users, and memberships created
- [ ] Vercel project connected to repository
- [ ] `NEXT_PUBLIC_SUPABASE_URL` set for **Preview** (and staging target)
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` set for **Preview** (and staging target)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` **not** set on Vercel
- [ ] Supabase Auth Site URL and redirect URLs configured (§7)
- [ ] Preview deployments enabled on PRs
- [ ] Staging URL recorded in pilot onboarding record

### 8.2 Per deploy (merge to main or PR preview)

- [ ] GitHub CI passes (`lint`, `test`, `build`)
- [ ] Vercel build succeeds
- [ ] `/login` loads on deployment URL
- [ ] Unauthenticated `/` redirects to `/login`
- [ ] Sign-in works with staging test user
- [ ] New migrations applied to staging DB **before** deploy if schema changed

### 8.3 Post-deploy smoke (staging)

Run `docs/pilot-onboarding-checklist.md` smoke verification table, or minimum:

- [ ] `/login` loads
- [ ] Sign in as `sales` → dashboard loads
- [ ] School profile loads for own org
- [ ] Sign out clears session

### 8.4 E2E smoke tests (Task 2.29 — Pilot Launch Track)

Automated Playwright smoke tests cover login page load, sign-in, and dashboard load. They run **against a deployed URL** (local dev server or Vercel staging/preview), not against unit-test mocks.

**Prerequisites:**

1. Target environment has Supabase env vars configured and a test user exists (§3.4).
2. Supabase Auth redirect URLs include the target origin (§7).
3. Playwright browsers installed once per machine: `npx playwright install chromium`

**Environment variables:**

| Variable | Example | Required |
| --- | --- | --- |
| `E2E_BASE_URL` | `https://staging.crm.example.com` or `http://localhost:3000` | Yes |
| `E2E_USER_EMAIL` | `sales-smoke@example.com` | Yes |
| `E2E_USER_PASSWORD` | Staging test password | Yes |

If any variable is missing, `npm run test:e2e` **skips** all E2E tests and prints which variables to set. CI remains green without secrets.

**Run locally against `npm run dev`:**

```powershell
# Terminal 1
npm run dev

# Terminal 2 (PowerShell)
$env:E2E_BASE_URL = "http://localhost:3000"
$env:E2E_USER_EMAIL = "your-staging-user@example.com"
$env:E2E_USER_PASSWORD = "your-password"
npm run test:e2e
```

**Run against Vercel staging or preview:**

```powershell
$env:E2E_BASE_URL = "https://your-staging-or-preview-url.vercel.app"
$env:E2E_USER_EMAIL = "sales-smoke@example.com"
$env:E2E_USER_PASSWORD = "your-password"
npm run test:e2e
```

Use the **stable staging `main` deployment URL** before Pilot Launch Gate. Preview URLs work when Supabase redirect URLs include that preview origin (§7).

**Expected results:**

| Test | Pass criteria |
| --- | --- |
| `/login` loads | Sign-in heading and form visible |
| Authenticated sign-in | Redirect to `/` after submit |
| Dashboard loads | Heading “School partnership pipeline dashboard” visible |

**Deferred (Scale Track):** `e2e/redaction.spec.ts`, role-matrix flows, and CI wiring — see Task 2.29 full suite in `docs/phase-2-roadmap.md`.

---

## 9. Verification checklist

Confirm staging is correctly wired end-to-end.

| # | Check | How | Expected |
| --- | --- | --- | --- |
| 1 | Correct Supabase project | See [§10](#10-verify-staging-uses-the-correct-supabase-project) | Staging ref matches Vercel env vars |
| 2 | No sample data fallback | Open `/` without signing in on Vercel URL | Redirect to `/login`, not demo dashboard |
| 3 | Env vars present | Vercel → Settings → Environment Variables | Preview has staging URL + anon key |
| 4 | Migrations current | Supabase → Table Editor | `organizations`, `interviews_readonly`, `audit_events` exist |
| 5 | RLS active | Attempt cross-org access with test users | Denied by policy |
| 6 | Auth callback | Sign in on staging URL | Lands on dashboard, no redirect loop |
| 7 | PR preview | Open PR → follow Vercel comment link | `/login` loads |
| 8 | Service role absent | Vercel env var list | No `SUPABASE_SERVICE_ROLE_KEY` |

---

## 10. Verify staging uses the correct Supabase project

Use these steps to prove the Vercel deployment talks to **staging**, not production or another project.

### 10.1 Compare project reference in URL

1. Vercel → **Settings → Environment Variables** → open `NEXT_PUBLIC_SUPABASE_URL` for Preview.
2. Note the subdomain: `https://**<project-ref>**.supabase.co`.
3. Supabase Dashboard → staging project → **Settings → General** → confirm **Reference ID** matches `<project-ref>`.
4. Repeat for Production scope only when production is configured — refs **must differ** between staging and production.

### 10.2 Anon key fingerprint

1. Supabase staging project → **Settings → API** → copy **anon public** key.
2. Compare to Vercel Preview `NEXT_PUBLIC_SUPABASE_ANON_KEY` — must match exactly.
3. If keys differ, redeploy after fixing Vercel env vars.

### 10.3 Unique staging marker (functional test)

1. In **staging** Supabase SQL Editor only, create a recognizable test org:

```sql
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-4000-8000-000000000099', 'STAGING_VERIFICATION_DO_NOT_USE_IN_PROD');
```

2. Sign in on the Vercel staging/preview URL as a user with membership in that org (or query schools tied to it).
3. If the marker org or its data appears, the deployment uses that Supabase project.
4. Confirm the same marker **does not** exist in the production Supabase project.
5. Delete the test org after verification if not needed.

### 10.4 Auth users isolation

1. Create a test user **only** in staging Supabase Auth.
2. Sign in on staging URL — should succeed.
3. Attempt sign-in on production URL (when live) with the same credentials — should **fail** (user does not exist in prod).

---

## 11. Rollback procedure

For **security, availability, or data incidents**, declare severity and follow
`docs/incident-response-runbook.md` in parallel with technical rollback below.

### 11.1 Disable preview deployments

If preview deploys cause noise or misconfiguration:

1. Vercel → **Settings → Git** → disable **Preview Deployments**, or
2. Disconnect Git integration temporarily.

No production impact if production uses a separate env scope.

### 11.2 Revert a bad application deploy

See also `docs/incident-response-runbook.md` §12 (Vercel rollback).

1. Vercel → **Deployments** → select last known good deployment → **Promote to Production** (or redeploy for staging).
2. Or revert the git commit on `main` and push — Vercel rebuilds automatically.

Application rollback does **not** roll back database migrations.

### 11.3 Bad migration on staging

See also `docs/incident-response-runbook.md` §11 (Supabase rollback).

1. Do **not** deploy app code that depends on a failed migration.
2. Fix forward with a new migration or manual SQL on staging only.
3. Re-run smoke verification before promoting fixes toward production.

### 11.4 Wrong Supabase env vars

See also `docs/incident-response-runbook.md` §13 (environment variable compromise).

1. Update Vercel Preview variables to correct staging URL and anon key.
2. **Redeploy** (env changes require a new deployment to take effect).
3. Re-run [§10](#10-verify-staging-uses-the-correct-supabase-project).

### 11.5 Doc-only rollback (Tasks 2.9 / 2.10)

Revert `docs/deployment-runbook.md` and related README links. No runtime change.

### 11.6 Production security headers rollback (Task 2.10)

If CSP or other headers break login, auth callback, or Next.js assets — or during a
SEV-2+ outage — coordinate with `docs/incident-response-runbook.md` §8.

1. Revert `next.config.ts` header changes (or remove the offending directive).
2. Push to `main` or **Promote to Production** the last known good Vercel deployment.
3. Re-scan with [securityheaders.com](https://securityheaders.com) after redeploy.
4. Fix forward with a narrower CSP adjustment rather than leaving headers disabled.

---

## 12. CI and deployment automation

**Current state (Task 2.29 smoke):** GitHub Actions runs `lint`, `test`, and `build` only. E2E smoke (`npm run test:e2e`) is run **manually** against staging when `E2E_*` env vars are set — see [§8.4](#84-e2e-smoke-tests-task-229--pilot-launch-track). Deployment is handled by **Vercel Git integration** (preview on PR, branch deploys on push).

**Not implemented in Task 2.29 smoke:**

- Automatic E2E job in GitHub Actions (optional future: secrets for `E2E_*` on `main`)
- Full Playwright suite (`e2e/redaction.spec.ts`, role flows) — Scale Track

See comments in `.github/workflows/ci.yml` for future optional workflows.

---

## 13. Related tasks

| Task | Adds to this runbook |
| --- | --- |
| 2.10 | Production promote, security headers (§15–16) — **complete** |
| 2.29 | Playwright E2E smoke against staging URL — **smoke complete** (§8.4); full redaction suite deferred |
| 2.32 | Error monitoring (Sentry) — **complete** (§18) |
| 2.35 | Incident response runbook — **complete** (`docs/incident-response-runbook.md`) |

---

## 14. Production deployment (Task 2.10)

Production is a **separate Supabase project** and **Vercel Production** environment. Never reuse staging credentials on Production scope.

### 14.1 Production promote procedure

Complete **after** staging smoke tests pass (§8.3) and security headers are validated on a Vercel HTTPS URL (§16).

| Step | Action | Owner |
| --- | --- | --- |
| 1 | Confirm GitHub CI green on `main` (`lint`, `test`, `build`) | Engineering |
| 2 | Complete [production Supabase checklist](#142-production-supabase-checklist) | Engineering |
| 3 | Complete [production Vercel env checklist](#143-production-vercel-environment-variables) | Engineering |
| 4 | Configure [production Auth redirect URLs](#144-production-auth-redirect-urls) | Engineering |
| 5 | Assign **custom production domain** in Vercel (HTTPS automatic) | Engineering |
| 6 | Set Vercel **Production** env vars to production Supabase keys | Engineering |
| 7 | Deploy `main` to Vercel Production (auto on push, or manual promote) | Engineering |
| 8 | Run [securityheaders.com verification](#16-security-headers-verification) on production URL | Engineering |
| 9 | Run [production smoke](#146-production-smoke-verification) | Engineering + pilot lead |
| 10 | Record production URL, Supabase ref, and promote date in pilot record | Ops |

**Cadence (pilot):** weekly or bi-weekly production promote after staging validation — see `docs/phase-2-roadmap.md` §13.

**Emergency promote:** Vercel → Deployments → select known-good build → **Promote to Production** (skips git revert when hotfix already on `main`).

### 14.2 Production Supabase checklist

One-time setup on the **production** Supabase project (not staging):

- [ ] New project created (e.g. `catalyst-crm-production`); ref recorded separately from staging
- [ ] Region documented and aligned with pilot data-residency agreement
- [ ] [Migration apply checklist](#145-production-migration-apply-checklist) completed in order
- [ ] RLS enabled on CRM tables (`schools`, `contacts`, `outreach`, `interviews`, `follow_ups`, `organization_members`)
- [ ] Read-only views exist (`interviews_readonly`, `follow_ups_readonly`)
- [ ] Pilot `organizations` row created (production UUID recorded)
- [ ] Production Auth users created only for approved pilot participants
- [ ] `organization_members` rows link users to pilot org with correct roles
- [ ] Pilot schools use correct `organization_id`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` **not** stored in Vercel Production env
- [ ] Staging test marker data (e.g. `STAGING_VERIFICATION_*`) **absent** in production

### 14.3 Production Vercel environment variables

Vercel → **Settings → Environment Variables** → **Production** scope only:

| Variable | Value | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<production-ref>.supabase.co` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production **anon public** key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Do not set** |

**Verification:**

- [ ] Production `NEXT_PUBLIC_SUPABASE_URL` ref ≠ staging ref
- [ ] Preview scope still uses **staging** keys (unchanged)
- [ ] Redeploy Production after any env var change

### 14.4 Production Auth redirect URLs

Configure in **production** Supabase project → **Authentication → URL Configuration**:

| Setting | Production value |
| --- | --- |
| **Site URL** | `https://<production-domain>` (custom domain or Vercel production URL) |
| **Redirect URLs** | `https://<production-domain>/auth/callback` |

**Checklist:**

- [ ] Site URL matches the URL shared with pilot users
- [ ] `/auth/callback` added for production origin only (do not point production Auth at staging domain)
- [ ] Email/password sign-in at `/login` completes without redirect loop
- [ ] OAuth/magic-link (if used) returns through `/auth/callback` to dashboard
- [ ] `/logout` clears session

See `docs/auth-hardening.md` for MFA on production admin/sales accounts after go-live.

### 14.5 Production migration apply checklist

Apply on the **production** Supabase project **before** first production deploy and before any production promote that depends on new schema.

| # | Migration | Applied | Verified |
| --- | --- | --- | --- |
| 1 | `20260702200600_initial_crm_schema.sql` | [ ] | [ ] |
| 2 | `20260702210800_add_discovery_interview_fields.sql` | [ ] | [ ] |
| 3 | `20260702212500_add_ai_summary_interview_fields.sql` | [ ] | [ ] |
| 4 | `20260702221300_add_university_research_profile_fields.sql` | [ ] | [ ] |
| 5 | `20260703142600_add_organizations_and_roles.sql` | [ ] | [ ] |
| 6 | `20260703143300_add_crm_ownership_fields.sql` | [ ] | [ ] |
| 7 | `20260703144000_replace_broad_rls_policies.sql` | [ ] | [ ] |
| 8 | `20260703152200_add_rate_limit_events.sql` | [ ] | [ ] |
| 9 | `20260703152700_add_audit_events.sql` | [ ] | [ ] |
| 10 | `20260703160000_add_readonly_safe_views.sql` | [ ] | [ ] |
| 11 | `20260704203000_add_organization_members_admin_policies.sql` | [ ] | [ ] |

**Discipline:** apply and smoke-test on **staging** first; then apply to production before promoting dependent app code.

### 14.6 Production smoke verification

Minimum checks on the **production URL** after promote:

| # | Test | Expected | Pass |
| --- | --- | --- | --- |
| 1 | Visit `/` logged out | Redirect to `/login` | [ ] |
| 2 | `/login` page loads | No CSP console errors; form visible | [ ] |
| 3 | Sign in as pilot `sales` | Dashboard loads | [ ] |
| 4 | Open school profile | Data for own org only | [ ] |
| 5 | Sign in as university `read_only` | Restricted fields not exposed | [ ] |
| 6 | `/settings/members` as non-admin | Redirect to dashboard | [ ] |
| 7 | `/settings/members` as `admin` | Page loads | [ ] |
| 8 | Sign out | Session cleared | [ ] |
| 9 | No sample data | Dashboard empty or real data only — not demo schools | [ ] |

Full table: `docs/pilot-onboarding-checklist.md` → Smoke verification.

### 14.7 Production rollback procedure

During a production incident, assign an **incident commander** per
`docs/incident-response-runbook.md` before executing rollback.

| Scenario | Action |
| --- | --- |
| **Bad application deploy** | Vercel → Deployments → last good build → **Promote to Production**; or git revert on `main` and redeploy |
| **Wrong production Supabase env** | Fix Production env vars → redeploy; verify ref per §10.1 |
| **Security headers break app** | See [§11.6](#116-production-security-headers-rollback-task-210) and incident runbook §8 |
| **Bad production migration** | Do not promote app depending on failed migration; fix forward on production DB; re-smoke — see incident runbook §11 |
| **Secret / env compromise** | Rotate keys per `docs/incident-response-runbook.md` §13, then redeploy |
| **Full pilot halt** | Disable new user provisioning; communicate outage; roll back app deploy; keep DB for forensics |

Application rollback does **not** reverse database migrations. Prefer forward-fix migrations.

---

## 15. Security headers (Task 2.10)

Configured in `next.config.ts` for all routes. Applied on Vercel (staging, preview, and production). HSTS is sent only when `VERCEL=1` (omitted on local `npm run dev`).

| Header | Value (summary) |
| --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (Vercel only) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Content-Security-Policy` | See below |

**CSP directives (basic, Next.js/Supabase compatible):**

- `default-src 'self'`
- `script-src 'self' 'unsafe-inline'` — Next.js hydration
- `style-src 'self' 'unsafe-inline'` — Tailwind
- `img-src 'self' data: blob: https:`
- `font-src 'self' data:`
- `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io` — Supabase Auth/API + Sentry ingest
- `frame-ancestors 'none'`
- `base-uri 'self'`
- `form-action 'self'` — login server action
- `object-src 'none'`

University research fetches run **server-side** and are not limited by browser CSP.

---

## 16. Security headers verification

Run before Pilot Launch Gate production go-live and after any `next.config.ts` header change.

### 16.1 securityheaders.com scan

1. Open [https://securityheaders.com](https://securityheaders.com).
2. Enter the **HTTPS** deployment URL (staging or production).
3. Submit scan.
4. Confirm presence of:
   - `Strict-Transport-Security` (graded; may require production/custom domain for full score)
   - `X-Frame-Options` or `Content-Security-Policy` with `frame-ancestors`
   - `X-Content-Type-Options`
   - `Referrer-Policy`
   - `Content-Security-Policy`
5. Save scan URL or PDF for IT packet evidence.

**Pilot target:** aim for **A** or **A+** on production; investigate any **missing** critical headers.

### 16.2 Functional verification (browser)

After scan, manually confirm headers do not break auth:

1. Open browser DevTools → **Console** on `/login` — no CSP violation errors.
2. Sign in with email/password — lands on `/`.
3. Trigger OAuth/magic-link if enabled — `/auth/callback` succeeds.
4. Navigate dashboard and school profile — scripts and styles load.
5. Sign out — `/logout` works.

If CSP blocks assets, adjust `next.config.ts` (do not disable all headers). Roll back per §11.6 if needed.

### 16.3 curl spot-check (optional)

```bash
curl -sI "https://<your-production-domain>/login"
```

Confirm response includes `content-security-policy`, `x-frame-options`, `referrer-policy`, and `strict-transport-security` (on Vercel).

---

## 18. Error monitoring (Sentry) — Task 2.32

Catalyst uses **@sentry/nextjs** for staging and production error reporting. Implementation: `instrumentation.ts`, `sentry.*.config.ts`, `lib/monitoring.ts`, `app/global-error.tsx`.

Monitoring is **disabled** when `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are both unset (safe default for local dev and CI).

### 18.1 Sentry project setup

Create **separate Sentry projects** (recommended) or one project with environment tags:

| Sentry project | Maps to | Environment tag |
| --- | --- | --- |
| `catalyst-crm-staging` | Vercel Preview / staging URL | `staging` (default for `VERCEL_ENV=preview`) |
| `catalyst-crm-production` | Vercel Production | `production` |

**Steps:**

1. Create account/org at [sentry.io](https://sentry.io).
2. **Create project** → platform **Next.js**.
3. Copy the **DSN** from Project Settings → Client Keys.
4. Configure **Data Scrubbing** in Sentry project settings (supplement app-side scrubbing):
   - Enable server-side scrubbing for passwords, cookies, authorization headers.
5. Set alert rules (email/Slack) for new issues in staging first, then production.
6. Restrict project access to Catalyst engineering and ops.

### 18.2 Required Vercel environment variables

**Preview (staging):**

| Variable | Value |
| --- | --- |
| `SENTRY_DSN` | Staging project DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Same staging DSN |
| `SENTRY_ENABLE_TEST_ROUTE` | `true` during initial verification only; remove or set `false` after |

**Production:**

| Variable | Value |
| --- | --- |
| `SENTRY_DSN` | Production project DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Same production DSN |
| `SENTRY_ENABLE_TEST_ROUTE` | **Unset** or `false` (never leave test route enabled in production) |

**Optional (both):** `SENTRY_ENVIRONMENT` to force a tag; `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for source map upload in Vercel builds.

Redeploy after changing any Sentry env var.

### 18.3 No-PII monitoring policy

Catalyst must **not** send PII or CRM-sensitive fields to Sentry.

**Configured in `lib/monitoring.ts`:**

- `sendDefaultPii: false`
- `beforeSend` scrubbing on all events
- `beforeBreadcrumb` scrubbing
- User context limited to **opaque user id** — email and username stripped
- Request `cookies`, `authorization` headers, and `data` (form payloads) removed or redacted
- Sensitive field names redacted: `email`, `password`, `token`, `raw_notes`, `budget`, `budget_owner`, `objections`, `notes`, and similar
- Email addresses and JWT-like strings redacted in messages and exception text

**Operational rules:**

- Do not call `Sentry.setUser({ email })` in application code.
- Do not attach interview notes, budgets, or form bodies to `Sentry.captureException` context.
- Review a sample staging event before enabling production alerts.
- Share this policy with university IT (see `docs/pilot-it-security-packet.md`).

### 18.4 Staging verification

1. Set Preview env vars (§18.2) including `SENTRY_ENABLE_TEST_ROUTE=true`.
2. Deploy to Vercel Preview or staging URL.
3. Trigger test error:

   ```text
   GET https://<staging-url>/api/monitoring-test
   ```

   Expect HTTP 500 and error `"Sentry staging verification test event"`.

4. Open Sentry → Issues — confirm new event within ~1 minute.
5. Verify event **environment** is `staging` (or your `SENTRY_ENVIRONMENT` override).
6. Inspect event JSON — confirm:
   - No cookies or `Authorization` headers
   - No email addresses
   - No `raw_notes`, `budget`, or form field values
7. Set `SENTRY_ENABLE_TEST_ROUTE=false` (or remove) after verification.

**Alternative:** Sentry project **Settings → Client Keys → Verify** button if available for your SDK version.

### 18.5 Production verification

Complete **after** staging verification and production promote (§14).

1. Set Production `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (production project).
2. Confirm `SENTRY_ENABLE_TEST_ROUTE` is **not** enabled on Production.
3. Deploy production.
4. Perform a controlled smoke sign-in — no intentional user-facing errors.
5. Optionally capture a single test exception via Sentry dashboard test tool (not the test route).
6. Confirm production events use environment tag `production`.
7. Confirm alerts route to on-call / engineering channel.

### 18.6 Error monitoring rollback

If Sentry misconfiguration contributes to an incident, see also
`docs/incident-response-runbook.md` §15.

| Step | Action |
| --- | --- |
| 1 | Remove `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` from Vercel Preview and/or Production |
| 2 | Remove `SENTRY_ENABLE_TEST_ROUTE` if set |
| 3 | Redeploy — SDK stays in codebase but `enabled: false` without DSN |
| 4 | Full code rollback (optional) — revert `instrumentation.ts`, `sentry.*.config.ts`, `lib/monitoring.ts`, `withSentryConfig` in `next.config.ts`, and remove `@sentry/nextjs` from `package.json` |

Disabling env vars is sufficient for pilot halt — no database or auth impact.

---

## 19. References

- `README.md` — Deployment section
- `docs/incident-response-runbook.md` — severity, contacts, incident procedures
- `docs/pilot-it-security-packet.md` — MOU notification terms
- `docs/pilot-onboarding-checklist.md` — smoke verification and onboarding
- `docs/auth-hardening.md` — MFA staging rehearsal and auth compromise
- `docs/phase-2-roadmap.md` — Task 2.9, 2.10, 2.32, 2.35, Pilot Launch Gate
- `lib/monitoring.ts` — PII scrubbing and environment tags
- [Vercel environment variables](https://vercel.com/docs/projects/environment-variables)
- [Sentry Next.js SDK](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- `next.config.ts` — security headers and Sentry build wrapper
- [securityheaders.com](https://securityheaders.com) — header scan
