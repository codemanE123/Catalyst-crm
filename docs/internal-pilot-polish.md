# Internal Pilot Polish — Catalyst CRM QA Review

**Review date:** July 6, 2026  
**Branch / tag:** `phase-2` @ `v0.4-pilot-ready`  
**Staging URL:** `https://catalyst-crm-tau.vercel.app`  
**Method:** Full-application code review (UI, workflows, validation, loading, accessibility, navigation). No automated accessibility scan or live user testing in this pass.  
**Constraint:** Findings and recommendations only — no application changes in this document.

**Companion documents:** `docs/dashboard-ux-review.md`, `docs/pilot-qa-results.md`, `docs/pilot-launch-readiness-checklist.md`, `docs/production-launch-blocker-checklist.md`

---

## Executive summary

Catalyst CRM is **functionally pilotable** for authenticated `sales` and `admin` users on staging: sign-in, dashboard, school profiles, outreach logging, contacts, follow-ups, CSV import/export, and global search are wired end-to-end with server-side auth and org isolation.

The largest polish gaps for an internal pilot are **incomplete outreach capture**, **role-based UI inconsistencies**, **stale UI after mutations**, and **missing affordances** (navigation to admin settings, task queue, loading feedback). Several issues create the impression that saves failed or that the product is unfinished even when the server accepted the request.

**Issue count by severity**

| Severity | Count | Definition used in this review |
| --- | ---: | --- |
| **Critical** | 2 | Core workflow broken, data integrity risk, or contradicts documented pilot security UX |
| **High** | 8 | Major friction, misleading UI, or duplicate-record risk with no easy workaround |
| **Medium** | 14 | Noticeable polish gaps; workaround exists or impact is role-scoped |
| **Low** | 10 | Copy, consistency, and minor UX refinements |

---

## Scope reviewed

| Area | Files / routes |
| --- | --- |
| Dashboard | `app/page.tsx`, `app/components/DashboardTables.tsx`, `app/components/SchoolForm.tsx`, `app/components/SchoolImport.tsx`, `app/components/DiscoveryInterviewForm.tsx`, `app/components/OutreachEmailGenerator.tsx` |
| School profile | `app/schools/[id]/page.tsx`, `app/components/OutreachLogForm.tsx`, `app/components/ContactForm.tsx`, `app/components/FollowUpPanel.tsx` |
| Global shell | `app/layout.tsx`, `app/components/GlobalSearch.tsx` |
| Auth | `app/login/page.tsx`, `middleware.ts`, `app/logout/route.ts` |
| Admin | `app/settings/members/page.tsx`, `app/settings/members/MembersSettingsPanel.tsx` |
| APIs | `app/api/search/route.ts`, `app/api/export/schools/route.ts`, `app/api/export/contacts/route.ts` |
| Validation & data | `lib/validation.ts`, `lib/supabase.ts`, `lib/actions/*` |
| Unmounted component | `app/components/UniversityResearchAgent.tsx` |

**Recently improved (not counted as open issues):** global header search, dashboard table filters, nine metric cards, school CSV import, filtered CSV export. See `docs/dashboard-ux-review.md` for the original baseline.

---

## Critical

Issues that block trust in core CRM workflows or violate documented pilot role expectations.

---

### C1 — Outreach history always shows “No outreach note”

| | |
| --- | --- |
| **Category** | Broken workflow · Missing validation |
| **Files** | `app/components/OutreachLogForm.tsx`, `lib/validation.ts` (`outreachLogSchema`), `lib/actions/outreach.ts`, `app/schools/[id]/page.tsx` (`OutreachHistory`) |
| **Problem** | The outreach form collects channel, subject, **outcome**, date, and next step. The database and history UI also expect a `message` column. The schema, server action, and form never read or write `message`. History renders `activity.message ?? "No outreach note."` |
| **User impact** | Reps believe they logged outreach (success banner appears), but the note column in history is always empty for new entries. Sample data includes messages, so live pilot data looks broken by comparison. Outcome and message semantics overlap without guidance. |
| **Recommended fix** | Add a **Message / notes** field to the form; extend `outreachLogSchema` and insert path; clarify label copy vs. outcome. |

---

### C2 — Discovery interview form visible to `read_only` users

| | |
| --- | --- |
| **Category** | Broken workflow · Navigation / role UX |
| **Files** | `app/page.tsx`, `app/components/DiscoveryInterviewForm.tsx`, `lib/supabase.ts` (`createInterviewNote`) |
| **Problem** | `SchoolForm`, `SchoolImport`, and CSV export are gated behind `canManageSchools` (`MUTATION_ROLES`). `DiscoveryInterviewForm` is always rendered inside `DashboardTables`. Server rejects `read_only` with “You do not have permission to save interviews.” |
| **User impact** | University observers (`read_only`) see a long editable form, invest time, then hit a permission error. Contradicts `docs/pilot-launch-readiness-checklist.md` item 7 (“`read_only` cannot see outreach/follow-up/school/contact **mutation forms**”). Undermines pilot security messaging. |
| **Recommended fix** | Gate `DiscoveryInterviewForm` with the same `canManageSchools` (or `MUTATION_ROLES`) check used for other write UI; optionally show a read-only explainer for observers. |

---

## High

Major friction, misleading behavior, or duplicate-data risk.

---

### H1 — Discovery form client validation disagrees with server

| | |
| --- | --- |
| **Category** | Missing validation |
| **Files** | `app/components/DiscoveryInterviewForm.tsx`, `lib/validation.ts` (`interviewNoteSchema`) |
| **Problem** | HTML `required` on `raw_notes` and `pain_points`. Server: `raw_notes` optional; requires **either** `notes` (interview summary) **or** `pain_points`. Summary field is not HTML-required. |
| **User impact** | Cannot submit with summary-only content if pain points empty (client blocks). Forced to paste raw notes even when structured fields are complete. |
| **Recommended fix** | Align HTML `required` / `disabled` submit logic with `interviewNoteSchema.superRefine`. |

---

### H2 — Interview save succeeds but dashboard/profile stay stale

| | |
| --- | --- |
| **Category** | Loading · Broken workflow |
| **Files** | `lib/supabase.ts` (`createInterviewNote` — no `revalidatePath`), compare `lib/actions/outreach.ts`, `lib/actions/contacts.ts`, `lib/actions/schools.ts` |
| **Problem** | Interview creation returns `{ ok: true }` without cache revalidation. Other mutations call `revalidatePath("/")` and/or `/schools/[id]`. |
| **User impact** | “Discovery interview saved” banner appears, but metric cards, interview counts, and school profile interview list do not update until manual refresh. |
| **Recommended fix** | Add `revalidatePath("/")` and `revalidatePath(\`/schools/${schoolId}\`)` after successful insert. |

---

### H3 — Forms do not reset after successful submission

| | |
| --- | --- |
| **Category** | Broken workflow |
| **Files** | `DiscoveryInterviewForm.tsx`, `OutreachLogForm.tsx`, `FollowUpPanel.tsx`, `SchoolForm.tsx`, `ContactForm.tsx` |
| **Problem** | `useActionState` shows success banners but leaves populated fields. No `key` remount on success, no `reset()`, no `router.refresh()` in client forms (except partial patterns in `MembersSettingsPanel`). |
| **User impact** | Accidental duplicate outreach, follow-ups, contacts, or interviews on second submit. Discovery form retains `rawNotes` / summary React state after save. |
| **Recommended fix** | Clear fields or remount form on `submitState.ok`; offer “Log another” affordance on profile forms. |

---

### H4 — `UniversityResearchAgent` built but not mounted

| | |
| --- | --- |
| **Category** | Broken workflow |
| **Files** | `app/components/UniversityResearchAgent.tsx` (exists); not imported in `app/page.tsx` or `app/schools/[id]/page.tsx` |
| **Problem** | Full research UI and server action exist in the repo and security docs, but no route renders the component. School profile only **displays** research fields if already populated. |
| **User impact** | Pilot users cannot run university research from the app. Documentation and architecture audits reference a capability that is absent from the UI. |
| **Recommended fix** | Mount on school profile (sales/admin) or remove/hide from pilot scope and docs until ready. |

---

### H5 — No org-wide follow-up task queue

| | |
| --- | --- |
| **Category** | Broken workflow · Navigation |
| **Files** | `app/page.tsx`, `app/components/FollowUpPanel.tsx`, `lib/actions/followUps.ts` |
| **Problem** | Follow-ups exist only per school profile. No dashboard panel or `/tasks` route lists open follow-ups across accounts by due date. |
| **User impact** | Reps cannot answer “what is due today?” without opening every school. Primary daily planning surface is missing. |
| **Recommended fix** | Add **My follow-ups** panel at top of dashboard (overdue first, link to school profile). |

---

### H6 — Member role changes apply immediately without confirmation

| | |
| --- | --- |
| **Category** | Broken workflow |
| **Files** | `app/settings/members/MembersSettingsPanel.tsx` |
| **Problem** | Role `<select>` `onChange` fires server update instantly. No Save button, no confirm dialog, no undo. |
| **User impact** | Accidental demotion/promotion during pilot admin setup; keyboard navigation on the dropdown can trigger unintended changes. |
| **Recommended fix** | Explicit Save per row or confirm dialog for role changes. |

---

### H7 — Remove member has no confirmation

| | |
| --- | --- |
| **Category** | Broken workflow |
| **Files** | `app/settings/members/MembersSettingsPanel.tsx` |
| **Problem** | “Remove” immediately calls `removeMember`. Server blocks self-removal but not mis-clicks on others. |
| **User impact** | One mistaken click revokes a teammate’s access during pilot. |
| **Recommended fix** | Confirm dialog with member identifier before delete. |

---

### H8 — Most submit buttons lack pending / disabled state

| | |
| --- | --- |
| **Category** | Loading |
| **Files** | `SchoolForm.tsx`, `ContactForm.tsx`, `DiscoveryInterviewForm.tsx`, `OutreachLogForm.tsx`, `FollowUpPanel.tsx` vs `SchoolImport.tsx`, `UniversityResearchAgent.tsx` |
| **Problem** | Only import and research agent disable buttons during async work. Other forms allow double-click / double submit. |
| **User impact** | Duplicate records and audit noise on slow networks; pairs with H3 (no reset). |
| **Recommended fix** | Use `useFormStatus` or `isPending` to disable submit buttons during server actions. |

---

## Medium

Noticeable polish gaps; workarounds exist or impact is narrower.

---

### M1 — No navigation link to Settings / Members

| **Category** | Navigation  
| **Files** | `app/layout.tsx`, `app/settings/members/page.tsx`  
| **Problem** | Header: logo, search, sign in/out only. `/settings/members` is admin-only via middleware but not linked.  
| **User impact** | Admins must know the URL; onboarding docs must spell it out.

---

### M2 — No page-level loading states

| **Category** | Loading  
| **Files** | All `app/**/page.tsx`; no `loading.tsx` in repo  
| **Problem** | Dashboard and school profile are `force-dynamic` async server components with no skeleton UI.  
| **User impact** | Slow Supabase queries show blank content under the header with no feedback.

---

### M3 — Filtered tables show empty body with no empty state

| **Category** | Confusing UI  
| **Files** | `app/components/DashboardTables.tsx`  
| **Problem** | Counter says “Showing 0 of N schools/contacts” but table body is empty—no dashed empty state (unlike school profile `EmptyState`).  
| **User impact** | Users think the table failed to load rather than filters being too strict.

---

### M4 — Contacts table does not link to school profiles

| **Category** | Navigation  
| **Files** | `app/components/DashboardTables.tsx` (`ContactsTable`)  
| **Problem** | School column is plain text. Schools table links name + “View profile”; contacts do not.  
| **User impact** | Extra steps to open a contact’s school (global search or manual school lookup).

---

### M5 — Pipeline stage cards are not linked to table filters

| **Category** | Navigation · Confusing UI  
| **Files** | `app/page.tsx` (pipeline section), `app/components/DashboardTables.tsx` (status filter)  
| **Problem** | Pipeline cards show Prospect / Contacted / Interviewing / Partner counts but are not clickable. Schools table has a separate status dropdown—not synchronized with cards.  
| **User impact** | Users expect card click to filter the table; must use the dropdown instead.

---

### M6 — Members table shows opaque user IDs, not emails

| **Category** | Confusing UI · Poor wording  
| **Files** | `app/settings/members/MembersSettingsPanel.tsx` (`formatUserId`)  
| **Problem** | Displays truncated UUIDs. Footer notes users must be provisioned in Supabase Auth separately.  
| **User impact** | Admins cannot confidently identify who they are editing or removing.

---

### M7 — Role labels shown as raw snake_case

| **Category** | Poor wording  
| **Files** | `app/settings/members/MembersSettingsPanel.tsx` (`ROLE_OPTIONS`)  
| **Problem** | Dropdown shows `read_only`, `super_admin` verbatim.  
| **User impact** | Looks unfinished; increases mis-selection risk.

---

### M8 — Export failures open raw JSON in the browser

| **Category** | Broken workflow · Confusing UI  
| **Files** | `app/components/DashboardTables.tsx`, `app/api/export/*/route.ts`  
| **Problem** | Export uses plain `<a href>`. On 401/403/500, API returns JSON; browser displays `{"error":"..."}`.  
| **User impact** | Session-expired or unauthorized export shows cryptic JSON instead of an in-app message.

---

### M9 — Login “Continue to dashboard” loops unauthenticated users

| **Category** | Navigation · Poor wording  
| **Files** | `app/login/page.tsx`, `middleware.ts`  
| **Problem** | Link to `/` below sign-in form. Middleware redirects unauthenticated users back to `/login`.  
| **User impact** | Appears to offer a bypass; actually loops. Confusing for demos without credentials.

---

### M10 — School import UI does not reset after successful import

| **Category** | Broken workflow  
| **Files** | `app/components/SchoolImport.tsx`  
| **Problem** | Success summary stays visible; file input, preview table, and `csvText` state persist.  
| **User impact** | Risk of re-importing the same CSV; unclear whether a new upload is needed.

---

### M11 — New schools default district/location to “Unknown”

| **Category** | Missing validation  
| **Files** | `lib/actions/schools.ts` (create path), `app/components/SchoolForm.tsx`  
| **Problem** | Create action hardcodes `district: "Unknown"`, `location: "Unknown"`. UI does not expose these fields on create/edit.  
| **User impact** | Imported and manually created schools clutter tables and search with “Unknown”; no in-app path to fix without update form gaps. CSV import can set district/location; manual create cannot.

---

### M12 — School status rollback error easy to miss

| **Category** | Missing validation · Confusing UI  
| **Files** | `lib/actions/schools.ts`, `lib/validation.ts`, `app/components/SchoolForm.tsx`  
| **Problem** | Server returns “Pipeline status cannot move backward.” UI does not explain allowed transitions upfront.  
| **User impact** | User changes Partner → Prospect, clicks update, may miss the red banner among many fields.

---

### M13 — Global search combobox incomplete for accessibility

| **Category** | Accessibility  
| **Files** | `app/components/GlobalSearch.tsx`  
| **Problem** | Uses `role="combobox"` / `listbox` / `option` but lacks arrow-key roving, `aria-activedescendant`, and `aria-autocomplete`. Results are links (good for click), not keyboard-roving options.  
| **User impact** | Keyboard-only users can type and tab to results but cannot operate the combobox per expected ARIA pattern.

---

### M14 — Form errors not associated with fields

| **Category** | Accessibility · Missing validation  
| **Files** | All form components in `app/components/`  
| **Problem** | Errors render as top-of-form `<p>` banners without `aria-describedby`, `role="alert"`, or field `id` linkage. Server returns only first Zod message via `formatZodError`.  
| **User impact** | Screen reader users hear a generic error but may not know which field failed.

---

## Low

Copy, consistency, and minor refinements.

---

### L1 — Mixed K-12 vs. higher-ed terminology

| **Category** | Poor wording  
| **Files** | `app/page.tsx`, `app/schools/[id]/page.tsx`, `DiscoveryInterviewForm.tsx`, `UniversityResearchAgent.tsx`  
| **Problem** | Dashboard uses “district”, “Principal”, K-12 placeholders; elsewhere “University research”, HBCU-oriented seed data.  
| **User impact** | Pilot cohort unsure which institution type the CRM targets.

---

### L2 — Pilot / internal language in production UI

| **Category** | Poor wording  
| **Files** | `app/page.tsx` (“first-version workspace”), `app/layout.tsx` metadata, `MembersSettingsPanel.tsx`  
| **Problem** | Copy reads like internal/dev documentation.  
| **User impact** | Reduces polish and trust for external pilot partners.

---

### L3 — No custom `not-found` page

| **Category** | Navigation  
| **Files** | `app/schools/[id]/page.tsx` (`notFound()`); no `app/not-found.tsx`  
| **Problem** | Invalid school IDs show generic Next.js 404.  
| **User impact** | Dead-end without branded “Back to dashboard” recovery.

---

### L4 — Inconsistent date timezone formatting

| **Category** | Confusing UI  
| **Files** | `DashboardTables.tsx` (local TZ), `app/schools/[id]/page.tsx`, `FollowUpPanel.tsx` (`timeZone: "UTC"`)  
| **Problem** | Same timestamps may show different calendar days across pages.  
| **User impact** | Minor confusion comparing dashboard vs. profile dates.

---

### L5 — Research website field is plain text, not a link

| **Category** | Confusing UI  
| **Files** | `app/schools/[id]/page.tsx` (`ResearchField`)  
| **Problem** | Website shown as text; not clickable.  
| **User impact** | Extra copy-paste during research review.

---

### L6 — Duplicate status / owner on school profile

| **Category** | Duplicate UI  
| **Files** | `app/schools/[id]/page.tsx` (hero badges, summary cards, `StatusPanel`)  
| **Problem** | Status in hero, summary, and `StatusPanel`; owner repeated in summary and `StatusPanel`.  
| **User impact** | Visual clutter on mobile; same facts scanned multiple times.

---

### L7 — Duplicate navigation affordances in schools table

| **Category** | Duplicate buttons  
| **Files** | `app/components/DashboardTables.tsx`  
| **Problem** | School name and “View profile” both link to the same URL in each row.  
| **User impact** | Redundant click targets; minor visual noise.

---

### L8 — Members panel success and error share neutral styling

| **Category** | Confusing UI  
| **Files** | `app/settings/members/MembersSettingsPanel.tsx`  
| **Problem** | Errors and “Membership updated.” use similar bordered gray boxes.  
| **User impact** | Errors do not stand out vs. success.

---

### L9 — `OutreachEmailGenerator` may be confused with CRM logging

| **Category** | Confusing UI · Poor wording  
| **Files** | `app/page.tsx`, `app/components/OutreachEmailGenerator.tsx`  
| **Problem** | Local-only draft tool; not gated by role; sits near real logging workflows. No link to `OutreachLogForm` on school profile.  
| **User impact** | Users may think generated emails are saved to CRM.

---

### L10 — Wide tables on mobile without card fallback

| **Category** | Confusing UI  
| **Files** | `DashboardTables.tsx`, `MembersSettingsPanel.tsx`, `SchoolImport.tsx`  
| **Problem** | `overflow-x-auto` + `min-w-[760px]` tables; no responsive card layout.  
| **User impact** | Usable but awkward on phones; column context lost while scrolling.

---

### L11 — Sign-in uses `Link`, sign-out uses `<a href="/logout">`

| **Category** | Navigation  
| **Files** | `app/layout.tsx`  
| **Problem** | Inconsistent navigation primitives (logout needs full request for cookie clearing).  
| **User impact** | Negligible functional impact; minor inconsistency.

---

### L12 — Sample-data mode unreachable without Supabase env

| **Category** | Broken workflow (local/demo only)  
| **Files** | `middleware.ts`, `lib/supabaseServer.ts`, `app/login/page.tsx`  
| **Problem** | Without `NEXT_PUBLIC_SUPABASE_*`, middleware sends all protected paths to login; login cannot succeed; sample fallback in `getDashboardData()` never reachable.  
| **User impact** | “Try without Supabase” local demos fail unless env vars are set.

---

## Role-based UI matrix

| Capability | `read_only` | `sales` / `admin` | `admin` / `super_admin` |
| --- | --- | --- | --- |
| View dashboard & school profiles | Yes (field redaction) | Yes | Yes |
| Global search | Yes | Yes | Yes |
| School create / update / import | Hidden | Yes | Yes |
| CSV export | Hidden | Yes | Yes |
| Discovery interview form | **Shown (submit fails)** ⚠️ C2 | Yes | Yes |
| Outreach email generator | Yes | Yes | Yes |
| School profile mutations | Hidden | Yes (org-scoped) | Yes |
| Settings / members | Redirect to `/` | Redirect to `/` | Yes (**no nav link** — M1) |
| Sensitive fields | Redacted “Restricted” | Visible | Visible |

Redaction banner on school profile is well-implemented (`app/schools/[id]/page.tsx`).

---

## Cross-cutting themes

1. **Write UI gating is inconsistent** — Most mutation forms respect `MUTATION_ROLES`; discovery interview does not (C2).
2. **Success ≠ visible update** — Interview path omits cache revalidation (H2); forms retain values (H3).
3. **Schema ↔ UI drift** — Outreach `message` and interview required fields diverge from forms (C1, H1).
4. **Destructive admin actions lack guardrails** — Role change and remove member (H6, H7).
5. **Loading and empty feedback are thin** — No `loading.tsx`, few pending buttons, weak filtered-empty states (M2, M3, H8).
6. **Navigation is URL-deep** — Settings, tasks, and contact→school paths require tribal knowledge (M1, M4, H5).
7. **Terminology straddles K-12 and higher ed** — Copy and placeholders send mixed signals (L1).

---

## Recommended fix order (internal pilot sprint)

| Order | ID | Effort (est.) | Rationale |
| ---: | --- | --- | --- |
| 1 | C1 | Small | Unblocks outreach audit trail — highest daily rep activity |
| 2 | C2 | Small | Aligns with pilot security checklist and observer role |
| 3 | H1, H2 | Small | Unblocks discovery workflow reliability |
| 4 | H3, H8 | Medium | Prevents duplicate pilot data |
| 5 | H4 | Small | Mount research agent or explicitly defer from pilot scope |
| 6 | M1, M3, M5 | Small–medium | Admin discoverability + dashboard clarity |
| 7 | H6, H7 | Small | Protect pilot membership during setup |
| 8 | H5 | Medium | Daily rep planning surface |
| 9 | M2, M13, M14 | Medium | Perceived performance and a11y baseline |
| 10 | L1–L12 | Ongoing | Copy and polish pass before external partners |

---

## Verification checklist (post-fix)

Use after addressing Critical and High items:

- [ ] Log outreach on school profile → `message` appears in history (not “No outreach note”)
- [ ] Sign in as `read_only` → discovery interview form **not** visible (or read-only explainer only)
- [ ] Save discovery interview as `sales` → dashboard metrics and profile list update without manual refresh
- [ ] Submit any form twice quickly → no duplicate rows (pending state + reset)
- [ ] Filter schools to zero results → explicit empty state message
- [ ] Admin: open Settings from header → manage members with confirm on remove/role change
- [ ] Export CSV with expired session → user-friendly error (not raw JSON)
- [ ] Keyboard: tab through global search results; screen reader announces field-level errors

---

## Related automated test status

From `docs/pilot-qa-results.md` (July 6, 2026):

- Playwright smoke: **3/3 pass** on staging (login, auth, dashboard load)
- Unit tests: **118 pass** (post export/search/import work)
- **Not executed this cycle:** full `read_only` redaction matrix, cross-org RLS walkthrough, manual outreach message verification (blocked by C1)

---

*Document generated from codebase review. Re-run this review after major UI or workflow changes.*
