# Public-web prospect discovery (Phase 5.2.1)

**Status:** Implemented  
**Scope:** Optional second discovery source after College Scorecard, executed only by the background agent worker.

## Architecture

1. User creates a `prospect_generation_jobs` row (`queued`) via **Queue prospect generation**.
2. User clicks **Generate candidates** → server action validates auth/role/pilot and **queues** `ProspectGenerationAgent` targeting that job. No crawl or Scorecard call in the HTTP request.
3. Cron `/api/agents/process` claims the `agent_executions` row.
4. Worker handler `executeProspectGenerationJob` claims the job (`queued` → `running`), then runs `generateProspectCandidatesForJob`.
5. Candidates insert as `pending_review` with source citations. Human approve/reject unchanged.

## Source order

1. College Scorecard API (when enabled + keyed)
2. Approved web search (`WEB_SEARCH_PROVIDER=google_cse`) when more slots remain
3. Bounded fetches of official institutional pages (`.edu` / `.gov` by default)
4. Local deterministic stub **only** when `NODE_ENV=development` and not on Vercel Preview/Production

## Provider

Google Programmable Search / Custom Search JSON API:

- `WEB_SEARCH_API_KEY` — Google API key
- `WEB_SEARCH_ENGINE_ID` — Programmable Search Engine `cx`
- Endpoint: `https://www.googleapis.com/customsearch/v1`

Do **not** scrape Google/Bing HTML results pages.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PUBLIC_WEB_DISCOVERY_ENABLED` | `false` | Master switch |
| `WEB_SEARCH_PROVIDER` | `google_cse` | Only supported provider |
| `WEB_SEARCH_API_KEY` | unset | Server-only |
| `WEB_SEARCH_ENGINE_ID` | unset | CSE cx |
| `PUBLIC_WEB_ALLOWED_DOMAIN_SUFFIXES` | `.edu,.gov` | Institutional allowlist |
| `PUBLIC_WEB_MAX_SCHOOLS_PER_JOB` | `10` | Cap schools from web source |
| `PUBLIC_WEB_MAX_PAGES_PER_SCHOOL` | `3` | Homepage + up to 2 paths |
| `PUBLIC_WEB_FETCH_TIMEOUT_MS` | `4000` | Per-request timeout |
| `PUBLIC_WEB_MAX_RESPONSE_BYTES` | `500000` | Response size cap |
| `PUBLIC_WEB_USER_AGENT` | CatalystCRMProspectBot/1.0… | Fetch + robots UA |
| `PUBLIC_WEB_REQUIRE_ROBOTS_ALLOWED` | `true` | If robots.txt missing/unfetchable → skip domain |

Also required for the async path: `AGENT_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, College Scorecard vars as needed, pilot allowlists for production.

## Worker behavior

- Claim prospect job atomically (`status=queued` → `running`)
- Scorecard first; public web only for remaining `maxResults`
- Dedup by normalized name + website domain vs CRM schools and pending/approved candidates
- Job summary includes `source`, `configuration_status`, counts, duplicates/skips

## robots.txt

- Fetch `{origin}/robots.txt` once per domain (cached in-job)
- Evaluate allow/disallow for the configured user agent (`*` fallback)
- Skipped paths record safe reasons (`robots_disallow`, `robots_unavailable`)
- Missing robots + `PUBLIC_WEB_REQUIRE_ROBOTS_ALLOWED=true` → skip (conservative)

## SSRF / URL validation

Reuses `lib/safeFetch.ts` (`assertSafeHttpsUrl`, HTTPS only, no private IPs, redirect re-check).  
Additional rules in `lib/prospectSources/domainAllowlist.ts`:

- Allowed suffixes only (default `.edu`, `.gov`)
- Block social, shorteners, people-search, data brokers
- Reject login/SSO path hints

## Page limits

- At most 2 search queries per job (deterministic, no LLM)
- At most `PUBLIC_WEB_MAX_SCHOOLS_PER_JOB` web schools
- At most `PUBLIC_WEB_MAX_PAGES_PER_SCHOOL` pages per school (no recursive crawl)
- Small delays between requests

## Citations / privacy

Each candidate stores `source_name`, `source_url`, `discovery_method`, `retrieved_at`, confidence, rationale with source URLs.  
Emails/phones are redacted from extracted text. No student PII collection. No auto-approve / auto-email.

## Local vs Preview vs Production

| Environment | Stub | Providers |
| --- | --- | --- |
| Local `development` | Allowed when live sources empty | Optional |
| Vercel Preview | Never | Require Scorecard and/or public web |
| Vercel Production | Never | Pilot gates + providers |

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Button disabled / provider warning | Env vars + redeploy |
| Job stays queued | Cron secret, service role, `/api/agents/process` |
| `provider_not_configured` | Scorecard key and/or public web enable + CSE key/cx |
| `missing_api_key` | `COLLEGE_SCORECARD_API_KEY` |
| 0 candidates + `no_matches` | Broaden geography/types; check robots skips |
| RLS update errors on jobs | Apply migration `20260715120000_public_web_prospect_discovery.sql` |

## Vercel setup

1. Apply migration `20260715120000_public_web_prospect_discovery.sql`
2. Set Scorecard and/or public-web env vars for Production and Preview
3. Ensure `AGENT_CRON_SECRET` + `SUPABASE_SERVICE_ROLE_KEY`
4. Confirm cron in `vercel.json` hits `/api/agents/process`
5. Enable Phase 5.5 pilot for your org/user
6. Redeploy → Queue job → Generate candidates → wait for worker → review queue
