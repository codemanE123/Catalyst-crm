# Catalyst CRM

First-version school partnership CRM built with Next.js, Tailwind, and
Supabase.

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

Expected tables:

- `schools`: `id`, `name`, `district`, `location`, `status`, `owner`,
  `next_step`
- `contacts`: `id`, `name`, `role`, `school`, `email`, `last_touch`,
  `relationship`
- `interview_notes`: `school_name`, `interviewer`, `interview_date`,
  `sentiment`, `notes`, `follow_up`
