# Deployment Runbook — Staging and Preview Environments

**Version:** 1.0 (Phase 2 Task 2.9)  
**Audience:** Catalyst engineering and operations  
**Companion documents:** `docs/pilot-onboarding-checklist.md`, `docs/auth-hardening.md`, `docs/pilot-it-security-packet.md`

**Scope:** This runbook covers **staging** and **Vercel preview** deployments. Production promote procedure and security headers are documented in Phase 2 Task 2.10 (extends this file).

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

### 6.4 Future variables (not required for Task 2.9)

Documented for later tasks — do not add until those tasks ship:

| Variable | Task | Purpose |
| --- | --- | --- |
| Sentry DSN (or equivalent) | 2.32 | Error monitoring |
| Custom domain secrets | 2.10 | Production TLS |

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

### 11.1 Disable preview deployments

If preview deploys cause noise or misconfiguration:

1. Vercel → **Settings → Git** → disable **Preview Deployments**, or
2. Disconnect Git integration temporarily.

No production impact if production uses a separate env scope.

### 11.2 Revert a bad application deploy

1. Vercel → **Deployments** → select last known good deployment → **Promote to Production** (or redeploy for staging).
2. Or revert the git commit on `main` and push — Vercel rebuilds automatically.

Application rollback does **not** roll back database migrations.

### 11.3 Bad migration on staging

1. Do **not** deploy app code that depends on a failed migration.
2. Fix forward with a new migration or manual SQL on staging only.
3. Re-run smoke verification before promoting fixes toward production.

### 11.4 Wrong Supabase env vars

1. Update Vercel Preview variables to correct staging URL and anon key.
2. **Redeploy** (env changes require a new deployment to take effect).
3. Re-run [§10](#10-verify-staging-uses-the-correct-supabase-project).

### 11.5 Doc-only rollback (Task 2.9)

Revert `docs/deployment-runbook.md` and README links. No runtime change.

---

## 12. CI and deployment automation

**Current state (Task 2.9):** GitHub Actions runs `lint`, `test`, and `build` only. Deployment is handled by **Vercel Git integration** (preview on PR, branch deploys on push).

**Not implemented in Task 2.9:**

- Automatic production deployment from GitHub Actions
- Custom deploy workflow that bypasses Vercel

See comments in `.github/workflows/ci.yml` for future optional workflows (E2E against staging in Task 2.29, monitoring in Task 2.32).

---

## 13. Related tasks

| Task | Adds to this runbook |
| --- | --- |
| 2.10 | Production promote, security headers (HSTS, CSP), production env checklist |
| 2.29 | Playwright E2E smoke against staging URL |
| 2.32 | Error monitoring DSN and staging alert verification |
| 2.35 | Incident response runbook |

---

## 14. References

- `README.md` — Deployment section
- `docs/pilot-onboarding-checklist.md` — smoke verification and onboarding
- `docs/auth-hardening.md` — MFA staging rehearsal
- `docs/phase-2-roadmap.md` — Task 2.9, 2.10, Pilot Launch Gate
- [Vercel environment variables](https://vercel.com/docs/projects/environment-variables)
- [Supabase migration guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
