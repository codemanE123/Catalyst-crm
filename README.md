# Catalyst CRM

First-version school partnership CRM built with Next.js, Tailwind, and
Supabase.

The dashboard includes CEO funnel metrics for schools added, emails sent,
replies, interviews booked, interviews completed, pilot interest, LOIs, and
paid pilots.

Each school links to a profile page with contacts, notes, outreach history,
interview summaries, current status, and the next follow-up.

The dashboard also includes an outreach email generator for short discovery
emails based on school name, contact role, and pain point.

Discovery interview capture tracks pain points, current tools, budget owner,
objections, pilot interest, referrals, and next step.

A rule-based summary helper turns raw interview notes into structured pain
points, buyer, budget, objections, pilot readiness, and next action fields. It
runs locally in the browser and does not call an external AI model.

The university research agent fetches public school websites and search result
pages, then populates CRM profile fields for enrollment, sector,
HBCU/community-college status, state, programs, centers, offices, and sources.

## Security and access (pilot)

Catalyst CRM requires authentication for the dashboard and school profiles.
Data is scoped by **organization** with role-based access:

| Role | Summary |
| --- | --- |
| `read_only` | Read own organization; sensitive interview/follow-up fields omitted at the database layer (Phase 2 Task 2.1) |
| `sales` | Read and write own organization |
| `admin` | Read, write, and delete within own organization |
| `super_admin` | Cross-organization platform access (Catalyst operators only) |

**Pilot documentation for university IT review:**

- `docs/pilot-it-security-packet.md` — share with institutional IT/legal
- `docs/pilot-onboarding-checklist.md` — internal onboarding steps
- `docs/supabase-rls-audit.md` — database RLS and read-only view model
- `docs/verification/readonly-view-verification.md` — manual verification procedures
- `docs/phase-2-roadmap.md` — implementation source of truth

Phase 1 completed authentication, organization-scoped RLS, server-action
authorization, validation, SSRF protection, rate limiting, audit logging, and
app-layer field redaction. Phase 2 adds database read-only views and security
unit tests in CI.

## Privacy and data handling

When using discovery interview capture, the outreach email generator, or the
university research agent:

- **Do not enter student PII**, including names, grades, student IDs, or
  protected education records (FERPA).
- **Use school and staff context only** in interview notes and outreach drafts.
- **Interview summaries are rule-based and local.** The summary helper uses
  pattern matching in your browser. Notes are not sent to a third-party AI
  service for summarization.
- **University research fetches public web pages.** Running the research agent
  requests publicly available school websites and search result pages over the
  network. Submit only school names and public website URLs — not student data
  or internal records.
- **Review outreach drafts before sending.** Email drafts are generated locally;
  do not include unnecessary sensitive data.

## Getting started

Install dependencies and run the development server (`npm run dev`). See
[Development commands](#development-commands) for lint, test, and build.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Authentication

Sign in at `/login` with a Supabase Auth email/password user. Sign out at
`/logout`. OAuth and magic-link flows redirect through `/auth/callback`.

**Route protection (Phase 1 Task 3):** Middleware requires a valid session for
`/` and `/schools/*`. Unauthenticated visitors are redirected to `/login`.
Login, logout, and auth callback routes remain public.

### Supabase Auth redirect URLs

In the Supabase project dashboard, add these redirect URLs under
Authentication → URL Configuration:

- `http://localhost:3000/auth/callback`
- Your production URL, for example `https://your-domain.com/auth/callback`

Set the site URL to your app origin, for example `http://localhost:3000`.

Create test users in Supabase under Authentication → Users, then add
`organization_members` rows with the appropriate role before signing in locally.
See `docs/pilot-onboarding-checklist.md` for membership SQL examples.

## Development commands

```bash
npm install
npm run dev      # local app at http://localhost:3000
npm run lint
npm run test     # security unit tests (authz, SSRF, validation)
npm run build
```

CI runs lint, test, and build on every push and pull request.

## Supabase configuration

The dashboard renders sample data when Supabase variables are not set. For
normal signed-in app use, set only:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is **not required** for dashboard, school profiles,
interview submission, or the university research agent. User actions run through
the authenticated session client and are enforced by Supabase RLS.

Reserve `SUPABASE_SERVICE_ROLE_KEY` for future background jobs or maintenance
scripts only. Do not set it in `.env.local` for routine local testing.

See `.env.example` for a starter template.

Apply migrations from `supabase/migrations` in timestamp order. Minimum set for
security and pilot onboarding:

1. `20260702200600_initial_crm_schema.sql`
2. `20260702210800_add_discovery_interview_fields.sql`
3. `20260702212500_add_ai_summary_interview_fields.sql`
4. `20260702221300_add_university_research_profile_fields.sql`
5. `20260703142600_add_organizations_and_roles.sql`
6. `20260703143300_add_crm_ownership_fields.sql`
7. `20260703144000_replace_broad_rls_policies.sql`
8. `20260703152200_add_rate_limit_events.sql`
9. `20260703152700_add_audit_events.sql`
10. `20260703160000_add_readonly_safe_views.sql`

Core tables:

- `schools`: target school accounts and pipeline status.
- `contacts`: people tied to schools through `school_id`.
- `outreach`: email, call, meeting, event, and other outreach history.
- `interviews`: school interview notes submitted from the dashboard form.
- `follow_ups`: next actions tied to schools, contacts, outreach, or interviews.
- `organizations`, `organization_members`: tenant and role membership.
- `interviews_readonly`, `follow_ups_readonly`: safe projections for `read_only` users (omit restricted columns).

Read-only users loading school profiles receive interview and follow-up data from
the safe views; writers use base tables. See `docs/supabase-rls-audit.md`.
