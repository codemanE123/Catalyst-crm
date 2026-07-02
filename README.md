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

## Getting started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

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
