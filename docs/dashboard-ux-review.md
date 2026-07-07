# Dashboard UX Review — Catalyst CRM

**Review date:** July 6, 2026  
**Scope:** Sales representative daily workflow on `/` (dashboard) and `/schools/[id]` (school profile)  
**Method:** Code and layout review — no user testing, no redesign proposals  
**Constraint:** Recommendations only; no application changes in this document

---

## Executive summary

Catalyst CRM today is a **long-scroll pipeline dashboard** plus **deep school profile pages**. Core rep activities — logging outreach, managing contacts, scheduling follow-ups, recording discovery — are supported, but they are spread across pages and buried below executive metrics.

The largest daily friction for a sales rep is **finding the right account quickly** and **acting on it in one place**. Search, filtering, task queues, and quick actions are absent or minimal. Tables work on desktop but **force horizontal scrolling on mobile**. Forms are functional but split across views and do not always align with what history screens display.

This document lists the **top 10 usability improvements** ranked **High**, **Medium**, and **Low** for rep productivity. Each item references current behavior observed in the codebase.

---

## Current UX baseline

| Area | Current state | Primary files |
| --- | --- | --- |
| **Dashboard** | Single page: CEO funnel, school form, pipeline counts, schools table, discovery form, email generator, contacts table | `app/page.tsx` |
| **Navigation** | Header with logo + sign out only; no sidebar, breadcrumbs, or section links | `app/layout.tsx` |
| **School profile** | Contacts, outreach log, follow-ups, interviews, status — all on one long page | `app/schools/[id]/page.tsx` |
| **Search** | None | — |
| **Filtering** | Pipeline stage counts are display-only; no status/owner/date filters | `app/page.tsx` |
| **Tables** | Full list render; fixed server sort; `min-w-[760px]` with horizontal scroll | `app/page.tsx` |
| **Mobile** | Responsive grids stack, but tables remain wide; no mobile nav pattern | Tailwind defaults |

**Typical rep path today:** Sign in → scroll dashboard → open school profile → scroll to form → submit → back to dashboard for discovery or email drafting. **Minimum 2–3 page loads** for a single account touchpoint.

---

## Top 10 usability improvements

### High priority

These address daily workflow blockers: finding accounts, prioritizing work, and acting without excessive navigation.

---

#### 1. Global search for schools and contacts

| | |
| --- | --- |
| **Priority** | **High** |
| **Focus areas** | Search, fewer clicks, table usability |
| **Problem** | There is no search input anywhere in the app. Reps must scroll the full schools or contacts table or remember a profile URL. As the pilot seed list grows (50+ accounts), this becomes unusable. |
| **Evidence** | No `search` inputs in `app/`; `getDashboardData()` loads all schools and contacts with fixed sort only (`lib/supabase.ts`). |
| **Recommendation** | Add a persistent search field in the header or top-level toolbar. Search school name, district, location, contact name, email, and owner. Show grouped results (schools first, then contacts) with one-click navigation to `/schools/[id]`. |
| **Rep impact** | Reduces account lookup from scroll-and-scan to one keystroke + one click. |

---

#### 2. Pipeline and ownership filters (clickable stages)

| | |
| --- | --- |
| **Priority** | **High** |
| **Focus areas** | Filtering, table usability, fewer clicks |
| **Problem** | Pipeline status cards show Prospect / Contacted / Interviewing / Partner counts but are not interactive. The schools table always shows every account. There is no “My accounts” filter despite `owner` and `assigned_to` fields in the data model. |
| **Evidence** | Pipeline section in `app/page.tsx` renders counts only; `SchoolsTable` maps all `schools` with no client or server filter UI. |
| **Recommendation** | Make pipeline stage chips toggle filters on the schools table. Add filter controls for status, owner, and (when exposed) assignee. Default option: “My accounts” for the signed-in rep. Show active filter state and a clear “Reset filters” action. |
| **Rep impact** | Reps see only the slice of pipeline they are working today instead of the full org list. |

---

#### 3. Cross-account follow-up queue (“Due today / Overdue”)

| | |
| --- | --- |
| **Priority** | **High** |
| **Focus areas** | Navigation, fewer clicks, filtering |
| **Problem** | Follow-ups exist only inside each school profile (`FollowUpPanel`). There is no org-wide view of open tasks sorted by due date. A rep’s morning workflow — “what must I do today?” — requires opening every account. |
| **Evidence** | `getOpenFollowUpsForSchool()` is scoped to one school (`lib/actions/followUps.ts`); dashboard has no follow-up section. |
| **Recommendation** | Add a compact **My follow-ups** panel at the top of the dashboard (or a dedicated `/tasks` route linked from the header). List open follow-ups across all schools: title, school name, due date, owner. Sort overdue first. One click opens the school profile with the follow-up section in view. |
| **Rep impact** | Replaces N profile visits with one prioritized task list — the primary daily planning surface. |

---

#### 4. Quick actions from the schools table

| | |
| --- | --- |
| **Priority** | **High** |
| **Focus areas** | Fewer clicks, forms, table usability |
| **Problem** | The schools table only links to “View profile.” Logging outreach, adding a contact, or updating next step requires a full navigation to `/schools/[id]` and scrolling to the correct form. |
| **Evidence** | `SchoolsTable` row actions are name link + “View profile” only (`app/page.tsx`). Outreach and contact forms live exclusively on the school profile. |
| **Recommendation** | Add row-level quick actions: **Log outreach** (minimal modal: channel, date, outcome, next step), **Update next step** (inline or modal), **Add contact** (short form). Keep full profile for deep work; use quick actions for routine touchpoints. |
| **Rep impact** | Cuts 2–3 clicks and a full page load for the most frequent CRM updates. |

---

#### 5. Mobile-friendly table layouts (card view on small screens)

| | |
| --- | --- |
| **Priority** | **High** |
| **Focus areas** | Mobile responsiveness, table usability |
| **Problem** | Schools and contacts tables use `min-w-[760px]` inside `overflow-x-auto`, forcing horizontal scroll on phones. Reps checking pipeline between meetings cannot scan accounts comfortably on mobile. |
| **Evidence** | `app/page.tsx` lines 206–207, 271–272. No breakpoint-specific card/list alternative. |
| **Recommendation** | Below `md` (768px), render each school/contact as a stacked card: primary field prominent, status pill, next step, and primary action button. Preserve table layout on desktop. Ensure tap targets meet ~44px minimum. |
| **Rep impact** | Makes the dashboard usable on phone and tablet without sideways scrolling. |

---

### Medium priority

These improve efficiency and reduce confusion once core find-and-act flows are in place.

---

#### 6. Actionable contacts table with school links

| | |
| --- | --- |
| **Priority** | **Medium** |
| **Focus areas** | Table usability, navigation, fewer clicks |
| **Problem** | The contacts table is read-only. School names are plain text (not links). There is no way to jump to a contact’s account or filter by relationship (e.g. “Needs follow-up”, “Champion”). |
| **Evidence** | `ContactsTable` renders display cells only; no `<a>` on school name or contact name (`app/page.tsx`). |
| **Recommendation** | Link school name → `/schools/[id]`. Add relationship and “stale last touch” filters (e.g. no touch in 30 days). Optional: link email to `mailto:` for one-tap outreach outside the CRM. |
| **Rep impact** | Contacts table becomes a relationship worklist, not a static report. |

---

#### 7. Rep-focused dashboard layout (role-aware prioritization)

| | |
| --- | --- |
| **Priority** | **Medium** |
| **Focus areas** | Navigation, fewer clicks |
| **Problem** | Every user sees the CEO growth funnel first, then school management form, then operations snapshot, then pipeline, then schools. Sales reps need accounts and tasks first; executive metrics add scroll distance before actionable content. |
| **Evidence** | `CeoDashboard` renders unconditionally for all roles (`app/page.tsx`); no role-based section ordering. |
| **Recommendation** | For `sales` role: surface **My follow-ups**, **filtered schools table**, and **quick search** above the fold. Collapse or move CEO funnel below the fold or to a separate “Leadership” section. Keep full dashboard for admin/executive roles. |
| **Rep impact** | Reps land on work, not reporting, after sign-in. |

---

#### 8. Form UX consistency and post-submit behavior

| | |
| --- | --- |
| **Priority** | **Medium** |
| **Focus areas** | Forms, fewer clicks |
| **Problem** | Several form friction points slow reps and create data gaps: (a) forms do not reset after successful submit — risk of duplicate entries; (b) outreach form has no `message` field but history UI displays `activity.message` as “No outreach note”; (c) discovery interview is on the dashboard while outreach/contacts/follow-ups are on the profile — split workflow; (d) new schools get `district`/`location` hardcoded `"Unknown"` with no edit path in UI. |
| **Evidence** | `ContactForm`, `OutreachLogForm` use `useActionState` without field reset; outreach validation omits `message` (`lib/validation.ts`); `DiscoveryInterviewForm` on dashboard, other forms on profile; `lib/actions/schools.ts` create path. |
| **Recommendation** | Clear form fields after success (or show “Log another” prompt). Add outreach **notes/message** field aligned with history display. Move discovery interview to school profile (or add school context picker that deep-links back). Expose district/location/state on school create/edit. |
| **Rep impact** | Fewer duplicate submissions, complete outreach records, and one-account-one-page workflow. |

---

### Low priority

These help at scale and polish; they matter less for a 50-account pilot than items 1–5.

---

#### 9. Sortable table columns with visible sort state

| | |
| --- | --- |
| **Priority** | **Low** |
| **Focus areas** | Table usability, filtering |
| **Problem** | Schools sort by name only; contacts by `last_touch` descending — both fixed server-side. Reps cannot sort by status, owner, or next follow-up date from the UI. |
| **Evidence** | `getDashboardData()` query order in `lib/supabase.ts`; no sort controls in `SchoolsTable` or `ContactsTable`. |
| **Recommendation** | Add clickable column headers for schools (name, status, owner) and contacts (last touch, relationship, school). Preserve sort in URL query params so refresh and share links keep context. |
| **Rep impact** | Flexible prioritization without exporting to spreadsheet. |

---

#### 10. Section navigation on long pages

| | |
| --- | --- |
| **Priority** | **Low** |
| **Focus areas** | Navigation, mobile responsiveness |
| **Problem** | Dashboard and school profile are long single-column scrolls with no jump links, sticky subnav, or “back to top.” On mobile, reaching outreach or follow-up forms on a profile requires extensive scrolling past research profile, contacts list, and history. |
| **Evidence** | `app/page.tsx` and `app/schools/[id]/page.tsx` stack many sections with no anchor IDs or sticky nav. Header has no section links. |
| **Recommendation** | Add a sticky subnav on school profile: Overview · Contacts · Outreach · Follow-ups · Interviews. On dashboard: Schools · Contacts · Tools. Use fragment links or scroll-spy. Optional: collapse completed/history sections by default. |
| **Rep impact** | Reduces scroll hunting on profile pages; especially helpful on tablet and phone. |

---

## Priority summary

| Rank | Improvement | Priority | Primary focus |
| --- | --- | --- | --- |
| 1 | Global search (schools + contacts) | **High** | Search, fewer clicks |
| 2 | Pipeline and ownership filters | **High** | Filtering, table usability |
| 3 | Cross-account follow-up queue | **High** | Navigation, fewer clicks |
| 4 | Quick actions on schools table | **High** | Forms, fewer clicks |
| 5 | Mobile card layouts for tables | **High** | Mobile responsiveness |
| 6 | Actionable contacts table | **Medium** | Table usability, navigation |
| 7 | Rep-focused dashboard layout | **Medium** | Navigation |
| 8 | Form UX consistency | **Medium** | Forms |
| 9 | Sortable table columns | **Low** | Table usability |
| 10 | Section navigation on long pages | **Low** | Navigation, mobile |

---

## What was intentionally excluded

Per review scope, the following were **not** treated as redesign recommendations:

- Visual rebrand, color system changes, or new component library
- New CRM modules (deals, quotes, email sync)
- AI features beyond existing discovery summary heuristics
- Admin settings navigation (relevant to admins, not daily rep workflow)
- Pagination / virtual scroll — noted as a future scale concern once filters and search exist; not in top 10 for pilot size

---

## Suggested implementation order

If engineering picks up UX work in phases:

1. **Phase A (High — week 1):** Search + pipeline filters + mobile card tables  
2. **Phase B (High — week 2):** Follow-up queue + schools table quick actions  
3. **Phase C (Medium):** Contacts table links, rep-focused layout, form fixes  
4. **Phase D (Low):** Column sort, section subnav  

Re-evaluate after pilot feedback with 3–5 sales reps using the dashboard daily.

---

## References

| Document / file | Relevance |
| --- | --- |
| `app/page.tsx` | Dashboard layout, tables, pipeline |
| `app/schools/[id]/page.tsx` | School profile workflow |
| `app/layout.tsx` | Global navigation |
| `app/components/ContactForm.tsx` | Contact create/update |
| `app/components/OutreachLogForm.tsx` | Outreach logging |
| `app/components/FollowUpPanel.tsx` | Per-school follow-ups |
| `lib/supabase.ts` | Data loading, sort order |
| `docs/dashboard-ux-review.md` | This document |

---

*Documentation only. No application code was modified for this review.*
