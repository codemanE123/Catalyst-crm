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

An AI summary helper turns raw interview notes into structured pain points,
buyer, budget, objections, pilot readiness, and next action fields.

The AI university research agent searches public school websites and populates
CRM profile fields for enrollment, sector, HBCU/community-college status,
state, programs, centers, offices, and sources.

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

The dashboard renders sample data when Supabase variables are not set. To use
live data, add:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Apply the CRM schema from `supabase/migrations` to create these tables:

- `schools`: target school accounts and pipeline status.
- `contacts`: people tied to schools through `school_id`.
- `outreach`: email, call, meeting, event, and other outreach history.
- `interviews`: school interview notes submitted from the dashboard form.
- `follow_ups`: next actions tied to schools, contacts, outreach, or interviews.
