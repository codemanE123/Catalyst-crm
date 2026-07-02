# Catalyst CRM Architecture and Security Audit

Role: Principal Software Architect and Security Lead

Scope: Full repository audit of the current Next.js, Tailwind, and Supabase codebase. This report is documentation-only and does not modify application code.

## 1. Current architecture

The application is a compact Next.js App Router CRM prototype.

- Runtime: Next.js 16 with React 19, TypeScript, Tailwind CSS 4, and Supabase JS.
- Rendering model:
  - `app/page.tsx` is the main server-rendered dashboard.
  - `app/schools/[id]/page.tsx` is a dynamic server-rendered school profile route.
  - Interactive widgets are client components under `app/components`.
- Data access:
  - `lib/supabase.ts` owns Supabase client creation, sample fallback data, dashboard data loading, school profile data loading, CEO metric aggregation, and the discovery interview server action.
  - `lib/universityResearch.ts` owns public website crawling, heuristic extraction, and the university profile server action.
- Persistence:
  - Supabase tables are defined by SQL migrations in `supabase/migrations`.
  - When Supabase environment variables are absent, the app renders sample data and server actions become preview/no-op paths.
- Server mutation model:
  - There are no REST/JSON API routes.
  - Mutations and research are implemented as Next.js server actions.

## 2. Folder structure

```text
.
├── app/
│   ├── components/
│   │   ├── DiscoveryInterviewForm.tsx
│   │   ├── OutreachEmailGenerator.tsx
│   │   └── UniversityResearchAgent.tsx
│   ├── schools/[id]/page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── supabase.ts
│   └── universityResearch.ts
├── supabase/migrations/
│   ├── 20260702200600_initial_crm_schema.sql
│   ├── 20260702210800_add_discovery_interview_fields.sql
│   ├── 20260702212500_add_ai_summary_interview_fields.sql
│   └── 20260702221300_add_university_research_profile_fields.sql
├── package.json
├── next.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
└── tsconfig.json
```

Key observation: this is still a small prototype structure. It has not yet been separated into domains such as `features/schools`, `features/interviews`, `server/db`, `server/actions`, or `shared/types`.

## 3. Current features

- Executive dashboard:
  - CEO funnel metrics: schools added, emails sent, replies, interviews booked/completed, pilot interest, LOIs, paid pilots.
  - Operations snapshot: schools tracked, active opportunities, known contacts.
  - Pipeline status by school outreach stage.
- School CRM:
  - Schools table.
  - Contacts table.
  - School profile pages with account notes, contacts, outreach history, interview summaries, status, next follow-up, and researched university fields.
- Discovery workflow:
  - Discovery interview form.
  - Raw interview notes summarizer that fills pain points, current tools, buyer, budget, budget owner, objections, pilot readiness, referrals, summary, and next action.
- Outreach:
  - Short exploratory email generator.
  - Copy-to-clipboard feedback.
- University research:
  - Server action that accepts a school name and optional website.
  - Attempts website discovery when no URL is supplied.
  - Crawls public university pages and topic-specific search result URLs.
  - Extracts or previews enrollment, public/private status, HBCU status, community college status, state, AI/cyber/healthcare programs, innovation center, entrepreneurship center, career services, workforce development, and sources.
  - Saves to Supabase when configured; otherwise displays preview-only results.

## 4. Database schema

Core tables:

- `schools`
  - Base fields: `id`, `name`, `district`, `location`, `status`, `owner`, `next_step`, `website`, `notes`, timestamps.
  - Research fields: `enrollment`, `public_private`, `hbcu`, `community_college`, `state`, `ai_programs`, `cyber_programs`, `healthcare_programs`, `innovation_center`, `entrepreneurship_center`, `career_services_office`, `workforce_development_office`, `profile_sources`.
  - Unique constraint: `(name, district)`.
- `contacts`
  - Belongs to `schools` via `school_id`.
  - Stores role, email, phone, relationship, last touch, notes.
- `outreach`
  - Belongs to `schools`; optional `contact_id`.
  - Stores channel, subject, message, outcome, date, owner, next step.
- `interviews`
  - Belongs to `schools`; optional `contact_id`.
  - Stores interviewer, date, sentiment, notes, follow-up.
  - Discovery extensions: pain points, current tools, budget owner, objections, pilot interest, referrals, next step.
  - AI summary extensions: raw notes, buyer, budget.
- `follow_ups`
  - Belongs to `schools`; optional contact/outreach/interview references.
  - Stores title, due date, status, owner, notes, completed timestamp.

Schema strengths:

- UUID primary keys.
- Foreign keys with cascade/set-null behavior.
- Timestamps and update triggers.
- Useful indexes for school IDs, dates, and status.
- Check constraints for status-like fields.
- RLS enabled on all core tables.

Schema concerns:

- Several structured fields are stored as long `text` instead of normalized related records.
- Program/office research fields are text summaries instead of typed evidence records.
- `profile_sources` is an array, which is acceptable for a prototype but harder to query/audit than a source table.
- No tenant/user ownership columns.
- Broad RLS policies effectively grant every authenticated user global read/write access.

## 5. API routes

There are no `app/api/*` route handlers.

Server-side behavior is implemented through server actions:

- `createInterviewNote(formData)`
  - Inserts discovery interview fields into `interviews`.
  - No-op when Supabase is not configured.
- `researchUniversityProfile(previousState, formData)`
  - Fetches public web pages.
  - Builds a university research profile.
  - Upserts into `schools` when Supabase is configured.
  - Returns preview data when Supabase is not configured.

Architectural implication: server actions are currently the API layer. That is workable for a prototype, but explicit route handlers or service-layer boundaries may be preferable as integrations grow.

## 6. Authentication flow

There is no application authentication flow.

Current behavior:

- No login page.
- No Supabase Auth session retrieval.
- No middleware protecting routes.
- No user context passed to data access.
- No per-user or per-organization ownership.

Supabase client creation uses:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`, if present
- otherwise `NEXT_PUBLIC_SUPABASE_ANON_KEY`

This means the app can operate without Supabase credentials using sample data, but there is no real authenticated app boundary.

## 7. Authorization / roles

There is no application-level role model.

Database-level policies:

- RLS is enabled.
- Policies grant authenticated users read/manage access to all rows in every core table.

Current roles:

- Anonymous app user: can view sample data and use no-op/preview behavior.
- Supabase authenticated user: would be able to manage all CRM rows, based on current RLS policies.
- Service role key path: can bypass RLS entirely.

Missing roles:

- Admin.
- Sales/recruiting user.
- Read-only viewer.
- Organization/account owner.
- Research agent/service identity.

## 8. Environment variables

Documented environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Operational behavior:

- Without Supabase variables, the app uses sample data and preview/no-op server action behavior.
- With Supabase variables, reads and writes target Supabase.

Concerns:

- `SUPABASE_SERVICE_ROLE_KEY` should not be used in general request paths unless the server action is strongly authenticated and authorized.
- There is no schema validation for required environment variables.
- There is no explicit server-only module boundary for admin credentials.

## 9. Third-party services

- Next.js / React: web framework and rendering.
- Tailwind CSS / PostCSS: styling.
- Supabase: database, auth platform dependency, and persistence target.
- DuckDuckGo HTML search: used by `universityResearch.ts` for website and topic page discovery.
- Public university websites: fetched by the research agent.

Third-party risk:

- DuckDuckGo scraping can be brittle or rate-limited.
- University website content is untrusted input.
- Public website fetches introduce SSRF, availability, correctness, and compliance concerns.

## 10. Security risks

High risk:

1. No application authentication.
   - Any deployed user can reach the dashboard unless platform-level auth is added.
2. No authorization gates on server actions.
   - Server actions can be invoked without checking user identity or role.
3. Service role key usage in request-path helpers.
   - If configured, server actions can bypass RLS.
4. SSRF risk in the university research agent.
   - User-supplied websites are fetched server-side.
   - Current normalization accepts arbitrary HTTP(S) hosts.
   - No private IP, localhost, metadata IP, or DNS rebinding protections are present.
5. Broad RLS policies.
   - Any authenticated Supabase user can manage all CRM data.

Medium risk:

1. Untrusted scraped content displayed in the UI.
   - React escapes text by default, but the content can still be misleading, low quality, or harmful as text.
2. No rate limiting.
   - Research server action can make multiple network calls per request.
3. No audit log.
   - Writes to CRM tables are not tied to an actor.
4. No input length limits.
   - Large raw notes, scraped content, or form submissions could create operational or UX problems.
5. Clipboard/browser interactions are client-only and not security-sensitive, but no telemetry exists for failures.

Low risk:

1. No obvious direct use of `dangerouslySetInnerHTML`.
2. No custom authentication crypto.
3. No file upload surface.

## 11. Technical debt

- `lib/supabase.ts` is too large and mixes:
  - Type definitions.
  - Sample data.
  - Supabase client creation.
  - Query functions.
  - Metric aggregation.
  - Server actions.
- `app/page.tsx` contains too many inline presentational components.
- AI summary is heuristic but named as AI.
- University research is heuristic and search/scrape based.
- No automated tests.
- No generated Supabase types.
- No loading/error boundaries beyond local component state.
- No observability or structured logging.
- No validation library for form/server action inputs.
- No explicit domain boundaries for schools, contacts, interviews, outreach, research.

## 12. Scalability risks

- Dashboard loads broad datasets and computes metrics in application code.
- CEO metrics run multiple count queries independently.
- No pagination for schools, contacts, outreach, or interviews.
- Research agent runs multiple serial-ish external fetch/search operations per request.
- No queue/background job system for research.
- No caching for public website research.
- Long text fields may grow without limits.
- Sources stored as arrays are not ideal for deduplication, analytics, or provenance scoring.
- Server actions may become hard to version or consume from non-React clients.

## 13. What to keep

- Next.js App Router foundation.
- Tailwind-based UI system for quick iteration.
- Supabase migrations as the source of database structure.
- Sample-data fallback for demos and local development.
- School profile page concept.
- Clear first-version CRM domains: schools, contacts, outreach, interviews, follow-ups.
- RLS enabled by default.
- Server actions for quick internal prototype flows.
- Research agent preview mode when Supabase is absent.

## 14. What to refactor

High-value refactors:

1. Split `lib/supabase.ts`:
   - `lib/db/client.ts`
   - `lib/db/types.ts`
   - `lib/db/queries/schools.ts`
   - `lib/db/queries/interviews.ts`
   - `lib/actions/interviews.ts`
   - `lib/sample-data/*`
2. Split dashboard UI into feature components:
   - `CeoDashboard`
   - `PipelineStatus`
   - `SchoolsTable`
   - `ContactsTable`
3. Move research logic into a service module with:
   - URL validation.
   - Fetch policy.
   - Page extraction.
   - Evidence scoring.
   - Persistence adapter.
4. Add schema validation:
   - Use a validation library for server action inputs.
   - Enforce maximum lengths.
5. Generate Supabase database types and remove broad casts.
6. Normalize university research evidence:
   - `school_research_sources`
   - `school_program_evidence`
   - confidence scores.
7. Add auth middleware and route protection.

## 15. What to remove

- Runtime use of `SUPABASE_SERVICE_ROLE_KEY` from general app actions.
- Broad authenticated-manage-all RLS policies before production use.
- Hard-coded sample data from production bundles once a real seeded database exists.
- Misleading “AI” labels if no LLM or model-backed behavior is added; alternatively label as “AI-style helper” or wire real model inference.
- Direct public website crawling from user-triggered request paths once usage grows; move to jobs.

## 16. Highest-priority fixes

1. Add authentication before any production deployment.
   - Protect all dashboard/profile routes.
   - Add Supabase Auth or another identity provider.
2. Add authorization and tenant ownership.
   - Add `organization_id`, `created_by`, `updated_by`.
   - Restrict RLS by organization and role.
3. Remove service-role key from normal request paths.
   - Use anon/session client for user actions.
   - Reserve service role for controlled admin jobs only.
4. Harden university research fetches.
   - Block localhost, private IP ranges, metadata IPs, and non-HTTP(S) protocols.
   - Add response size limits, rate limits, timeout handling, and retries.
   - Move research to a background job for reliability.
5. Add input validation and size limits to all server actions.
6. Add automated tests for:
   - Supabase query mappers.
   - Discovery summary extraction.
   - Research URL validation/extraction.
   - Server action authorization.
7. Split large modules and add typed database definitions.
8. Replace broad RLS policies with least-privilege policies.
9. Add audit logging for data writes and research runs.
10. Add monitoring for server action failures and external fetch failures.

## Closing assessment

This codebase is a strong first-version prototype: it demonstrates the core CRM surfaces, school profiles, discovery workflows, outreach generation, and public university research in a compact Next.js application. The biggest gap is not feature coverage; it is production readiness. Before real users or real data, the project needs authentication, authorization, safer Supabase key handling, hardened research fetching, validation, tests, and clearer domain boundaries.
