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

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Authentication

Sign in at `/login` with a Supabase Auth email/password user. Sign out at
`/logout`. OAuth and magic-link flows redirect through `/auth/callback`.

Dashboard routes are not protected yet. Any visitor can still open `/` without
signing in until route middleware is added in a later phase.

### Supabase Auth redirect URLs

In the Supabase project dashboard, add these redirect URLs under
Authentication → URL Configuration:

- `http://localhost:3000/auth/callback`
- Your production URL, for example `https://your-domain.com/auth/callback`

Set the site URL to your app origin, for example `http://localhost:3000`.

Create test users in Supabase under Authentication → Users before signing in
locally.

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

Apply the CRM schema from `supabase/migrations` to create these tables:

- `schools`: target school accounts and pipeline status.
- `contacts`: people tied to schools through `school_id`.
- `outreach`: email, call, meeting, event, and other outreach history.
- `interviews`: school interview notes submitted from the dashboard form.
- `follow_ups`: next actions tied to schools, contacts, outreach, or interviews.
