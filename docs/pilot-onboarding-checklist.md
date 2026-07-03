# Catalyst CRM — Pilot Onboarding Checklist

**Task:** Phase 2 Task 2.0  
**Audience:** Catalyst operations, engineering, and partnership leads  
**Purpose:** Repeatable steps to onboard one pilot university organization  
**Related:** `docs/pilot-it-security-packet.md` (share with university IT/legal)

---

## Before you start

Confirm Phase 1 security work is applied and migrations are run on the target Supabase project. See [Migration apply order](#migration-apply-order) below.

| Item | Owner | Done |
| --- | --- | --- |
| Pilot MOU or LOI signed (business) | Partnerships | [ ] |
| IT/security packet shared with university reviewer | Partnerships | [ ] |
| Staging environment available (Task 2.9+) or local rehearsal complete | Engineering | [ ] |
| Production environment available (Task 2.10+) for go-live | Engineering | [ ] |
| Named Catalyst admin for membership provisioning | Operations | [ ] |

---

## Role matrix

Assign roles in `organization_members` for the pilot organization's `organization_id`.

| Role | Typical user | Can view org data | Can create/edit CRM | Can delete | Restricted fields in UI |
| --- | --- | --- | --- | --- | --- |
| `read_only` | University observer, executive, advisor | Yes (own org) | No | No | Redacted (raw notes, budget, budget owner, objections, follow-up notes) |
| `sales` | Catalyst partnerships staff | Yes (own org) | Yes | No | Full |
| `admin` | Catalyst org administrator | Yes (own org) | Yes | Yes | Full |
| `super_admin` | Catalyst platform operator (limit assignments) | All orgs | All orgs | All orgs | Full |

**Pilot recommendation:**

- Catalyst staff: `sales` or `admin`  
- University observers: `read_only` only  
- Avoid `super_admin` for university-affiliated accounts  

---

## Environment checklist

### Supabase (database + auth)

| Step | Action | Done |
| --- | --- | --- |
| 1 | Create or select Supabase project (staging vs production) | [ ] |
| 2 | Apply all migrations in [order](#migration-apply-order) | [ ] |
| 3 | Confirm RLS enabled on CRM tables | [ ] |
| 4 | Create `organizations` row for pilot (note `id`) | [ ] |
| 5 | Create Supabase Auth users for each pilot participant | [ ] |
| 6 | Insert `organization_members` rows linking `user_id` + `organization_id` + `role` | [ ] |
| 7 | Backfill or create pilot `schools` with correct `organization_id` | [ ] |
| 8 | Verify no `SUPABASE_SERVICE_ROLE_KEY` in app environment (anon + session only) | [ ] |

### Vercel (application hosting)

| Step | Action | Done |
| --- | --- | --- |
| 1 | Connect repository to Vercel project | [ ] |
| 2 | Set `NEXT_PUBLIC_SUPABASE_URL` for target Supabase project | [ ] |
| 3 | Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` for target Supabase project | [ ] |
| 4 | Do **not** set `SUPABASE_SERVICE_ROLE_KEY` for user-facing deployments | [ ] |
| 5 | Configure custom domain and HTTPS (production) | [ ] |
| 6 | Deploy and confirm `/login` loads | [ ] |
| 7 | Confirm unauthenticated `/` redirects to `/login` | [ ] |

### Supabase Auth redirect URLs

Configure under **Authentication → URL Configuration** in the Supabase dashboard.

| Environment | Site URL | Redirect URLs (add all that apply) |
| --- | --- | --- |
| Local dev | `http://localhost:3000` | `http://localhost:3000/auth/callback` |
| Staging | `https://<staging-domain>` | `https://<staging-domain>/auth/callback` |
| Production | `https://<production-domain>` | `https://<production-domain>/auth/callback` |

| Step | Action | Done |
| --- | --- | --- |
| 1 | Set **Site URL** to deployment origin | [ ] |
| 2 | Add `/auth/callback` for each deployment origin | [ ] |
| 3 | Test sign-in → redirect to dashboard | [ ] |
| 4 | Test sign-out → session cleared | [ ] |

---

## Pilot onboarding steps

### Phase A — Legal and IT (week 0)

1. Send `docs/pilot-it-security-packet.md` to university IT and legal contacts.  
2. Attach **MOU Technical Appendix** (Section 8 of security packet) to pilot agreement.  
3. Confirm pilot scope: institutional partnership data only; **no student PII/FERPA records**.  
4. Record approval date and named university contacts.

### Phase B — Technical setup (week 1)

1. Complete [Environment checklist](#environment-checklist) for staging.  
2. Run [smoke verification](#smoke-verification) on staging.  
3. Complete environment checklist for production (when ready for go-live).  
4. Document deployment URLs in pilot record:

   | Field | Value |
   | --- | --- |
   | Staging URL | `https://________________` |
   | Production URL | `https://________________` |
   | Supabase project ref | `________________` |
   | Organization ID | `________________` |

### Phase C — User provisioning

For each user:

1. Create user in **Supabase → Authentication → Users** (email/password).  
2. Send credentials through your approved secure channel (not email plaintext if policy forbids).  
3. Insert membership (example SQL — replace UUIDs):

```sql
INSERT INTO organization_members (organization_id, user_id, role)
VALUES (
  '<pilot-organization-id>',
  '<supabase-auth-user-id>',
  'read_only'  -- or sales, admin
);
```

4. User signs in at `https://<deployment>/login`.  
5. Confirm correct role behavior (see [Acceptance checks](#acceptance-checks)).

### Phase D — Data seeding

1. Create or import pilot schools tied to `organization_id`.  
2. Add contacts, sample outreach, or interviews as needed for rehearsal.  
3. Confirm university `read_only` user sees redacted restricted fields on school profiles.  
4. Confirm Catalyst `sales` user can submit discovery interview (if in scope).

### Phase E — Go-live

1. Leadership sign-off on smoke + acceptance checks.  
2. Notify pilot users with login URL and support contacts.  
3. Schedule week-1 check-in for access issues and data questions.  
4. Log pilot start date.

---

## Migration apply order

Apply in timestamp order on the target Supabase project:

1. `20260702200600_initial_crm_schema.sql`  
2. `20260702210800_add_discovery_interview_fields.sql`  
3. `20260702212500_add_ai_summary_interview_fields.sql`  
4. `20260702221300_add_university_research_profile_fields.sql`  
5. `20260703142600_add_organizations_and_roles.sql`  
6. `20260703143300_add_crm_ownership_fields.sql`  
7. `20260703144000_replace_broad_rls_policies.sql`  
8. `20260703152200_add_rate_limit_events.sql`  
9. `20260703152700_add_audit_events.sql`  

---

## Smoke verification

Run on staging before production go-live.

| # | Test | Expected | Pass |
| --- | --- | --- | --- |
| 1 | Visit `/` logged out | Redirect to `/login` | [ ] |
| 2 | Sign in as Catalyst `sales` | Dashboard loads | [ ] |
| 3 | Open school profile | Data visible for own org | [ ] |
| 4 | Sign in as university `read_only` | Dashboard loads; no edit actions | [ ] |
| 5 | `read_only` school profile | Restricted fields show "Restricted" | [ ] |
| 6 | `read_only` submit interview | Denied | [ ] |
| 7 | `sales` submit interview in own org | Allowed | [ ] |
| 8 | Sign out | Session cleared | [ ] |

---

## Acceptance checks (pilot launch gate)

Minimum criteria before first real university user accesses production:

- [ ] Authentication required for `/` and `/schools/*`  
- [ ] Users isolated to their `organization_id`  
- [ ] `read_only` cannot mutate data  
- [ ] Restricted fields redacted for `read_only` in application  
- [ ] Privacy copy visible on discovery, research, and outreach forms  
- [ ] Pilot IT/security packet acknowledged by university  
- [ ] Incident contacts documented (see security packet Section 7)  

---

## Dry-run procedure

Use this to rehearse onboarding **without a live university** (internal dry-run).

1. **Pick a fictional pilot** — e.g. "Example University Pilot Org."  
2. **Create a staging Supabase project** (or use dev project).  
3. **Apply migrations** in order; create one `organizations` row.  
4. **Create three test users:** `sales`, `read_only`, and `admin` (Catalyst staff only).  
5. **Insert `organization_members`** rows for each user.  
6. **Seed one school** with interview data including budget and raw notes.  
7. **Deploy to Vercel preview** or staging with env vars set.  
8. **Walk through smoke verification** table above.  
9. **Role-play university IT review** — use `docs/pilot-it-security-packet.md` and confirm every question has an answer.  
10. **Walk through MOU appendix** — confirm language matches actual product behavior.  
11. **Record gaps** — note any checklist step that failed or was unclear.  
12. **Leadership sign-off** — partnerships + engineering confirm ready for real pilot.

Estimated dry-run time: **2–4 hours** (first time); **30–60 minutes** once rehearsed.

---

## Post-onboarding

| When | Action |
| --- | --- |
| Week 1 | Check login issues, role mistakes, data questions |
| Week 2 | Confirm users follow FERPA/PII guidance in practice |
| Monthly | Review `audit_events` for sensitive actions |
| Offboarding | Remove `organization_members` row; disable Auth user |

---

## References

- `docs/pilot-it-security-packet.md`  
- `docs/executive-reports/phase-1-executive-summary.md`  
- `docs/phase-2-roadmap.md` (Task 2.0)  
- `docs/supabase-rls-audit.md`  
- `README.md` (Privacy and data handling)

---

*Update this checklist when Phase 2 PLT tasks (2.6 admin UI, 2.9 staging, etc.) ship — replace manual SQL steps with in-app flows where applicable.*
