# Catalyst CRM — Phase 2 Roadmap

**Authors:** Principal Software Architect, Product Manager, CTO  
**Status:** Planning (single source of truth — incorporates architectural review, July 3, 2026)  
**Prerequisite:** Phase 1 Security Sprint complete (Tasks 1–15)  
**Date:** July 3, 2026 (updated)

**Related documents:**
- `docs/phase-1-security-checklist.md`
- `docs/executive-reports/phase-1-executive-summary.md`
- `docs/security-reports/phase-1-risk-register.md`
- `docs/security-reports/phase-1-architecture-update.md`
- `docs/phase-2-roadmap-review.md` (architectural review — merged into this document July 3, 2026)

---

## 1. Executive Summary

Phase 1 made Catalyst CRM **pilot-ready**: authenticated, organization-scoped, auditable, and honest about data handling. Phase 2 makes it **production-ready and product-complete** for university partnership teams scaling beyond a handful of internal users.

Phase 2 is delivered in **two horizons** (not one monolithic release):

| Horizon | Name | Goal | Duration (1 FTE) | Duration (2 FTE) |
| --- | --- | --- | --- | --- |
| **A** | **Pilot Launch Track (PLT)** | Hosted first university pilot | 5–6 weeks | 3–4 weeks |
| **B** | **Scale Track (ST)** | Hardening, analytics, growth | 6–8 weeks | 4–5 weeks |

**First pilot university target:** week 5–6 (after Pilot Launch Gate), not week 12–14.

Phase 2 balances three product themes across both horizons:

1. **Trust & scale** — Close Phase 1 security gaps (database-enforced privacy, automated tests, admin tooling, MFA, production deployment).
2. **CRM depth** — Turn the prototype into a daily workflow tool (outreach logging, follow-up management, school/contact CRUD, pipeline updates).
3. **Growth surfaces** — CEO visibility, analytics, improved assistive research, and an **Ambassador Platform** for institutional champions and referral motion (Scale Track; not required for first pilot).

**Target outcome:** Support **5–15 pilot universities** with self-service onboarding, executive dashboards, and a credible security story for investor and IT due diligence—without claiming enterprise certification we have not earned.

**Estimated total duration:** 11–14 weeks (one engineer) or 7–9 weeks (two engineers), assuming tasks are implemented, tested, committed, and pushed independently as defined in Section 17.

### Public-web university research (deferred)

The scraping-based **University Research Agent is disabled in the dashboard UI**
(July 2026). It caused production timeouts and auth issues on Vercel; enrichment
will be revisited in a later **LLM/enrichment phase** (Scale Track tasks 2.21–2.23
and related).

**Code retained (not user-facing):** `lib/universityResearch.ts`,
`lib/actions/universityResearch.ts`, `app/components/UniversityResearchAgent.tsx`,
validation, rate limits, and audit actions. Do not re-enable the dashboard widget
until async jobs, domain allowlists, and LLM integration are designed.

### Delivery tracks at a glance

| Track | Tasks | Pilot gate? |
| --- | --- | --- |
| **PLT** | 2.0, 2.1–2.6, 2.9–2.14, 2.29 (smoke), 2.31–2.35, 2.38 | **Yes — Pilot Launch Gate** |
| **ST** | 2.3, 2.7–2.8, 2.15–2.30, 2.33, 2.36–2.37 | No — post-first-pilot |
| **Deferred** | 2.27 (LLM) | Phase 3 unless contract requires |

---

## 2. Product Vision

Catalyst CRM is the **operating system for university and K–12 partnership development**—from first contact through discovery, pilot interest, and partner status—while keeping institutional trust at the center.

### Vision statement

> Give partnership teams one place to track schools, people, conversations, and outcomes—with executive visibility, ambassador-led growth, and assistive tools that respect privacy and never surprise users about where data goes.

### Phase 2 user personas

| Persona | Primary needs in Phase 2 |
| --- | --- |
| **Sales / partnerships** | Log outreach, manage follow-ups, update pipeline, run research, capture interviews |
| **Admin** | Invite users, assign roles, manage org settings |
| **CEO / executive (read-only)** | Funnel metrics, trends, pilot progress—without sensitive commercial detail |
| **University observer (read-only)** | Limited visibility into partnership status with their institution |
| **Campus ambassador** | Lightweight portal: assigned schools, talking points, referral logging |
| **Engineering / ops** | Staging, monitoring, tested deploys, audit trail |

### What Phase 2 is not

- A student information system (SIS) or FERPA record store  
- A full marketing automation platform  
- A certified compliance product (SOC 2, etc.)—that is Phase 3+  
- Unrestricted multi-tenant SaaS on day one—we graduate pilots deliberately  

---

## 3. Technical Objectives

| # | Objective | Phase 1 baseline | Phase 2 target |
| --- | --- | --- | --- |
| T1 | Defense in depth for privacy | App-layer redaction | DB views / column policies for `read_only` |
| T2 | Regression safety | Manual + CI lint/build | Automated auth, RLS, redaction, SSRF tests |
| T3 | Operational identity | SQL-managed memberships | Admin UI + audited role changes |
| T4 | Production environments | Local dev + CI | Staging + production with env fail-closed |
| T5 | Code maintainability | Monolithic `lib/supabase.ts` | Domain-split modules + generated DB types |
| T6 | Observability | Console audit failures | Structured logs + error tracking hook |
| T7 | Abuse & dependency hygiene | Table rate limits; non-blocking audit | Retention jobs; blocking audit or scoped allowlist |
| T8 | Async research | Synchronous server action | Queue/job pattern for long fetches |
| T9 | API readiness | Server actions only | Optional internal JSON routes for exports/integrations |
| T10 | Security headers | Default Next.js | CSP, HSTS, session hardening |

---

## 4. Product Objectives

| # | Objective | Success indicator |
| --- | --- | --- |
| P1 | Daily CRM usability | Sales users log outreach and follow-ups without leaving Catalyst |
| P2 | Executive clarity | CEO sees funnel and trends in &lt;30 seconds |
| P3 | Ambassador motion | Ambassadors log referrals linked to schools |
| P4 | Institutional trust | Pilot MOU claims match product behavior |
| P5 | Accurate assistive labeling | Optional LLM features are opt-in and disclosed |
| P6 | Self-service access | Admins invite users without database access |
| P7 | Analytics for decisions | Stage conversion and activity trends visible by org |
| P8 | Pilot expansion | Onboard new university org in &lt;1 business day |

---

## 5. Engineering Milestones

Milestones are split by **Pilot Launch Track** and **Scale Track**. The **Pilot Launch Gate** is the critical checkpoint before the first university goes live.

### Pilot Launch Track milestones

| Milestone | Theme | Target week | Tasks | Exit criteria |
| --- | --- | --- | --- | --- |
| **MP0** | Pilot readiness docs | 1 | 2.0, 2.31, 2.5 | IT/security packet ready; README accurate |
| **M1** | Security closure | 1–2 | 2.1, 2.2, 2.38 | DB views live; CI runs unit tests |
| **M2** | Identity & admin | 2–3 | 2.6, 2.34 | Admin manages members without SQL; settings guarded |
| **M3** | CRM daily driver | 3–5 | 2.11–2.14 | Outreach, follow-ups, school/contact CRUD + per-action audit |
| **M4** | Pilot go-live | 4–6 | 2.4, 2.9, 2.10, 2.32, 2.35, 2.29 (smoke) | Production URL; monitoring; IR runbook |
| **── PLG ──** | **Pilot Launch Gate** | **6** | PLT complete | First university onboarded |

### Scale Track milestones

| Milestone | Theme | Target week | Tasks | Exit criteria |
| --- | --- | --- | --- | --- |
| **M5** | Observability & QA | 7–8 | 2.3, 2.29 (full) | RLS matrix tested; full E2E redaction |
| **M6** | Executive analytics | 8–10 | 2.18, 2.17, 2.19 | CEO v2 + glossary + funnel chart |
| **M7** | Platform hygiene | 10–12 | 2.7 (review), 2.8, 2.15, 2.16, 2.28 | Refactor; types; export; audit gap review |
| **M8** | Growth (optional) | 11–13 | 2.24–2.26, 2.33 | Ambassador MVP if prioritized; email invites |
| **M9** | Research v2 (optional) | 12–14 | 2.21–2.23, 2.22 | Async jobs if pilot proved need |
| **M10** | Phase 2 close | 14 | 2.30, 2.36–2.37 | Security ≥85; completion reports; pagination/import as scoped |

### Two-engineer parallelization (Pilot Launch Track)

| Engineer | Weeks 1–6 |
| --- | --- |
| **A (platform)** | 2.0 → 2.2 → 2.38 → 2.1 → 2.4 → 2.9 → 2.10 → 2.32 → 2.35 |
| **B (product)** | 2.31 → 2.6 → 2.34 → 2.11 → 2.12 → 2.13 → 2.14 → 2.29 (smoke) |

Converge at **Pilot Launch Gate** (week 5–6).

---

## 6. Database Enhancements

### Planned schema work

| Area | Tables / objects | Purpose |
| --- | --- | --- |
| Privacy | `interviews_public`, `follow_ups_public` views; or column grants | Enforce `read_only` at DB layer |
| Admin | `membership_invites` (optional) | Pending invitations (Task 2.33, Scale Track) |
| Audit | Triggers or expanded `audit_events` actions | Contacts, outreach, deletes, role changes |
| Analytics | `metric_snapshots` or materialized views | Weekly funnel snapshots |
| Research | `school_research_sources`, `school_program_evidence` | Provenance and confidence |
| Ambassadors | `ambassadors`, `ambassador_assignments`, `ambassador_referrals` | Ambassador program |
| Ops | `rate_limit_events` retention policy / cleanup function | Table growth control |
| Types | Supabase generated TypeScript types | Remove unsafe casts (Task 2.16, Scale Track) |

### Migration discipline

- One migration per Phase 2 task where possible  
- Timestamped files under `supabase/migrations/`  
- Rollback migration documented in task if irreversible  
- Parse/review SQL in CI when tooling available  

---

## 7. CRM Enhancements

Current state: read-heavy dashboard, interview capture, research preview, email generator. Missing daily workflow pieces.

### Phase 2 CRM scope

| Feature | Description | Priority |
| --- | --- | --- |
| **Outreach logging** | Form to record email/call/meeting with outcome | High |
| **Follow-up management** | Create, complete, reschedule follow-ups from UI | High |
| **School CRUD** | Add/edit school, update status and next step | High |
| **Contact CRUD** | Add/edit contacts on school profile | High |
| **Pipeline actions** | Status transitions with audit | Medium |
| **Bulk import** | CSV import for schools/contacts (admin only) | Medium | Task 2.37 (Scale Track) |
| **Export** | Org-scoped CSV export with audit event | Medium | Task 2.28 (Scale Track) |
| **Assignment** | `assigned_to` visible and editable on schools | Medium | Task 2.13 |
| **Notifications** | In-app overdue follow-up banner | Low | Post–Phase 2 |
| **Pagination** | Paginated schools/contacts tables | Medium | Task 2.36 (Scale Track) |

---

## 8. AI Enhancements

Phase 1 clarified that summaries are **rule-based/local** and research is **public fetch + heuristics**. Phase 2 improves assistive capabilities without breaking trust.

### Tier A — No external model (ship first)

- Improved rule-based summarization patterns  
- Research evidence scoring and source deduplication  
- Async job queue for research (better UX, same logic)  
- Domain allowlist for `.edu` and known patterns  

### Tier B — Optional model-backed (opt-in, disclosed)

- Optional LLM summary for interview notes (user triggers; data handling disclosed)  
- Optional LLM polish for outreach drafts (never auto-send)  
- Provider abstraction (`lib/ai/provider.ts`) with redaction pre-flight  
- Org-level feature flag: `assistive_llm_enabled`  

### Tier C — Future (Phase 3)

- RAG over org-scoped CRM corpus  
- Automated meeting prep briefs  

**Product rule:** Never label a feature “AI” unless the configured provider is documented and user-consented.

---

## 9. Ambassador Platform

New product surface for **campus and district champions** who refer schools, make introductions, or support pilot adoption.

### Concept

```
Organization (Catalyst customer)
  └── Ambassadors (people: staff, alumni, partner reps)
        └── Assignments (linked to schools or territories)
              └── Referrals / touchpoints (logged activity)
```

### MVP scope (Phase 2)

| Capability | Description |
| --- | --- |
| Ambassador registry | Name, email, role, status, org_id |
| School assignment | Link ambassador to one or more schools |
| Referral logging | Who referred whom, date, notes (no student PII) |
| Ambassador portal | Separate route `/ambassadors` or role `ambassador` with limited UI |
| CRM linkage | Referrals visible on school profile timeline |
| Admin management | Admin invites and deactivates ambassadors |

### Out of scope for Phase 2 MVP

- Payments / commissions  
- Mobile app  
- Public ambassador signup without admin approval  
- Social sharing integrations  

---

## 10. CEO Dashboard

Current `CeoDashboard` on `app/page.tsx` shows nine funnel metrics from live counts. Phase 2 elevates this for executive and read-only users.

### CEO Dashboard v2

| Enhancement | Description |
| --- | --- |
| **Dedicated route** | `/dashboard/ceo` or role-gated section |
| **Date range filter** | Last 7 / 30 / 90 days / quarter |
| **Trend indicators** | Up/down vs prior period |
| **Stage conversion** | Prospect → Contacted → Interviewing → Partner |
| **Drill-down links** | Metric → filtered school list |
| **Read-only optimized** | No mutation controls; redacted sensitive fields |
| **Export snapshot** | PDF or CSV summary for board meetings |
| **Goal lines** | Optional quarterly targets per metric |

### Metrics retained from v1

Schools added, emails sent, replies, interviews booked, interviews completed, pilot interest, LOIs, paid pilots—plus new **conversion rates** and **median days in stage**.

---

## 11. Analytics

### Analytics layers

| Layer | Implementation | Audience |
| --- | --- | --- |
| **Operational** | Live queries (current) | Sales daily |
| **Tactical** | Date-range aggregations in app | Sales manager |
| **Executive** | Snapshots + trends | CEO, read-only |
| **Product** | Event counts from audit log | Internal ops |

### Phase 2 analytics deliverables

- Funnel conversion chart (by stage)  
- Activity timeline (outreach + interviews per week)  
- Top schools by engagement score (heuristic)  
- Ambassador referral count by month  
- Optional `metric_snapshots` table for historical comparison  

### Privacy

- Analytics respect org boundaries (RLS)  
- Read-only users see aggregated metrics, not restricted note fields  
- Export events audited  

---

## 12. Testing Strategy

### Test pyramid for Phase 2

```
                    ┌─────────────┐
                    │  E2E (few)  │  Playwright: auth, roles, redaction
                    ├─────────────┤
                    │ Integration │  Supabase local: RLS matrix
                    ├─────────────┤
                    │   Unit      │  safeFetch, validation, authz, metrics
                    └─────────────┘
```

### Required test coverage by milestone

| Milestone | Tests added |
| --- | --- |
| M1 | RLS redaction views; auth middleware; `shouldRedactRestrictedFields` | 2.1, 2.2 |
| M2 | Admin role change audit; settings route guard | 2.6, 2.34 |
| M3 | Outreach/follow-up server actions; validation; per-action audit | 2.11–2.14 |
| M4 | CEO metric calculations; date filters | 2.17, 2.18 |
| M5 | Research job status; source normalization | 2.21, 2.22 |
| M6 | Ambassador referral CRUD | 2.24–2.26 |
| M7 | Smoke suite against staging URL | 2.29 |

### CI evolution

Extend `.github/workflows/ci.yml`:

- `npm run test` (Vitest or Jest)  
- Optional `npm run test:e2e` on main branch nightly  
- SQL migration lint when tooling available  
- Re-evaluate blocking `npm audit` with allowlist expiry (Task 2.38)  

---

## 13. Deployment Strategy

### Environments

| Environment | Purpose | Supabase | Sample data |
| --- | --- | --- | --- |
| **Local** | Development | Dev project or local | Allowed |
| **Staging** | Pilot pre-prod | Staging project | Disabled |
| **Production** | Live pilots | Production project | Disabled |

### Deployment target

Recommended: **Vercel** (Next.js native) + **Supabase Cloud** (managed Postgres/Auth).

### Phase 2 deployment tasks

1. Staging Supabase project + env vars in Vercel preview (Task 2.9)  
2. Production Supabase project + protected env vars (Task 2.10)  
3. `NODE_ENV=production` fail-closed if Supabase missing (Task 2.4)  
4. Custom domain + HTTPS  
5. Supabase Auth redirect URLs for staging and production  
6. Database migration apply runbook (ordered migrations)  
7. Rollback runbook (revert deploy + forward-fix migration)  
8. Error monitoring on staging/production (Task 2.32)  
9. Incident response runbook (Task 2.35)  

### Release cadence

- **Continuous:** merge to `main` → staging auto-deploy  
- **Weekly or bi-weekly:** production promote after smoke tests  
- **Pilot onboarding:** checklist per new university org  

---

## 14. Success Metrics

### Security & platform

| Metric | Phase 1 | Phase 2 target |
| --- | --- | --- |
| Security score | 74 / 100 | ≥ 85 / 100 |
| Production readiness | Not met | Met for defined pilot scope |
| Automated security tests | 0 | ≥ 20 cases |
| Mean time to onboard user | Manual SQL (~hours) | Admin UI (&lt;15 min) |
| CI blocking steps | lint, build | lint, build, test |

### Product & business

| Metric | Phase 2 target |
| --- | --- |
| Pilot universities live | 3–5 (first at week 5–6 after PLG) |
| Weekly active sales users | ≥ 80% of licensed seats |
| Outreach records logged in CRM | ≥ 50% of touchpoints (self-reported baseline) |
| CEO dashboard weekly views | ≥ 1 per executive seat |
| Ambassador referrals logged | ≥ 10 in pilot period (if Ambassador ST shipped) |
| Incident count (data breach) | 0 |

### Engineering health

| Metric | Target |
| --- | --- |
| Build pass rate on `main` | ≥ 95% |
| P1 open security risks | 0 at Phase 2 close |
| P2 open security risks | ≤ 3 with owners |
| PostCSS / audit exception | Resolved or documented with expiry date |

---

## 15. Phase 2 Timeline

Indicative schedule for **one full-time engineer** (adjust proportionally for team size).

### Pilot Launch Track (weeks 1–6)

```
Week  1     ████      MP0 Pilot docs (2.0, 2.31, 2.5)
Week  1–2   ████████  M1 Security (2.1, 2.2, 2.38)
Week  2–3   ██████    M2 Admin (2.6, 2.34)
Week  3–5   ████████  M3 CRM (2.11–2.14)
Week  4–6   ████████  M4 Go-live (2.4, 2.9, 2.10, 2.32, 2.35, 2.29 smoke)
Week  6     ─── PLG ───  First university pilot
```

### Scale Track (weeks 7–14)

```
Week  7–8   ██████    M5 QA (2.3, 2.29 full)
Week  8–10  ██████    M6 CEO analytics (2.18, 2.17, 2.19)
Week 10–12  ████████  M7 Platform (2.7, 2.8, 2.15, 2.16, 2.28)
Week 11–13  ██████    M8 Ambassador (2.24–2.26, 2.33) — optional
Week 12–14  ██████    M9 Research v2 (2.21–2.23, 2.22) — if needed
Week 14     ████      M10 Close (2.30, 2.36–2.37)
```

### Duration summary

| Team size | Pilot Launch Track | Scale Track | Total |
| --- | --- | --- | --- |
| 1 FTE | 5–6 weeks | 6–8 weeks | 11–14 weeks |
| 2 FTE | 3–4 weeks | 4–5 weeks | 7–9 weeks |

---

## 16. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| P2-R1 | Scope creep into full SaaS | High | High | Strict task boundaries; MVP per section |
| P2-R2 | DB view redaction breaks writers | Medium | High | Separate views for read_only; test matrix |
| P2-R3 | Ambassador platform delays CRM core | Medium | Medium | Ambassador in Scale Track only; CRM 2.11–2.14 in PLT |
| P2-R4 | LLM feature triggers legal review delay | Medium | High | Tier B opt-in after Tier A; legal sign-off gate |
| P2-R5 | Staging/prod env drift | Medium | Medium | IaC checklist; same migration order |
| P2-R6 | Pilot university IT blocks deployment | Medium | High | Task 2.0 pilot IT/security packet + Phase 1 reports |
| P2-R7 | No dedicated QA | High | Medium | Automated tests required per task |
| P2-R8 | Metric definitions disagree with CEO | Medium | Medium | Task 2.18 metric glossary |
| P2-R9 | Research job infrastructure complexity | Medium | Medium | Start with DB-backed job table, not Redis |
| P2-R10 | PostCSS/Next advisory persists | High | Low | Task 2.38 allowlist with expiry |

---

## 17. Implementation Tasks & Order

Phase 2 tasks are numbered **2.0–2.38**. Each task is designed to be **implemented, tested, committed, and pushed independently**, following the Phase 1 checklist pattern.

**Track legend:**

| Track | Meaning |
| --- | --- |
| **PLT** | Pilot Launch Track — required for Pilot Launch Gate |
| **ST** | Scale Track — post-first-pilot hardening and growth |
| **P4** | Defer to Phase 3 unless contract requires |

**Effort legend:** S = 0.5–1.5 days · M = 2–4 days · L = 5–8 days (one engineer)

**Convention per task:**
- Track and effort  
- Exact files to edit  
- What will change  
- How to test it  
- Rollback plan  
- Git commit message  

### Task index

| Task | Name | Track | Effort | Priority |
| --- | --- | --- | --- | --- |
| 2.0 | Pilot onboarding & IT packet | PLT | S | P0 |
| 2.1 | DB read-only views | PLT | L | P0 |
| 2.2 | Security unit tests + CI | PLT | M | P1 |
| 2.3 | RLS matrix tests | ST | L | P2 |
| 2.4 | Fail closed in production | PLT | S | P0 |
| 2.5 | MFA & session docs | PLT | S | P1 |
| 2.6 | Admin membership UI | PLT | M | P0 |
| 2.7 | Audit gap review | ST | S | P2 |
| 2.8 | Rate limit retention | ST | S | P4 |
| 2.9 | Staging deploy runbook | PLT | M | P0 |
| 2.10 | Production + headers | PLT | M | P0 |
| 2.11 | Outreach logging | PLT | M | P1 |
| 2.12 | Follow-up management | PLT | M | P1 |
| 2.13 | School CRUD | PLT | M | P1 |
| 2.14 | Contact CRUD | PLT | S | P1 |
| 2.15 | Domain module split | ST | L | P3 |
| 2.16 | Generated DB types | ST | M | P3 |
| 2.17 | CEO dashboard v2 | ST | M | P2 |
| 2.18 | Metric glossary | ST | S | P2 |
| 2.19 | Funnel conversion chart | ST | M | P3 |
| 2.20 | Weekly metric snapshots | ST | M | P4 |
| 2.21 | Research sources schema | ST | M | P4 |
| 2.22 | Async research jobs | ST | L | P4 |
| 2.23 | Research domain allowlist | ST | S | P4 |
| 2.24 | Ambassador schema | ST | L | P3 |
| 2.25 | Ambassador admin UI | ST | M | P3 |
| 2.26 | Ambassador portal | ST | M | P3 |
| 2.27 | Opt-in LLM assistive | P4 | L | P4 |
| 2.28 | CSV export | ST | M | P3 |
| 2.29 | E2E Playwright | PLT/ST | M | P1/P2 |
| 2.30 | Phase 2 close docs | ST | S | P2 |
| 2.31 | Documentation sync | PLT | S | P1 |
| 2.32 | Error monitoring | PLT | S | P1 |
| 2.33 | Email invite flow | ST | M | P3 |
| 2.34 | Settings middleware | PLT | S | P1 |
| 2.35 | Incident runbook | PLT | S | P1 |
| 2.36 | Pagination | ST | M | P4 |
| 2.37 | Bulk CSV import | ST | L | P4 |
| 2.38 | Audit allowlist expiry | PLT | S | P1 |

---

### Phase 2 Task 2.0: Pilot onboarding & IT security packet

- **Track:** PLT · **Effort:** S · **Priority:** P0
- **Exact files to edit:**
  - New: `docs/pilot-onboarding-checklist.md`
  - New: `docs/pilot-it-security-packet.md`
  - `docs/executive-reports/phase-1-executive-summary.md` (link/reference only)
- **What will change:**
  - Pilot MOU technical appendix template.
  - Role matrix (sales, admin, read_only) and onboarding steps.
  - Environment checklist (Supabase, Vercel, redirect URLs).
  - One-page security summary for university IT reviewers.
- **How to test it:**
  - Leadership review; dry-run onboarding checklist.
- **Rollback plan:** N/A (docs).
- **Git commit message:** `Add pilot onboarding and IT security packet`

---

### Phase 2 Task 2.1: Database-enforced read-only views

- **Track:** PLT · **Effort:** L · **Priority:** P0
- **Exact files to edit:**
  - New migration: `supabase/migrations/<timestamp>_add_readonly_safe_views.sql`
  - `lib/supabase.ts`
  - `docs/supabase-rls-audit.md`
- **What will change:**
  - Create views (e.g. `interviews_readonly`, `follow_ups_readonly`) that null or omit restricted columns.
  - Route `read_only` queries through views; writers keep base tables.
- **How to test it:**
  - RLS integration test: `read_only` SELECT on view returns no raw_notes/budget/objections.
  - `sales` still reads full table.
  - `npm run lint` && `npm run build`
- **Rollback plan:** Revert migration; restore app-only redaction.
- **Git commit message:** `Add database views for read-only field privacy`

---

### Phase 2 Task 2.2: Security integration test harness

- **Track:** PLT · **Effort:** M · **Priority:** P1
- **Depends on:** — (pair with 2.38)
- **Exact files to edit:**
  - `package.json` (add test runner)
  - New: `vitest.config.ts` or `jest.config.ts`
  - New: `tests/authz/redaction.test.ts`
  - New: `tests/safeFetch/ssrf.test.ts`
  - `.github/workflows/ci.yml`
- **What will change:**
  - Unit tests for `shouldRedactRestrictedFields`, `assertSafeHttpsUrl`, validation schemas.
  - CI runs `npm run test`.
- **How to test it:**
  - `npm run test` locally; CI green.
- **Rollback plan:** Revert test commit; remove CI test step.
- **Git commit message:** `Add security unit tests and CI test step`

---

### Phase 2 Task 2.3: Supabase RLS matrix tests

- **Track:** ST · **Effort:** L · **Priority:** P2
- **Depends on:** 2.1, 2.2
- **Exact files to edit:**
  - New: `tests/rls/README.md` (procedures)
  - New: `tests/rls/rls-matrix.test.ts` (against local Supabase or skipped in CI without secrets)
  - `.github/workflows/ci.yml` (optional scheduled job)
- **What will change:**
  - Documented test users Org A / Org B for each role.
  - Automated or scripted assertions for SELECT/INSERT/UPDATE/DELETE matrix.
- **How to test it:**
  - Run against local Supabase; document results in `phase-2-testing-log.md`.
- **Rollback plan:** Remove test files; keep manual matrix doc.
- **Git commit message:** `Add RLS role matrix tests`

---

### Phase 2 Task 2.4: Fail closed without Supabase in production

- **Track:** PLT · **Effort:** S · **Priority:** P0
- **Depends on:** 2.9 (before 2.10)
- **Exact files to edit:**
  - `lib/supabaseServer.ts`
  - `lib/supabase.ts`
  - `README.md`
- **What will change:**
  - Sample data fallback only when `NODE_ENV === 'development'`.
  - Staging/production throw clear configuration error if env vars missing.
- **How to test it:**
  - `NODE_ENV=production` without env → error page, not sample data.
  - Development still shows samples.
- **Rollback plan:** Revert env guard.
- **Git commit message:** `Disable sample data fallback in production`

---

### Phase 2 Task 2.5: MFA and session hardening documentation + Auth config

- **Track:** PLT · **Effort:** S · **Priority:** P1
- **Exact files to edit:**
  - `README.md`
  - New: `docs/auth-hardening.md`
  - `middleware.ts` (session refresh only if needed)
- **What will change:**
  - Document Supabase MFA enrollment for admin/sales.
  - Document session timeout recommendations.
  - No breaking auth changes without explicit enablement.
- **How to test it:**
  - Manual MFA enroll on staging user.
- **Rollback plan:** Doc-only revert.
- **Git commit message:** `Document MFA and session hardening`

---

### Phase 2 Task 2.6: Admin membership management UI

- **Track:** PLT · **Effort:** M · **Priority:** P0
- **Depends on:** 2.34 (recommended)
- **Exact files to edit:**
  - New: `app/settings/members/page.tsx`
  - New: `lib/actions/memberships.ts`
  - `lib/authz.ts`
  - `lib/auditLog.ts`
- **What will change:**
  - Admin/super_admin lists members, changes roles, removes members.
  - Audit event: `membership.role_change`, `membership.remove`.
- **How to test it:**
  - Admin changes sales → read_only; audit row created.
  - Non-admin denied.
- **Rollback plan:** Revert UI; manual SQL membership.
- **Git commit message:** `Add admin membership management`

---

### Phase 2 Task 2.7: Audit coverage review

- **Track:** ST · **Effort:** S · **Priority:** P2
- **Depends on:** 2.11–2.14 (audit added incrementally in each CRM task)
- **Exact files to edit:**
  - `lib/auditLog.ts`
  - `docs/security-reports/phase-1-change-log.md` (audit action reference)
- **What will change:**
  - **Not a monolithic pre-CRM task.** Tasks 2.11–2.14 each call `recordAuditEvent` for their mutation (`outreach.create`, `follow_up.complete`, `school.update`, `contact.create`).
  - Task 2.7 is a **gap review** after PLT: verify all CRM mutations audit; add `school.delete` if implemented; document `AUDIT_ACTIONS` enum.
  - Membership audit events remain in 2.6 (`membership.role_change`, `membership.remove`).
- **How to test it:**
  - Checklist: every PLT mutation produces metadata-only audit row.
- **Rollback plan:** Stop calling `recordAuditEvent` on new paths.
- **Git commit message:** `Review and complete audit coverage for CRM mutations`

---

### Phase 2 Task 2.8: Rate limit retention cleanup

- **Track:** ST · **Effort:** S · **Priority:** P4
- **Exact files to edit:**
  - New migration: `supabase/migrations/<timestamp>_rate_limit_retention.sql`
  - New: `lib/jobs/cleanupRateLimits.ts` (or SQL cron via Supabase)
- **What will change:**
  - Delete `rate_limit_events` older than 30 days.
- **How to test it:**
  - Insert old rows; run cleanup; confirm deletion.
- **Rollback plan:** Disable cron/job.
- **Git commit message:** `Add rate limit event retention`

---

### Phase 2 Task 2.9: Staging deployment pipeline

- **Track:** PLT · **Effort:** M · **Priority:** P0
- **Exact files to edit:**
  - New: `docs/deployment-runbook.md`
  - Vercel project settings (documented)
  - `.github/workflows/ci.yml` (optional deploy workflow)
- **What will change:**
  - Staging URL documented; env vars mapped; preview deploys on PR.
- **How to test it:**
  - PR opens → staging preview loads `/login`.
- **Rollback plan:** Disable preview deploys.
- **Git commit message:** `Add staging deployment runbook`

---

### Phase 2 Task 2.10: Production deployment and security headers

- **Track:** PLT · **Effort:** M · **Priority:** P0
- **Depends on:** 2.4, 2.9
- **Exact files to edit:**
  - `next.config.ts`
  - `docs/deployment-runbook.md`
  - New migration apply checklist
- **What will change:**
  - Security headers (HSTS, X-Frame-Options, Referrer-Policy, basic CSP).
  - Production promote procedure.
- **How to test it:**
  - securityheaders.com scan on staging; smoke test production.
- **Rollback plan:** Revert header config.
- **Git commit message:** `Add production deploy config and security headers`

---

### Phase 2 Task 2.11: Outreach logging server action and form

- **Track:** PLT · **Effort:** M · **Priority:** P1
- **Exact files to edit:**
  - New: `app/components/OutreachLogForm.tsx`
  - New: `lib/actions/outreach.ts`
  - `lib/validation.ts`
  - `lib/auditLog.ts`
  - `app/schools/[id]/page.tsx` or dashboard
- **What will change:**
  - Sales+ can log channel, subject, outcome, date, next step on a school.
  - Validated inputs; org + role guards.
  - **Audit:** `recordAuditEvent` with action `outreach.create`.
- **How to test it:**
  - Sales logs outreach; appears on school profile; read_only cannot submit.
- **Rollback plan:** Revert form and action.
- **Git commit message:** `Add outreach logging workflow`

---

### Phase 2 Task 2.12: Follow-up create and complete actions

- **Track:** PLT · **Effort:** M · **Priority:** P1
- **Exact files to edit:**
  - New: `app/components/FollowUpPanel.tsx`
  - New: `lib/actions/followUps.ts`
  - `lib/validation.ts`
  - `lib/auditLog.ts`
  - `app/schools/[id]/page.tsx`
- **What will change:**
  - Create follow-up with due date; mark Done; updates `completed_at`.
  - **Audit:** `recordAuditEvent` with action `follow_up.complete` (and create if separate).
- **How to test it:**
  - Follow-up lifecycle on school profile; audit row created.
- **Rollback plan:** Revert components.
- **Git commit message:** `Add follow-up management actions`

---

### Phase 2 Task 2.13: School create and update

- **Track:** PLT · **Effort:** M · **Priority:** P1
- **Exact files to edit:**
  - New: `app/components/SchoolForm.tsx`
  - New: `lib/actions/schools.ts`
  - `lib/validation.ts`
  - `lib/auditLog.ts`
  - `app/page.tsx`
- **What will change:**
  - Admin/sales can add school and update status, owner, next_step, assigned_to.
  - Status transition validation.
  - **Audit:** `recordAuditEvent` with action `school.update` / `school.create`.
- **How to test it:**
  - New school in pipeline; status change reflected in CEO metrics.
- **Rollback plan:** Revert school form.
- **Git commit message:** `Add school create and update actions`

---

### Phase 2 Task 2.14: Contact create and update

- **Track:** PLT · **Effort:** S · **Priority:** P1
- **Exact files to edit:**
  - New: `app/components/ContactForm.tsx`
  - New: `lib/actions/contacts.ts`
  - `lib/validation.ts`
  - `lib/auditLog.ts`
  - `app/schools/[id]/page.tsx`
- **What will change:**
  - Add/edit contacts with email format validation.
  - **Audit:** `recordAuditEvent` with action `contact.create` / `contact.update`.
- **How to test it:**
  - Contact appears on profile; cross-org denied.
- **Rollback plan:** Revert contact form.
- **Git commit message:** `Add contact create and update actions`

---

### Phase 2 Task 2.15: Split lib/supabase.ts into domain modules

- **Track:** ST · **Effort:** L · **Priority:** P3
- **Depends on:** 2.11–2.14 (CRM actions stable)
- **Exact files to edit:**
  - New: `lib/db/client.ts`, `lib/db/types.ts`
  - New: `lib/db/queries/schools.ts`, `interviews.ts`, `dashboard.ts`
  - `lib/supabase.ts` (re-export barrel or deprecate gradually)
- **What will change:**
  - Separate queries, types, and sample data; no behavior change.
- **How to test it:**
  - `npm run lint` && `npm run build`; manual dashboard smoke.
- **Rollback plan:** Revert file split.
- **Git commit message:** `Refactor supabase data layer into domain modules`

---

### Phase 2 Task 2.16: Generated Supabase TypeScript types

- **Track:** ST · **Effort:** M · **Priority:** P3
- **Depends on:** 2.15 (recommended)
- **Exact files to edit:**
  - `package.json` (supabase gen types script)
  - New: `lib/db/database.types.ts`
  - Query files using generated types
- **What will change:**
  - Replace broad `as` casts with generated row types.
- **How to test it:**
  - `npm run build`; type errors fail CI.
- **Rollback plan:** Revert generated types.
- **Git commit message:** `Add generated Supabase database types`

---

### Phase 2 Task 2.17: CEO dashboard v2 with date range

- **Track:** ST · **Effort:** M · **Priority:** P2
- **Depends on:** 2.11–2.14, 2.18
- **Note:** CEO dashboard v1 on home page is **acceptable for first pilot**; this task is Scale Track.
- **Exact files to edit:**
  - New: `app/dashboard/ceo/page.tsx`
  - New: `app/components/CeoDashboardV2.tsx`
  - `lib/db/queries/metrics.ts`
  - `lib/authz.ts` (read_only allowed)
- **What will change:**
  - Dedicated CEO route; date filter; trend vs prior period.
- **How to test it:**
  - CEO metrics change when outreach logged in range.
  - read_only can view; cannot mutate.
- **Rollback plan:** Revert to inline CeoDashboard on home page.
- **Git commit message:** `Add CEO dashboard v2 with date filters`

---

### Phase 2 Task 2.18: Metric glossary and definitions

- **Track:** ST · **Effort:** S · **Priority:** P2
- **Exact files to edit:**
  - New: `docs/metric-glossary.md`
  - `app/components/CeoDashboardV2.tsx` (tooltips)
- **What will change:**
  - Document how each CEO metric is calculated.
  - UI tooltips link to glossary.
- **How to test it:**
  - Product review with CEO; definitions match queries.
- **Rollback plan:** Doc-only revert.
- **Git commit message:** `Add CEO metric glossary`

---

### Phase 2 Task 2.19: Funnel conversion analytics

- **Track:** ST · **Effort:** M · **Priority:** P3
- **Depends on:** 2.17
- **Exact files to edit:**
  - New: `app/components/FunnelChart.tsx`
  - `lib/db/queries/metrics.ts`
  - `app/dashboard/ceo/page.tsx`
- **What will change:**
  - Stage conversion rates and counts visualization.
- **How to test it:**
  - Move test school through stages; conversion updates.
- **Rollback plan:** Remove chart component.
- **Git commit message:** `Add funnel conversion analytics`

---

### Phase 2 Task 2.20: Weekly metric snapshots

- **Track:** ST · **Effort:** M · **Priority:** P4
- **Depends on:** 2.17
- **Exact files to edit:**
  - New migration: `supabase/migrations/<timestamp>_add_metric_snapshots.sql`
  - New: `lib/jobs/snapshotMetrics.ts`
  - `lib/db/queries/metrics.ts`
- **What will change:**
  - Weekly cron inserts org-level metric snapshot for trend comparison.
- **How to test it:**
  - Run job manually; snapshot row created.
- **Rollback plan:** Stop cron; table remains.
- **Git commit message:** `Add weekly metric snapshots`

---

### Phase 2 Task 2.21: Normalize research sources schema

- **Track:** ST · **Effort:** M · **Priority:** P4
- **Exact files to edit:**
  - New migration: `supabase/migrations/<timestamp>_add_research_sources.sql`
  - `lib/universityResearch.ts`
  - `app/schools/[id]/page.tsx`
- **What will change:**
  - `school_research_sources` table with url, field, confidence, fetched_at.
  - Migrate from `profile_sources` array gradually.
- **How to test it:**
  - Research run populates sources table; profile displays provenance.
- **Rollback plan:** Keep array field as fallback.
- **Git commit message:** `Normalize university research sources`

---

### Phase 2 Task 2.22: Async research job queue

- **Track:** ST · **Effort:** L · **Priority:** P4
- **Depends on:** 2.21 (soft); defer until pilot proves timeout need
- **Exact files to edit:**
  - New migration: `supabase/migrations/<timestamp>_add_research_jobs.sql`
  - `lib/universityResearch.ts`
  - `app/components/UniversityResearchAgent.tsx`
- **What will change:**
  - Research returns job id; poll status; results persist when complete.
  - Reduces request timeout risk.
- **How to test it:**
  - Run agent; UI shows progress; completed job writes school profile.
- **Rollback plan:** Revert to synchronous path.
- **Git commit message:** `Add async university research jobs`

---

### Phase 2 Task 2.23: Research domain allowlist

- **Track:** ST · **Effort:** S · **Priority:** P4
- **Exact files to edit:**
  - `lib/safeFetch.ts`
  - `lib/validation.ts`
  - `docs/security-audit.md`
- **What will change:**
  - Optional allowlist patterns for `.edu` and user-supplied domains.
  - Block unknown TLDs for research unless admin override.
- **How to test it:**
  - `.edu` passes; random domain blocked unless allowlisted.
- **Rollback plan:** Revert allowlist; keep IP blocks only.
- **Git commit message:** `Add research domain allowlist`

---

### Phase 2 Task 2.24: Ambassador schema and RLS

- **Track:** ST · **Effort:** L · **Priority:** P3
- **Note:** Not required for Pilot Launch Gate unless pilot contract requires ambassadors.
- **Exact files to edit:**
  - New migration: `supabase/migrations/<timestamp>_add_ambassador_platform.sql`
  - `lib/authz.ts`
  - `docs/supabase-rls-audit.md`
- **What will change:**
  - Tables: `ambassadors`, `ambassador_assignments`, `ambassador_referrals`.
  - RLS org-scoped; ambassador role can read/write own referrals only.
- **How to test it:**
  - Apply migration; RLS matrix for ambassador role.
- **Rollback plan:** Revert migration before production.
- **Git commit message:** `Add ambassador platform schema`

---

### Phase 2 Task 2.25: Ambassador admin management UI

- **Track:** ST · **Effort:** M · **Priority:** P3
- **Depends on:** 2.24
- **Exact files to edit:**
  - New: `app/settings/ambassadors/page.tsx`
  - New: `lib/actions/ambassadors.ts`
  - `lib/validation.ts`
- **What will change:**
  - Admin creates ambassador, assigns schools, deactivates.
- **How to test it:**
  - Ambassador appears in registry; assignment links to school.
- **Rollback plan:** Revert admin UI.
- **Git commit message:** `Add ambassador admin management`

---

### Phase 2 Task 2.26: Ambassador portal and referral logging

- **Track:** ST · **Effort:** M · **Priority:** P3
- **Depends on:** 2.24, 2.25
- **Exact files to edit:**
  - New: `app/ambassadors/page.tsx`
  - New: `app/components/AmbassadorReferralForm.tsx`
  - New: `lib/actions/ambassadorReferrals.ts`
  - `app/schools/[id]/page.tsx` (referral timeline)
- **What will change:**
  - Ambassador logs referral with date and notes (PII warning reused).
  - Referrals visible on school profile.
- **How to test it:**
  - Ambassador user logs referral; sales sees on school timeline.
- **Rollback plan:** Revert portal routes.
- **Git commit message:** `Add ambassador portal and referral logging`

---

### Phase 2 Task 2.27: Optional LLM assistive provider (opt-in)

- **Track:** P4 (defer Phase 3) · **Effort:** L · **Priority:** P4
- **Note:** Requires legal review and data processing disclosure. Not in Pilot Launch or Scale Track critical path.
- **Exact files to edit:**
  - New: `lib/ai/provider.ts`
  - New: `lib/ai/summarize.ts`
  - `app/components/DiscoveryInterviewForm.tsx`
  - `README.md`
  - Org feature flag in DB or env
- **What will change:**
  - Optional “Enhance with AI” uses configured provider when `ASSISTIVE_LLM_ENABLED=true`.
  - Clear consent copy; fallback to rule-based summary.
- **How to test it:**
  - Flag off → rule-based only; flag on → provider called with redacted payload policy.
- **Rollback plan:** Disable env flag.
- **Git commit message:** `Add opt-in LLM assistive summaries`

---

### Phase 2 Task 2.28: Org-scoped CSV export with audit

- **Track:** ST · **Effort:** M · **Priority:** P3
- **Exact files to edit:**
  - New: `app/settings/export/page.tsx`
  - New: `lib/actions/export.ts`
  - `lib/auditLog.ts`
- **What will change:**
  - Admin exports schools/contacts CSV; audit `export.csv`.
  - Excludes restricted fields for read_only exports (denied entirely).
- **How to test it:**
  - Export downloads; audit row created.
- **Rollback plan:** Remove export route.
- **Git commit message:** `Add audited org CSV export`

---

### Phase 2 Task 2.29: E2E smoke tests (Playwright)

- **Track:** PLT (smoke) + ST (full) · **Effort:** M · **Priority:** P1 (smoke) / P2 (full)
- **Depends on:** 2.9 (staging); 2.1 (full redaction tests)
- **Exact files to edit:**
  - `package.json`
  - New: `playwright.config.ts`
  - New: `e2e/auth.spec.ts`, `e2e/redaction.spec.ts`
  - `.github/workflows/ci.yml`
- **What will change:**
  - **PLT subset (after 2.9):** login, dashboard load — run against staging before Pilot Launch Gate.
  - **ST full suite:** read_only redaction on school profile; role-based flows.
- **How to test it:**
  - `npm run test:e2e` against staging.
- **Rollback plan:** Remove Playwright; keep unit tests.
- **Git commit message:** `Add Playwright E2E smoke tests`

---

### Phase 2 Task 2.30: Phase 2 completion reports

- **Track:** ST · **Effort:** S · **Priority:** P2
- **Depends on:** Scale Track milestones substantially complete
- **Exact files to edit:**
  - New: `docs/security-reports/phase-2-security-completion-report.md`
  - New: `docs/executive-reports/phase-2-executive-summary.md`
  - Update `README.md` if needed
- **What will change:**
  - Documentation-only **Phase 2 closure** artifacts (not pilot onboarding — see 2.0).
  - Security score assessment; updated risk register.
- **How to test it:**
  - Leadership review; legal optional review.
- **Rollback plan:** N/A (docs).
- **Git commit message:** `Add Phase 2 completion reports`

---

### Phase 2 Task 2.31: Documentation sync pass

- **Track:** PLT · **Effort:** S · **Priority:** P1
- **Exact files to edit:**
  - `README.md`
  - `docs/supabase-rls-audit.md` (stale gap list)
  - `docs/security-audit.md` (pre-Phase 1 findings marked historical)
- **What will change:**
  - Fix README: dashboard routes **are** protected (Phase 1 Task 3).
  - Align audit docs with Phase 1 completion state.
  - Link to `docs/phase-2-roadmap.md` as implementation source of truth.
- **How to test it:**
  - Manual review; no contradictory security claims.
- **Rollback plan:** Revert doc commit.
- **Git commit message:** `Sync documentation with Phase 1 and Phase 2 roadmap`

---

### Phase 2 Task 2.32: Error monitoring integration

- **Track:** PLT · **Effort:** S · **Priority:** P1
- **Depends on:** 2.9 (staging), 2.10 (production)
- **Exact files to edit:**
  - `package.json` (optional SDK)
  - New: `lib/monitoring.ts` or `instrumentation.ts`
  - `docs/deployment-runbook.md`
- **What will change:**
  - Hook Sentry or equivalent for staging and production.
  - Document DSN env vars; no PII in error payloads.
- **How to test it:**
  - Trigger test error on staging; event appears in dashboard.
- **Rollback plan:** Remove SDK; disable env var.
- **Git commit message:** `Add error monitoring for staging and production`

---

### Phase 2 Task 2.33: Membership email invite flow

- **Track:** ST · **Effort:** M · **Priority:** P3
- **Depends on:** 2.6
- **Exact files to edit:**
  - New migration: `supabase/migrations/<timestamp>_add_membership_invites.sql` (optional)
  - New: `lib/actions/invites.ts`
  - `app/settings/members/page.tsx`
- **What will change:**
  - Admin sends email invite; pending invite row; accept flow links to Supabase Auth.
  - **Note:** Manual SQL membership (2.6) is acceptable for first pilot.
- **How to test it:**
  - Invite email received; user completes signup and receives role.
- **Rollback plan:** Revert invite UI; use 2.6 manual add only.
- **Git commit message:** `Add membership email invite flow`

---

### Phase 2 Task 2.34: Middleware guards for settings routes

- **Track:** PLT · **Effort:** S · **Priority:** P1
- **Depends on:** — (before or with 2.6)
- **Exact files to edit:**
  - `middleware.ts`
  - `lib/authz.ts`
- **What will change:**
  - `/settings/*` requires authenticated `admin` or `super_admin`.
  - Non-admin users redirected or receive 403.
- **How to test it:**
  - Sales user cannot access `/settings/members`.
  - Admin can access.
- **Rollback plan:** Revert middleware matcher/guard.
- **Git commit message:** `Protect settings routes for admin roles`

---

### Phase 2 Task 2.35: Incident response runbook

- **Track:** PLT · **Effort:** S · **Priority:** P1
- **Depends on:** 2.10
- **Exact files to edit:**
  - New: `docs/incident-response-runbook.md`
  - `docs/deployment-runbook.md` (link)
- **What will change:**
  - Contact tree, severity levels, Supabase/Vercel rollback steps.
  - Audit log query procedures; communication templates.
- **How to test it:**
  - Tabletop walkthrough with leadership.
- **Rollback plan:** N/A (docs).
- **Git commit message:** `Add incident response runbook`

---

### Phase 2 Task 2.36: Pagination for schools and contacts

- **Track:** ST · **Effort:** M · **Priority:** P4
- **Exact files to edit:**
  - `lib/db/queries/schools.ts` or `lib/supabase.ts`
  - `app/page.tsx`
  - `app/components/` table components
- **What will change:**
  - Server-side pagination (e.g. 25 rows) for schools and contacts tables.
- **How to test it:**
  - Large seed dataset; pages navigate correctly; RLS still scoped.
- **Rollback plan:** Revert pagination; load all rows.
- **Git commit message:** `Add pagination for schools and contacts`

---

### Phase 2 Task 2.37: Admin bulk CSV import

- **Track:** ST · **Effort:** L · **Priority:** P4
- **Exact files to edit:**
  - New: `app/settings/import/page.tsx`
  - New: `lib/actions/import.ts`
  - `lib/validation.ts`
  - `lib/auditLog.ts`
- **What will change:**
  - Admin uploads CSV for schools/contacts; validated rows; audit `import.csv`.
- **How to test it:**
  - Valid CSV imports; invalid rows rejected with errors.
- **Rollback plan:** Remove import route.
- **Git commit message:** `Add admin bulk CSV import`

---

### Phase 2 Task 2.38: Dependency audit allowlist with expiry

- **Track:** PLT · **Effort:** S · **Priority:** P1
- **Pair with:** 2.2
- **Exact files to edit:**
  - `.github/workflows/ci.yml`
  - New: `docs/dependency-audit-exceptions.md`
- **What will change:**
  - Document PostCSS GHSA-qx2v-qp2m-jg93 exception with review expiry date.
  - Optional: `npm audit` allowlist script; plan to re-enable blocking when Next bundles patched PostCSS.
- **How to test it:**
  - CI audit step runs; exception documented; expiry visible.
- **Rollback plan:** Revert allowlist doc only.
- **Git commit message:** `Document npm audit allowlist with expiry`

---

## 18. Recommended implementation order

Execute tasks in this order. **Pilot Launch Gate** occurs after the PLT sequence; Scale Track follows first pilot.

### Pilot Launch Track (weeks 1–6)

```
2.0   Pilot onboarding & IT security packet
2.2   Security unit tests + CI (+ 2.38 audit allowlist)
2.1   Database read-only views
2.31  Documentation sync
2.6   Admin membership management
2.34  Middleware guards for /settings/*
2.4   Fail closed without Supabase in production
2.5   MFA & session hardening docs
2.9   Staging deployment runbook
2.32  Error monitoring (staging)
2.29  E2E smoke subset (login + dashboard)
2.11  Outreach logging (+ audit)
2.12  Follow-up management (+ audit)
2.13  School create/update (+ audit)
2.14  Contact create/update (+ audit)
2.35  Incident response runbook
2.10  Production deploy + security headers
2.32  Error monitoring (production)
─── PILOT LAUNCH GATE ───
```

### Scale Track (weeks 7–14)

```
2.3   RLS matrix tests
2.18  Metric glossary
2.17  CEO dashboard v2
2.19  Funnel conversion analytics
2.16  Generated Supabase types (incremental)
2.7   Audit coverage review
2.28  CSV export with audit
2.29  Full E2E suite (redaction, roles)
2.8   Rate limit retention
2.20  Weekly metric snapshots
2.21  Research sources normalization
2.23  Research domain allowlist
2.22  Async research jobs (if pilot proved need)
2.15  lib/supabase.ts domain split
2.24  Ambassador schema
2.25  Ambassador admin UI
2.26  Ambassador portal
2.33  Membership email invites
2.36  Pagination
2.37  Bulk CSV import
2.30  Phase 2 completion reports
```

### Deferred (Phase 3 unless contract requires)

```
2.27  Opt-in LLM assistive provider
```

### Dependency summary

| Task | Hard depends on |
| --- | --- |
| 2.3 | 2.1, 2.2 |
| 2.6 | 2.34 (recommended) |
| 2.10 | 2.4, 2.9 |
| 2.17 | 2.11–2.14, 2.18 |
| 2.19 | 2.17 |
| 2.20 | 2.17 |
| 2.25–2.26 | 2.24 |
| 2.29 (full) | 2.9, 2.1 |
| 2.30 | Scale Track substantially complete |
| 2.33 | 2.6 |
| 2.15 | 2.11–2.14 |

---

## 19. Exit criteria

### Pilot Launch Gate (first university)

Required before onboarding the first pilot university:

- [ ] Hosted **staging** and **production** with HTTPS (2.9, 2.10)  
- [ ] **DB read-only privacy** enforced at database layer (2.1)  
- [ ] **Admin membership UI** — no SQL required for routine onboarding (2.6)  
- [ ] **CRM workflows:** outreach, follow-ups, school + contact CRUD (2.11–2.14)  
- [ ] **Pilot IT/security packet** published (2.0)  
- [ ] **Unit tests** in CI (2.2, 2.38)  
- [ ] **No sample data** in production (2.4)  
- [ ] **Settings routes** admin-gated (2.34)  
- [ ] **Documentation** accurate for IT review (2.31)  
- [ ] **Error monitoring** on staging/production (2.32)  
- [ ] **Incident response runbook** (2.35)  
- [ ] **E2E smoke** on staging (2.29 subset)  

**Not required for Pilot Launch Gate:** CEO v2 (2.17), Ambassador (2.24–2.26), research v2 (2.21–2.23), LLM (2.27), export (2.28), full refactor (2.15). CEO dashboard **v1** is acceptable.

### Phase 2 full exit (Scale Track complete)

- [ ] All Pilot Launch Gate criteria remain met  
- [ ] RLS matrix tested (2.3)  
- [ ] CEO dashboard v2 with documented metrics (2.17, 2.18)  
- [ ] Full E2E suite including redaction (2.29)  
- [ ] Audit coverage reviewed (2.7)  
- [ ] Ambassador MVP **or** explicit product sign-off to defer (2.24–2.26)  
- [ ] Security score ≥ 85 / 100 in Phase 2 completion report (2.30)  
- [ ] Zero open P1 risks in risk register (2.30)  

---

## Appendix: Phase 2 vs Phase 3 boundary

| Phase 2 | Phase 3 (future) |
| --- | --- |
| Controlled multi-pilot production | General SaaS availability |
| Admin UI for members | SSO (SAML/OIDC) for university IT |
| Opt-in LLM assistive (2.27 deferred) | Full AI workspace with RAG |
| CSV export | CRM integrations (HubSpot, Salesforce) |
| Basic analytics | Predictive scoring and forecasting |
| Ambassador MVP | Ambassador incentives and payments |
| Security headers + MFA docs | SOC 2 path, formal penetration test |

---

*This roadmap is the **single source of truth** for Phase 2 implementation. It incorporates the architectural review of July 3, 2026. Update task status as work progresses—one task at a time, tested and committed independently, following the Phase 1 discipline.*
