# Authentication Hardening — MFA and Session Hygiene

**Version:** 1.0 (Phase 2 Task 2.5)  
**Audience:** Catalyst operators, university IT reviewers, and pilot administrators  
**Companion documents:** `docs/pilot-it-security-packet.md`, `docs/pilot-onboarding-checklist.md`

---

## 1. Purpose

Catalyst CRM uses Supabase Auth with cookie-bound server sessions (`@supabase/ssr`).
This guide documents **recommended** multi-factor authentication (MFA) enrollment and
session hygiene for privileged accounts.

**Important:** Catalyst does **not** enforce MFA in application code during the pilot.
MFA is enabled per user in Supabase Auth. Enrollment is **recommended** for `admin`,
`sales`, and `super_admin` accounts; it remains **optional** for `read_only` users unless
your institution requires it.

No breaking auth changes are introduced by this documentation task.

---

## 2. Who should enroll in MFA

| Role | MFA recommendation | Rationale |
| --- | --- | --- |
| `super_admin` | **Required** (operational policy) | Cross-organization access; highest blast radius |
| `admin` | **Strongly recommended** | Can read, write, and delete within the organization |
| `sales` | **Strongly recommended** | Can read and write CRM data including restricted interview fields |
| `read_only` | Optional | Read-only access via safe views; lower write risk |

University IT may require MFA for all institutional accounts regardless of Catalyst role.
Follow institutional policy when it is stricter than this table.

---

## 3. Enable MFA in Supabase (project settings)

Perform these steps once per Supabase project (staging, then production).

### 3.1 Confirm Auth is configured

1. Open the [Supabase Dashboard](https://supabase.com/dashboard) for the target project.
2. Go to **Authentication** → **Providers**.
3. Ensure **Email** is enabled (password sign-in used by `/login`).
4. Go to **Authentication** → **URL Configuration**.
5. Set **Site URL** to the deployment origin (e.g. `https://staging.crm.example.com`).
6. Add **Redirect URLs**:
   - `https://<deployment-origin>/auth/callback`
   - `http://localhost:3000/auth/callback` (local development only)

### 3.2 Enable TOTP (authenticator app) MFA

1. Go to **Authentication** → **Multi-Factor Authentication** (or **Auth** → **MFA**).
2. Enable **TOTP** (Time-based One-Time Password) — authenticator apps such as Google
   Authenticator, Microsoft Authenticator, or 1Password.
3. Save changes.

Supabase Auth handles MFA challenge during sign-in. Catalyst CRM does not implement a
custom MFA UI; users enroll and verify through Supabase Auth flows after password login.

### 3.3 Optional dashboard policies (pilot)

These are **Supabase project settings**, not Catalyst code changes:

| Setting | Pilot recommendation | Notes |
| --- | --- | --- |
| TOTP MFA | Enabled | Required for enrollment to work |
| MFA enforcement (require AAL2) | **Off** for pilot unless IT mandates | Turning on global enforcement blocks users who have not enrolled |
| Session / JWT expiry | See §4 | Adjust in Auth settings if your project exposes JWT lifetime controls |

Document the chosen settings in your pilot agreement or internal runbook.

---

## 4. Session timeout and session hygiene

### 4.1 How Catalyst sessions work

| Item | Behavior |
| --- | --- |
| Session storage | HTTP-only cookies via `@supabase/ssr` |
| Validation | Middleware calls `supabase.auth.getUser()` on protected routes |
| Protected routes | `/`, `/schools/*`, `/settings/*` (settings require `admin` or `super_admin`) |
| Sign out | `/logout` clears the session |
| Refresh | Middleware refreshes tokens when cookies are near expiry (standard Supabase SSR pattern) |

### 4.2 Recommended session practices

| Practice | Recommendation |
| --- | --- |
| **Idle timeout (organizational)** | Require users to sign out or lock workstations after **15–30 minutes** of inactivity during pilot operations |
| **Maximum session lifetime** | Align Supabase JWT/session expiry with institutional policy; **8 hours** is a common default for business apps if no stricter IT standard exists |
| **Shared computers** | Never stay signed in on shared lab or kiosk machines; always use `/logout` |
| **Password hygiene** | Unique passwords per user; institutional SSO/password policy applies where configured |
| **Credential storage** | Do not share admin passwords; use separate accounts per person in `organization_members` |
| **Super admin use** | Minimize `super_admin` accounts; prefer per-organization `admin` for university staff |

Catalyst does **not** implement a custom idle-timeout modal in v1. Enforce idle timeout
through institutional device policy, browser session discipline, and Supabase Auth session
settings where available.

### 4.3 Sign-out procedure

Users should sign out via the application logout route or by clearing the session:

1. Navigate to `/logout`, or use any in-app sign-out control that links to `/logout`.
2. Confirm redirect to `/login`.
3. On shared devices, close the browser tab after logout.

### 4.4 Lost device or suspected compromise

1. An organization `admin` or Catalyst operator disables or resets the user in
   **Supabase Dashboard** → **Authentication** → **Users**.
2. Revoke active sessions for that user in the Supabase dashboard if the option is
   available for your project plan.
3. User resets password and re-enrolls MFA on a trusted device.
4. Record the incident per institutional policy; audit events in Catalyst cover some
   mutations but are not a full SIEM.

---

## 5. Per-user MFA enrollment (admin and sales)

Enrollment is performed **by each user** after they can sign in with email and password.

### 5.1 Prerequisites

- User exists in **Authentication** → **Users**.
- User has an `organization_members` row with role `admin`, `sales`, or `super_admin`.
- TOTP MFA is enabled in the Supabase project (§3.2).
- User has an authenticator app installed on a phone or hardware token.

### 5.2 Enrollment steps (user)

Exact menu labels may vary slightly by Supabase dashboard version. If your project exposes
MFA enrollment only via API, use the Supabase account/security flow linked from your
deployment's login experience or the dashboard user detail page.

1. Sign in to Catalyst at `/login` with email and password.
2. Open the Supabase account security flow for your project (from the Auth user menu or
   dashboard-invited enrollment link, depending on setup).
3. Choose **Add authenticator app** / **Enroll TOTP**.
4. Scan the QR code with the authenticator app.
5. Enter the 6-digit verification code to confirm enrollment.
6. Store backup/recovery codes if Supabase presents them; keep offline in a secure location.

### 5.3 After enrollment

1. Sign out (`/logout`).
2. Sign in again at `/login`.
3. Enter email and password.
4. When prompted, enter the TOTP code from the authenticator app.
5. Confirm access to `/` (dashboard) and, for admins, `/settings/members` if applicable.

### 5.4 Removing or replacing MFA

- User replaces a lost phone: remove the old TOTP factor in Supabase (dashboard admin or
  self-service, per project configuration), then re-enroll.
- Admin-assisted reset: **Authentication** → **Users** → select user → manage MFA factors.

---

## 6. Staging MFA rehearsal (required before production)

Complete this checklist on the **staging** Supabase project and staging deployment URL
before enabling production pilot access for university staff.

### 6.1 Operator setup

- [ ] Staging Supabase project has Email provider enabled and redirect URLs for staging origin.
- [ ] TOTP MFA enabled under Authentication → MFA.
- [ ] At least one test user with role `admin` and one with role `sales` in `organization_members`.
- [ ] Staging deployment uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  for the staging project (no sample-data fallback).

### 6.2 Rehearsal script

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Sign in as staging `admin` without MFA | Password login succeeds |
| 2 | Enroll TOTP per §5.2 | Factor shows as enrolled in Supabase user detail |
| 3 | Sign out and sign in again | Password + TOTP challenge succeeds |
| 4 | Open `/` and `/schools/<id>` | Data loads for user's organization |
| 5 | Open `/settings/members` as `admin` | Settings page loads |
| 6 | Sign in as staging `sales`, enroll MFA, repeat sign-in | MFA challenge succeeds; CRM write paths work |
| 7 | Sign in as `read_only` (no MFA) | Login still works (MFA not forced by app) |
| 8 | Sign out on shared-browser simulation | `/logout` returns to `/login`; protected routes redirect |

### 6.3 Record results

Document in your internal pilot log:

- Date and operator name
- Staging project ref and deployment URL
- Users tested and roles
- Pass/fail per rehearsal step
- Any IT-specific MFA policy decisions (e.g. future enforcement date)

### 6.4 Production cutover

Repeat §3 and §6 on the **production** Supabase project before inviting university users.
Do not copy staging Auth users to production; create fresh users and memberships per
`docs/pilot-onboarding-checklist.md`.

---

## 7. What Catalyst does not do (pilot scope)

To avoid breaking auth during the pilot:

| Item | Pilot behavior |
| --- | --- |
| In-app MFA enrollment UI | Not implemented — Supabase Auth handles enrollment |
| Forced MFA in middleware or server actions | **Not implemented** |
| Custom session idle timer in the app | **Not implemented** |
| IP allowlisting | Optional future hardening; not in v1 |

Future phases may add enforcement (e.g. require AAL2 for `/settings/*`) only with explicit
product and IT approval.

---

## 8. References

- `docs/pilot-it-security-packet.md` — §3 Authentication summary
- `docs/security-reports/phase-1-risk-register.md` — R-006 (MFA and session controls)
- [Supabase Auth MFA documentation](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase SSR session guide](https://supabase.com/docs/guides/auth/server-side/nextjs)

---

## 9. Rollback

This task is documentation-only. Rollback by reverting `docs/auth-hardening.md` and
related README/packet cross-links. No database migrations or application auth logic changes
are required to roll back.
