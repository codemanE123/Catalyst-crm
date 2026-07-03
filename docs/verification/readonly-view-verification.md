# Read-only view verification (Phase 2 Task 2.1D)

**Task:** Phase 2 Task 2.1D  
**Scope:** Manual verification procedures for database read-only views and school profile routing  
**Prerequisites:** Migration `20260703160000_add_readonly_safe_views.sql` applied; Task 2.1B app routing deployed  
**Related docs:** `docs/supabase-rls-audit.md`, `docs/pilot-onboarding-checklist.md`, `docs/pilot-it-security-packet.md`

---

## Overview

Phase 2 Task 2.1 enforces column privacy for `read_only` users through:

1. **Primary:** Postgres views `interviews_readonly` and `follow_ups_readonly` (restricted columns omitted).
2. **Backup:** Application-layer redaction in `getSchoolProfileData()` (Phase 1 Task 13).

This document is the manual test plan to confirm both layers behave as designed.

---

## Test fixtures (set up once)

### Required users

Create four Supabase Auth users and `organization_members` rows. Replace UUIDs with your project values.

| Test user | Role | Organization | Purpose |
| --- | --- | --- | --- |
| `readonly@test.local` | `read_only` | Pilot org A | University observer |
| `sales@test.local` | `sales` | Pilot org A | Catalyst contributor |
| `admin@test.local` | `admin` | Pilot org A | Org administrator |
| `super@test.local` | `super_admin` | Any org (or separate platform org) | Cross-org operator |

Example membership insert:

```sql
INSERT INTO organization_members (organization_id, user_id, role)
VALUES ('<pilot-org-a-id>', '<auth-user-id>', 'read_only');
```

### Required seed data (org A)

Seed one school in pilot org A with interview and follow-up rows that include **non-empty restricted values** so verification can distinguish omission from empty data.

```sql
-- Replace <school-id> and <org-a-id> with real UUIDs.
-- Run as service role / SQL editor (bypasses RLS for setup only).

INSERT INTO interviews (
  school_id,
  organization_id,
  interviewer,
  interview_date,
  sentiment,
  notes,
  raw_notes,
  pain_points,
  budget,
  budget_owner,
  objections,
  pilot_interest
) VALUES (
  '<school-id>',
  '<org-a-id>',
  'Verification Interviewer',
  CURRENT_DATE,
  'Positive',
  'Public summary notes for verification',
  'SECRET_RAW_NOTES_DO_NOT_EXPOSE',
  'Scheduling friction',
  'SECRET_BUDGET_50000',
  'SECRET_BUDGET_OWNER_CFO',
  'SECRET_OBJECTIONS_PRICE',
  'High'
);

INSERT INTO follow_ups (
  school_id,
  organization_id,
  title,
  due_date,
  status,
  owner,
  notes
) VALUES (
  '<school-id>',
  '<org-a-id>',
  'Verification follow-up',
  CURRENT_DATE + 7,
  'Open',
  'Sales rep',
  'SECRET_FOLLOWUP_NOTES_DO_NOT_EXPOSE'
);
```

Record the school UUID as `<school-id>` for browser tests (`/schools/<school-id>`).

### Optional isolation fixture (org B)

For `super_admin` cross-org checks, keep a second organization with a school the `read_only` user must **not** access unless they are `super_admin`.

---

## 1. Manual test plan by role

Run after fixtures are seeded and the app is running against the same Supabase project (local `http://localhost:3000` or staging).

### 1.1 `read_only` (pilot org A)

| Step | Action | Pass criteria |
| --- | --- | --- |
| R1 | Sign in as `readonly@test.local` | Dashboard loads; redirected from `/login` when already signed in |
| R2 | Open `/schools/<school-id>` | School profile loads for org A school |
| R3 | Observe amber role banner | Banner: "Some sensitive fields are hidden for your role…" |
| R4 | Interview summaries section | Summary `notes`, `pain_points`, `buyer`, `pilot_interest` show real seeded text |
| R5 | Restricted interview fields | `Raw notes`, `Budget`, `Budget owner`, `Objections` are **not** shown with secret seed values; labels may be absent (view omitted columns) or show `Restricted` (backup redaction) |
| R6 | Next follow-up panel | Title and due date visible; follow-up `notes` do **not** show `SECRET_FOLLOWUP_NOTES_DO_NOT_EXPOSE` |
| R7 | Dashboard `/` | Discovery interview form submit **denied** (role guard / server action) |
| R8 | DevTools → Network (optional) | School profile server response does not contain secret strings or restricted column keys with values |

### 1.2 `sales` (pilot org A)

| Step | Action | Pass criteria |
| --- | --- | --- |
| S1 | Sign in as `sales@test.local` | Dashboard loads |
| S2 | Open `/schools/<school-id>` | Full profile loads |
| S3 | Amber role banner | **Not** displayed |
| S4 | Interview summaries | `Raw notes`, `Budget`, `Budget owner`, `Objections` show seeded secret values |
| S5 | Next follow-up | Follow-up `notes` show `SECRET_FOLLOWUP_NOTES_DO_NOT_EXPOSE` |
| S6 | Dashboard `/` | Discovery interview submit **allowed** for org A school (if form in scope) |

### 1.3 `admin` (pilot org A)

| Step | Action | Pass criteria |
| --- | --- | --- |
| A1 | Sign in as `admin@test.local` | Dashboard loads |
| A2 | Open `/schools/<school-id>` | Same full-field visibility as `sales` (S3–S5) |
| A3 | Delete capability | RLS allows delete within org (exercise only if delete UI/server action exists in deployment) |

`admin` and `sales` share the same read path: base tables `interviews` and `follow_ups`, no app redaction.

### 1.4 `super_admin` (platform operator)

| Step | Action | Pass criteria |
| --- | --- | --- |
| X1 | Sign in as `super@test.local` | Dashboard loads |
| X2 | Open `/schools/<school-id>` for org A | Full restricted fields visible (same as `sales`) |
| X3 | Cross-org (if org B school exists) | Can open org B school profile without org membership row for that org |
| X4 | Amber role banner | **Not** displayed |

`super_admin` skips redaction and uses base tables even when not a member of the school's organization.

---

## 2. SQL: verify `interviews_readonly` column set

Run in **Supabase SQL Editor** (postgres role). These checks prove the view definition omits restricted columns at the schema level.

### 2.1 List view columns

```sql
SELECT column_name, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'interviews_readonly'
ORDER BY ordinal_position;
```

**Expected:** Columns include `id`, `school_id`, `notes`, `pain_points`, `buyer`, `pilot_interest`, etc.  
**Expected absent:** `raw_notes`, `budget`, `budget_owner`, `objections`.

### 2.2 Confirm restricted columns exist on base table (control)

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'interviews'
  AND column_name IN ('raw_notes', 'budget', 'budget_owner', 'objections')
ORDER BY column_name;
```

**Expected:** All four rows returned (base table still has the columns).

### 2.3 Negative SELECT (must fail)

```sql
SELECT raw_notes
FROM public.interviews_readonly
LIMIT 1;
```

**Expected:** Error — `column "raw_notes" does not exist` (or equivalent).

Repeat for `budget`, `budget_owner`, and `objections` — each must fail.

### 2.4 Compare base vs view column diff

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'interviews'
  AND column_name NOT IN (
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interviews_readonly'
  )
ORDER BY column_name;
```

**Expected:** Exactly `budget`, `budget_owner`, `objections`, `raw_notes` (and no other unexpected gaps).

### 2.5 Data projection (service-role / setup context)

After seed data from [Test fixtures](#test-fixtures-set-up-once):

```sql
SELECT id, notes, pain_points, buyer, pilot_interest
FROM public.interviews_readonly
WHERE school_id = '<school-id>'
LIMIT 5;
```

**Expected:** Rows return with public summary fields populated.

```sql
-- Must fail — do not run expecting rows:
SELECT raw_notes, budget, budget_owner, objections
FROM public.interviews_readonly
WHERE school_id = '<school-id>';
```

**Expected:** SQL error (columns do not exist on the view).

### 2.6 View metadata

```sql
SELECT obj_description("public"."interviews_readonly"::regclass, 'pg_class');
```

**Expected:** Comment mentions omission of `raw_notes`, `budget`, `budget_owner`, `objections`.

```sql
SELECT reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'interviews_readonly';
```

**Expected:** Includes `security_invoker=true`.

---

## 3. SQL: verify `follow_ups_readonly` column set

### 3.1 List view columns

```sql
SELECT column_name, ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'follow_ups_readonly'
ORDER BY ordinal_position;
```

**Expected:** Columns include `id`, `school_id`, `title`, `due_date`, `status`, `owner`, etc.  
**Expected absent:** `notes`.

### 3.2 Confirm `notes` on base table (control)

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'follow_ups'
  AND column_name = 'notes';
```

**Expected:** One row returned.

### 3.3 Negative SELECT (must fail)

```sql
SELECT notes
FROM public.follow_ups_readonly
LIMIT 1;
```

**Expected:** Error — `column "notes" does not exist`.

### 3.4 Compare base vs view column diff

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'follow_ups'
  AND column_name NOT IN (
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'follow_ups_readonly'
  )
ORDER BY column_name;
```

**Expected:** Only `notes` differs.

### 3.5 Data projection

```sql
SELECT id, title, due_date, status, owner
FROM public.follow_ups_readonly
WHERE school_id = '<school-id>'
  AND status <> 'Done'
ORDER BY due_date;
```

**Expected:** Seeded follow-up row visible without `notes` column.

---

## 4. Browser test steps: `/schools/[id]`

Use the seeded `<school-id>` from [Test fixtures](#test-fixtures-set-up-once).

### 4.1 Common navigation

1. Ensure the dev or staging server is running and pointed at the Supabase project with migration `20260703160000` applied.
2. Sign out any existing session.
3. Sign in with the role under test.
4. From the dashboard school list, click the seeded school **or** navigate directly to `/schools/<school-id>`.
5. Wait for the full page render (header shows school name; "Interview summaries" section visible if interviews exist).

### 4.2 `read_only` browser checklist

1. Confirm **Data source** badge shows `Supabase` (not `Sample`) when using live DB fixtures.
2. Confirm amber banner under summary cards.
3. Scroll to **Interview summaries → Discovery notes**.
4. Verify interview summary paragraph contains `Public summary notes for verification`.
5. Verify **no** visible field displays:
   - `SECRET_RAW_NOTES_DO_NOT_EXPOSE`
   - `SECRET_BUDGET_50000`
   - `SECRET_BUDGET_OWNER_CFO`
   - `SECRET_OBJECTIONS_PRICE`
6. Scroll to **Status** / next follow-up panel (right column).
7. Verify follow-up title `Verification follow-up` is visible.
8. Verify `SECRET_FOLLOWUP_NOTES_DO_NOT_EXPOSE` is **not** visible.
9. (Optional) Open DevTools → Network → reload page → inspect the document/RSC payload for the secret strings above. **Expected:** Not present.

### 4.3 `sales` / `admin` browser checklist

1. Sign in; open `/schools/<school-id>`.
2. Confirm **no** amber restricted-fields banner.
3. Under each interview card, confirm **Raw notes**, **Budget**, **Budget owner**, and **Objections** display the `SECRET_*` seed values.
4. Confirm next follow-up notes display `SECRET_FOLLOWUP_NOTES_DO_NOT_EXPOSE`.

### 4.4 `super_admin` browser checklist

1. Repeat [4.3](#43-sales--admin-browser-checklist) on org A school.
2. If org B fixture exists, open org B school profile without adding `super_admin` user to org B membership (cross-org read). **Expected:** Profile loads with full fields.

---

## 5. Expected results (summary matrix)

| Check | `read_only` | `sales` | `admin` | `super_admin` |
| --- | --- | --- | --- | --- |
| RLS: SELECT own org | Yes | Yes | Yes | Yes (all orgs) |
| RLS: INSERT/UPDATE/DELETE | No | Yes (no delete) | Yes | Yes |
| App data source for profile | `interviews_readonly`, `follow_ups_readonly` | `interviews`, `follow_ups` | Base tables | Base tables |
| `raw_notes` / `budget` / `budget_owner` / `objections` in UI | Hidden or `Restricted` | Full seed values | Full seed values | Full seed values |
| Follow-up `notes` in UI | Omitted / generic text | Full seed value | Full seed value | Full seed value |
| Amber restricted banner | Shown | Hidden | Hidden | Hidden |
| SQL: restricted columns on views | Do not exist | N/A (uses base table) | N/A | N/A |
| Interview submit on `/` | Denied | Allowed | Allowed | Allowed |

---

## 6. Known limitations

1. **Profile path only.** View routing is implemented in `getSchoolProfileData()` (`lib/supabase.ts`). New features that query `interviews` or `follow_ups` directly must also use the read-only views or equivalent controls.

2. **RLS still allows base-table SELECT for `read_only`.** Organization RLS grants `read_only` users `SELECT` on the full `interviews` and `follow_ups` tables. A user with the anon/authenticated key could bypass the UI and request restricted columns from base tables via PostgREST. Task 2.1 closes the **supported application path**; column blocking for ad-hoc API access would require additional policies or revoked grants (future hardening).

3. **Sample / offline mode.** When Supabase is unavailable, the app serves sample data and applies app-layer redaction only; views are not used.

4. **No column restrictions on other tables.** `schools.notes`, `contacts.notes`, and `outreach` content are visible to all org readers including `read_only`.

5. **Hidden vs `Restricted` display.** When views omit columns, restricted interview fields may **not render at all** (`DiscoveryDetail` hides null values). Backup redaction shows the literal placeholder `Restricted` only if a restricted value reaches the app layer.

6. **SQL Editor runs as elevated role.** Schema checks in Sections 2–3 use postgres/service context. Role-based RLS behavior must be validated through the app or authenticated Supabase clients, not SQL Editor alone.

7. **No automated CI coverage in 2.1D.** This document is manual. Automated RLS matrix tests are planned in Phase 2 Task 2.3 (Scale Track).

---

## 7. Rollback notes

If read-only views cause a regression, roll back in this order:

### 7.1 Application routing (Task 2.1B)

Revert `lib/supabase.ts` changes that:

- Call `shouldUseReadonlyProfileSources()`
- Query `interviews_readonly` / `follow_ups_readonly`
- Use `INTERVIEW_SELECT_READONLY` / `FOLLOW_UP_SELECT_READONLY`

After revert, all roles load base tables again; **Phase 1 app-layer redaction remains** for `read_only` users.

### 7.2 Database views (Task 2.1A)

Apply a reverse migration or run manually:

```sql
REVOKE SELECT ON public.interviews_readonly FROM authenticated;
REVOKE SELECT ON public.follow_ups_readonly FROM authenticated;

DROP VIEW IF EXISTS public.follow_ups_readonly;
DROP VIEW IF EXISTS public.interviews_readonly;
```

Or revert git commit containing `supabase/migrations/20260703160000_add_readonly_safe_views.sql` and reset the migration history on the target database per your deployment process.

### 7.3 Post-rollback verification

1. `read_only` user opens `/schools/<school-id>` — restricted fields show as `Restricted` (app redaction only).
2. `sales` user still sees full fields.
3. `npm run lint` and `npm run build` pass after app revert.

### 7.4 Documentation

Update `docs/supabase-rls-audit.md` and `docs/pilot-it-security-packet.md` to reflect rollback if views are removed in a deployed environment.

---

## Sign-off

| Role | Tester | Date | Result |
| --- | --- | --- | --- |
| Engineering | | | [ ] Pass [ ] Fail |
| Security / IT reviewer | | | [ ] Pass [ ] Fail |

**Failure escalation:** Log defects in the project issue tracker; reference Phase 2 Task 2.1A (schema) vs 2.1B (routing) to isolate root cause.

---

## References

- Migration: `supabase/migrations/20260703160000_add_readonly_safe_views.sql`
- App routing: `lib/supabase.ts` → `getSchoolProfileData()`, `shouldUseReadonlyProfileSources()`
- Redaction backup: `lib/supabase.ts` → `applyRedactionForCurrentUser()`; `lib/authz.ts` → `shouldRedactRestrictedFields()`
- UI: `app/schools/[id]/page.tsx`
- RLS audit: `docs/supabase-rls-audit.md` (Phase 2 Task 2.1)
