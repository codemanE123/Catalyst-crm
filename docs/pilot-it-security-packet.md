# Catalyst CRM — Pilot IT & Security Packet

**Version:** 1.1 (Phase 2 Task 2.1C)  
**Audience:** University IT, information security, legal, and data governance reviewers  
**Product:** Catalyst CRM — school partnership pipeline tool  
**Status:** Controlled pilot — not general-purpose student information system  

**Companion document:** `docs/pilot-onboarding-checklist.md`

---

## 1. Executive summary

Catalyst CRM helps partnership teams track target schools, contacts, outreach, discovery interviews, and pipeline status. The application requires login, scopes data by organization, and applies role-based access controls.

**This product is designed for institutional partnership and sales discovery workflows. It is not a student information system (SIS) and must not be used to store student PII or FERPA-protected education records.**

Phase 1 security controls are in place: authentication, organization-scoped authorization, input validation, SSRF protections on research fetches, rate limiting, audit logging, and field redaction for read-only users. Phase 2 Task 2.1 adds database-enforced read-only views so restricted columns are omitted before data reaches the application; app-layer redaction remains as backup defense.

---

## 2. System architecture (pilot)

| Layer | Technology | Notes |
| --- | --- | --- |
| Application | Next.js (Vercel) | Server-rendered dashboard and school profiles |
| Database & Auth | Supabase (Postgres + Auth) | Session-based authentication; Row Level Security |
| User actions | Server actions | No public REST API for CRM mutations in v1 |
| External fetch | University research agent | HTTPS public websites only; SSRF-hardened |

**Data residency:** Determined by selected Supabase project region. Document chosen region in pilot agreement.

---

## 3. Authentication summary

| Item | Detail |
| --- | --- |
| Method | Supabase Auth — email/password (OAuth/magic link supported via `/auth/callback`) |
| Session | Cookie-bound server session (`@supabase/ssr`) |
| Login route | `/login` |
| Logout route | `/logout` |
| Callback route | `/auth/callback` |
| Protected routes | `/` (dashboard), `/schools/*` (school profiles) — middleware requires valid session |
| Public routes | `/login`, `/logout`, `/auth/callback`, static assets |
| Service role key | **Not used** in user-facing application paths |
| MFA | Supported by Supabase Auth; Catalyst recommends MFA for `admin` and `sales` accounts — see `docs/auth-hardening.md` |

**Redirect URLs (configure in Supabase dashboard):**

- Site URL: deployment origin (e.g. `https://crm.example.com`)  
- Redirect URL: `https://<deployment-origin>/auth/callback`  
- Local development: `http://localhost:3000` and `http://localhost:3000/auth/callback`

---

## 4. Authorization and RLS summary

Access is enforced at **three layers**:

1. **Database layer (RLS)** — organization-scoped policies on all core CRM tables.  
2. **Database layer (read-only views)** — `interviews_readonly` and `follow_ups_readonly` omit restricted columns for `read_only` profile loads (Phase 2 Task 2.1).  
3. **Application layer** — role checks on server actions; field redaction for `read_only` users as **backup** if restricted values ever appear in a response.

### Roles

| Role | Access summary |
| --- | --- |
| `read_only` | Read own organization via safe views; restricted interview/follow-up columns not returned; cannot create, update, or delete |
| `sales` | Read and write own organization (full interview/follow-up fields); cannot delete |
| `admin` | Read, write, and delete within own organization (full fields) |
| `super_admin` | Cross-organization platform access with full fields (Catalyst operators only; minimize use) |

### Row Level Security (Postgres)

CRM tables: `schools`, `contacts`, `outreach`, `interviews`, `follow_ups`.

| Operation | Policy basis |
| --- | --- |
| SELECT | User is member of row's `organization_id` (or `super_admin`) |
| INSERT / UPDATE | `admin`, `sales`, or `super_admin` in that organization |
| DELETE | `admin` or `super_admin` in that organization |

Helper functions: `has_org_access()`, `can_write_org()`, `can_manage_org()`, `is_super_admin()`.

**Pilot isolation:** Each pilot university receives a dedicated `organizations` row. Users in Org A cannot read or write Org B data.

**Read-only column privacy (implemented):** Migration `20260703160000_add_readonly_safe_views.sql` defines views that exclude sensitive columns. The application routes `read_only` school profile loads to these views. App-layer redaction (Phase 1) still runs afterward as defense in depth. Details: `docs/supabase-rls-audit.md` (Phase 2 Task 2.1).

---

## 5. Data handling summary

### What the system stores (pilot scope)

| Category | Examples | Classification |
| --- | --- | --- |
| School accounts | Name, district, location, status, pipeline fields | Internal / partnership |
| Contacts | Staff name, role, email, phone, notes | Confidential — business contacts |
| Outreach | Email/call/meeting history, outcomes | Internal |
| Interviews | Discovery notes, pain points, budget, objections | Restricted commercial context |
| Follow-ups | Tasks, due dates, notes | Internal; notes may be restricted for `read_only` |
| University research | Public website-derived profile fields | Public source / internal interpretation |
| Audit metadata | Actor, action, record ID — **not** full note text | Security / operations |

### What the system must NOT store

- Student names, grades, IDs, or demographics  
- FERPA-protected education records  
- Social Security numbers, financial account numbers, or health records  
- Passwords or secrets (beyond Supabase Auth's own store)  

Users are instructed in-product and in `README.md` not to enter student PII.

### Assistive features (not external AI by default)

| Feature | Behavior |
| --- | --- |
| Interview summary | Rule-based pattern matching in the user's browser; **not** sent to a third-party AI model |
| Outreach email generator | Local template from user inputs; user reviews before sending |
| University research | Server fetches **public** HTTPS websites and search result pages; rate limited |

### Data retention and deletion

- **Pilot period:** No automated retention/deletion policy in v1.  
- **Offboarding:** Remove `organization_members` access; disable Supabase Auth users; delete or archive org data per written agreement.  
- **Phase 2+:** Formal retention policy to be documented.

---

## 6. Privacy and FERPA guidance

### Product positioning

Catalyst CRM supports **institutional partnership development** between Catalyst and schools/universities. It is **not** positioned as:

- A student information system  
- A platform for storing educational records about students  
- A HIPAA or FERPA compliance-certified product (pilot phase)  

### User obligations (pilot MOU alignment)

Pilot participants agree to:

1. Enter **school and staff context only** in notes, interviews, and outreach drafts.  
2. **Not enter student PII** or protected education records.  
3. **Review** generated outreach before sending externally.  
4. Use **read_only** accounts for observers who do not need edit access.  
5. Report suspected data misuse to Catalyst contacts (Section 7).

### Read-only field protection

Users with the `read_only` role do not receive these columns from the database
when loading school profiles (views omit them entirely):

| Table | Protected columns |
| --- | --- |
| `interviews` | `raw_notes`, `budget`, `budget_owner`, `objections` |
| `follow_ups` | `notes` |

**Primary control:** Postgres views `interviews_readonly` and `follow_ups_readonly`
with `security_invoker = true` (RLS on base tables still applies).

**Backup control:** Application-layer redaction (Phase 1) still replaces any
non-empty restricted value with `"Restricted"` in the UI if a query path ever
leaks a protected field.

`sales`, `admin`, and `super_admin` users in the organization load base tables
and see full values. `read_only` users cannot mutate data via server actions or
RLS write policies.

### Subprocessors (pilot)

| Vendor | Purpose | Data shared |
| --- | --- | --- |
| Supabase | Database, authentication | CRM data, user emails |
| Vercel | Application hosting | HTTP requests, session cookies |
| (Optional) Error monitoring | Crash reporting (Phase 2 Task 2.32) | Error metadata — configure to exclude PII |

University research may fetch **public** third-party websites; no student data is sent in research requests.

---

## 7. Audit logging summary

Append-only `audit_events` table records sensitive actions.

| Field | Stored |
| --- | --- |
| `organization_id` | Yes |
| `actor_user_id` | Yes |
| `action` | Yes |
| `target_table` | Yes |
| `record_id` | Yes |
| `metadata` | Non-sensitive key-value only |
| Raw interview notes / secrets | **Never** |

### Actions logged (Phase 1)

| Action | Trigger |
| --- | --- |
| `interview.create` | Discovery interview saved |
| `university_research.run` | Research agent executed |
| `university_research.save` | Research profile saved to CRM |

Phase 2 will expand audit coverage for additional CRM mutations (Task 2.7, 2.11–2.14).

**Access to audit logs:** Catalyst administrators via Supabase dashboard or SQL; not exposed in end-user UI in v1.

---

## 8. Rate limiting summary

Per-user rate limits protect against abuse of expensive server actions. Stored in `rate_limit_events` table.

| Action | Limit | Window |
| --- | --- | --- |
| Discovery interview submit | 10 requests | 15 minutes |
| University research run | 3 requests | 15 minutes |

When exceeded, the user receives a generic error message; the action is not performed.

---

## 9. Security controls checklist (Phase 1)

| Control | Status |
| --- | --- |
| Authentication required for CRM routes | Implemented |
| Organization-scoped RLS | Implemented |
| Role-based server action guards | Implemented |
| Server-side input validation (Zod) | Implemented |
| SSRF protection on research URLs | Implemented |
| Rate limiting on sensitive actions | Implemented |
| Audit events for key mutations | Implemented |
| Read-only field redaction (app layer, backup) | Implemented |
| Database-enforced read-only views (primary) | Implemented (Phase 2 Task 2.1) |
| Privacy warnings in UI | Implemented |
| CI lint/build on code changes | Implemented |
| Admin membership UI | Phase 2 Task 2.6 (planned) |

---

## 10. Incident and escalation contacts

> **Placeholder — replace before production pilot go-live.**

| Role | Name | Email | Phone |
| --- | --- | --- | --- |
| Catalyst executive sponsor | `[NAME]` | `[EMAIL]` | `[PHONE]` |
| Catalyst technical lead | `[NAME]` | `[EMAIL]` | `[PHONE]` |
| Catalyst security contact | `[NAME]` | `[EMAIL]` | `[PHONE]` |
| University IT primary | `[NAME]` | `[EMAIL]` | `[PHONE]` |
| University data/privacy contact | `[NAME]` | `[EMAIL]` | `[PHONE]` |

### Reporting

- **Security incident** (suspected breach, unauthorized access): notify Catalyst security contact within **24 hours**.  
- **Availability incident** (outage): notify Catalyst technical lead.  
- **Data concern** (possible student PII entered): notify both Catalyst security and university privacy contact; coordinate deletion/remediation.

Detailed runbook: [docs/incident-response-runbook.md](docs/incident-response-runbook.md) (Phase 2 Task 2.35) — severity levels, rollback procedures, audit queries, and communication templates.

---

## 11. MOU technical appendix (template language)

*Attach or adapt the following to the pilot Memorandum of Understanding or pilot letter. Legal review recommended.*

---

### Appendix A — Technical and data protection terms (Catalyst CRM pilot)

**A.1 Purpose.** The Pilot Participant will use Catalyst CRM solely to support institutional partnership discussions, pipeline tracking, and related business development activities between the parties. The system is not licensed or intended for use as a student information system or repository of student education records.

**A.2 Data categories.** The system may store school institutional information, business contact details, partnership notes, outreach history, and commercially sensitive discovery information entered by authorized users. Users shall not enter personally identifiable information about students, student grades, student identification numbers, or other records protected under the Family Educational Rights and Privacy Act (FERPA) or equivalent law.

**A.3 Access controls.** Access requires individual authentication. Each user is assigned one of the following roles: read-only observer, sales/partnerships contributor, or administrator. Read-only users cannot modify records and do not receive certain sensitive commercial fields (including raw interview notes, budget, budget owner, objections, and detailed follow-up notes); those columns are omitted by database views and masked in the application as a backup control. Data is scoped to the Pilot Participant's organization and is not visible to other Catalyst customers.

**A.4 Hosting and subprocessors.** The application is hosted on Vercel. Data is stored in a Supabase-managed PostgreSQL database and authenticated through Supabase Auth. Region: `[SPECIFY SUPABASE REGION]`. Deployment URL: `[SPECIFY URL]`.

**A.5 Assistive features.** Interview summarization uses rule-based processing in the user's browser and does not transmit notes to external artificial intelligence services unless a separate written feature addendum is executed. The university research feature retrieves publicly available website content over HTTPS to populate institutional profile fields; users shall not submit student data or non-public internal records to this feature.

**A.6 Audit and accountability.** Catalyst logs metadata about certain sensitive actions (including interview creation and research runs), including actor identity and record identifiers, but does not store full text of notes in audit logs.

**A.7 Rate limits and acceptable use.** Automated or excessive use of research or submission features may be rate limited. Users shall not attempt to circumvent authentication, authorization, or organization boundaries.

**A.8 Incident notification.** Each party will notify the other within twenty-four (24) hours of becoming aware of a confirmed security incident affecting Pilot data or credentials. Contacts are listed in the Pilot IT Security Packet.

**A.9 Term and data return.** Upon pilot termination, Catalyst will disable Pilot Participant user access within `[NUMBER]` business days. Data export or deletion will be handled as follows: `[SPECIFY: export CSV / delete org / retention period]`.

**A.10 No compliance certification.** The parties acknowledge that Catalyst CRM is offered as a controlled pilot system and does not constitute SOC 2, FERPA, or HIPAA certification. The Pilot Participant is responsible for determining whether use of the system is appropriate for its policies and applicable law.

---

*End of Appendix A template*

---

## 12. Document history

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-07-03 | Initial packet (Phase 2 Task 2.0) |
| 1.1 | 2026-07-03 | Document database read-only views and backup app redaction (Phase 2 Task 2.1C) |

---

## References

- `docs/pilot-onboarding-checklist.md`  
- `docs/executive-reports/phase-1-executive-summary.md`  
- `docs/security-reports/phase-1-security-completion-report.md`  
- `docs/supabase-rls-audit.md`  
- `README.md`
