# Catalyst CRM — Phase 3 Real Prospect Sources

**Status:** Design only (no application code)  
**Date:** July 7, 2026  
**Audience:** Engineering, product, security, pilot operations  
**Prerequisite:** Phase 3A–3C workflow complete (jobs, review queue, approve/reject, stub generator)

**Related documents:**
- `docs/phase-3-agentic-architecture.md` (target agentic architecture)
- `docs/data-privacy-audit.md` (classification and retention)
- `docs/ai-safety-audit.md` (LLM boundaries — optional later phase)
- `docs/supabase-rls-audit.md` (tenant isolation)
- `lib/prospectCandidateStub.ts` (current stub implementation to replace)

---

## 1. Purpose

Phase 3C proved the end-to-end workflow — queue job → generate candidates → review → approve into `schools` — using a **static, deterministic stub dataset**. This document defines how Catalyst should graduate to **real prospect generation** from authoritative public institutional data, without AI inference or web scraping in the first real-data release.

### 1.1 Goals

| Goal | Meaning |
| --- | --- |
| **Replace stub with evidence-backed candidates** | Every candidate field traceable to a public source |
| **Preserve human approval gate** | Real data still lands in `prospect_candidates`, not `schools` |
| **Keep jobs async** | No long-running fetches in Next.js server actions |
| **Stay cost-bounded** | Prefer bulk open-data downloads over per-candidate API calls |
| **Support SecureCell ICP** | HBCUs, CAE institutions, state universities, community colleges, workforce/cyber programs |

### 1.2 Non-goals (first real-data release)

- LLM-based discovery or enrichment
- Arbitrary web scraping of school sites
- Contact email harvesting
- Cross-tenant shared prospect database
- Autonomous promotion to CRM

### 1.3 Current baseline (implemented)

| Component | Today |
| --- | --- |
| Job enqueue | User submits geography, school types, keywords, max results |
| Stub processing | `processProspectGenerationJob` filters `CURATED_STUB_SCHOOL_SEEDS` |
| Staging | `prospect_candidates` with name, website, location, rationale, confidence |
| Review | Approve → `schools`; reject → `status = rejected` |
| Provenance | **Not yet stored** — `candidate_sources` table designed but not implemented |

Real-source work should **swap the stub generator** for a source-backed discovery module while keeping the same job/review UI contracts.

---

## 2. Recommended data sources

### 2.1 Source inventory

| Source | Provider | Access model | Primary use |
| --- | --- | --- | --- |
| **IPEDS** | NCES / U.S. Dept. of Education | Bulk CSV/API | Institution identity, sector, location, enrollment, control (public/private) |
| **College Scorecard** | U.S. Dept. of Education | REST API + bulk data | Website URL, location, program/field-of-study, earnings/completion (optional ranking signals) |
| **NSA CAE-CO listings** | NSA / DHS (public designation pages) | Periodic published lists (HTML/CSV/PDF) | Cybersecurity CAE-CD, CAE-R, CAE-2Y designations |
| **HBCU lists** | White House Initiative on HBCUs / NCES IPEDS flags | Bulk reference | HBCU identification and filtering |
| **State university systems** | State higher-ed boards (e.g., UNC System, UT System, Cal State) | Published directories (CSV/HTML) | System membership, flagship/regional classification |
| **Community college systems** | State/community college associations | Published directories | 2-year institution coverage where IPEDS sector alone is insufficient |
| **Optional search APIs** | Google Programmable Search, Bing, SerpAPI, etc. | Paid API, per-query | Gap-fill for missing websites or program pages — **defer to Phase 3F+** |

### 2.2 Source trust tiers

| Tier | Sources | Usage |
| --- | --- | --- |
| **Tier 1 (authoritative)** | IPEDS, College Scorecard, federal HBCU/CAE lists | Required for candidate creation |
| **Tier 2 (supplemental)** | State system directories | Improves coverage and rationale text |
| **Tier 3 (optional)** | Search APIs, manual `.edu` page fetch | Enrichment only; never sole source for identity fields |

---

## 3. Which sources to use first

Recommended **sequential adoption** — each phase adds sources without breaking prior pipelines.

### Phase 3D — Foundation (weeks 1–2)

**Use first:**

1. **IPEDS** — master institution registry (unit ID, name, state, sector, level)
2. **College Scorecard** — website and program field-of-study for cyber/IT keyword matching
3. **NSA CAE public listing** — static ingest of designated institutions (CAE-CD, CAE-R, CAE-2Y)

**Why this order:**

- IPEDS + Scorecard are federal open data with stable identifiers and clear licensing
- CAE list is small, high-value for SecureCell ICP, and publicly maintained
- All three support **bulk prefetch** into Catalyst-owned tables (no per-job API fan-out)

**Defer:**

- State system directories (manual curation per state)
- Search APIs
- Per-school website scraping

### Phase 3E — ICP expansion (weeks 3–4)

**Add:**

4. **HBCU reference list** (crosswalk to IPEDS `UNITID`)
5. **Curated state university system membership** for 5–10 priority states (pilot geography)

### Phase 3F — Coverage and enrichment (weeks 5–8)

**Add:**

6. **Community college system directories** for priority states
7. **Optional search API** for website gap-fill only (institutions missing `school.url` in Scorecard)
8. **Allowlisted `.edu` page fetch** for program/workforce keywords (reuse `lib/safeFetch.ts`)

---

## 4. Data fields available from each source

### 4.1 IPEDS (NCES)

| Field | IPEDS element (conceptual) | Maps to Catalyst |
| --- | --- | --- |
| Institution ID | `UNITID` | External key / dedup |
| Name | `INSTNM` | `prospect_candidates.name` |
| City | `CITY` | `location` |
| State | `STABBR` | `district` / `state` on promote |
| Sector | `SECTOR` (1–9) | School type: public 4yr, private 4yr, public 2yr, etc. |
| Level | `ICLEVEL` | 2-year vs 4-year filter |
| Control | `CONTROL` | Public vs private |
| HBCU flag | `HBCU` | `schoolTypes` includes `hbcu` |
| Title IV eligibility | `TITLE_IV` | Quality filter (eligible institutions) |
| Enrollment (fall) | `EFYTOTLT` (via EF survey) | `profile.enrollment` (future) |
| Web address | Sometimes in IC survey | Fallback if Scorecard missing |

**Gaps:** Website URL often incomplete in IPEDS alone; program-level cyber tags not native.

### 4.2 College Scorecard

| Field | API / bulk column | Maps to Catalyst |
| --- | --- | --- |
| `id` | Scorecard unit ID (aligned to IPEDS) | Join key |
| `school.name` | Institution name | Confirm / normalize name |
| `school.city`, `school.state` | Location | `location`, `district` |
| `school.school_url` | Official website | `website` |
| `school.ownership` | Public/private | Rationale / ICP |
| `latest.programs.cip_4_digit` | Program CIP codes | Cyber/IT program detection (CIP 11.x) |
| `latest.programs.title` | Program titles | Keyword match for workforce/cyber |
| `latest.student.size` | Enrollment | Ranking signal |
| `school.degrees_awarded.predominant` | Certificate/associate/bachelor | Community college vs university |

**Gaps:** Not all schools have program arrays populated; API pagination required for large pulls.

### 4.3 NSA CAE public listings

| Field | Source | Maps to Catalyst |
| --- | --- | --- |
| Institution name | CAE roster | Match to IPEDS `UNITID` |
| Designation type | CAE-CD / CAE-R / CAE-2Y | `schoolTypes` includes `cae`; 2Y → `community_college` |
| State | Roster | Geography filter |
| Designation year (if published) | Roster | Rationale freshness |

**Gaps:** Name spelling differs from IPEDS; requires fuzzy matching + manual override table for exceptions.

### 4.4 HBCU lists

| Field | Source | Maps to Catalyst |
| --- | --- | --- |
| Institution name | WHIHBCU / DOE list | Crosswalk |
| IPEDS UNITID | When provided | Primary join key |
| State | List metadata | Geography filter |

**Note:** IPEDS `HBCU = 1` is authoritative for most cases; federal list used for validation and rationale citation.

### 4.5 State university systems

| Field | Source | Maps to Catalyst |
| --- | --- | --- |
| Campus name | System directory | `name` |
| System name | e.g., "University of North Carolina System" | Rationale |
| Main website | Directory | `website` |
| Campus city/state | Directory | `location` |
| Institution type | Flagship, regional, etc. | `schoolTypes` includes `state_university` |

**Gaps:** No national API; per-state ETL scripts or manual CSV seeds per pilot region.

### 4.6 Community college systems

| Field | Source | Maps to Catalyst |
| --- | --- | --- |
| College name | State/county directory | `name` |
| District / service area | Directory | `district` |
| Website | Directory | `website` |
| Workforce/certificate programs | Sometimes listed | Keyword match for `workforce_cyber` |

### 4.7 Optional search APIs (later)

| Field | Usage |
| --- | --- |
| Top result URL | Gap-fill `website` only when Tier 1 sources lack URL |
| Snippet | Evidence in `candidate_sources`; not trusted for identity |

**Policy:** Search API may not be the primary source for `name` or `location`.

### 4.8 Candidate output schema (minimum viable)

Regardless of source mix, each generated candidate should populate:

| `prospect_candidates` field | Required | Source priority |
| --- | --- | --- |
| `name` | Yes | IPEDS `INSTNM` |
| `website` | Strongly preferred | Scorecard → IPEDS → search gap-fill |
| `district` | Yes | `{city}, {state}` |
| `location` | Yes | Same as district initially |
| `rationale` | Yes | Human-readable sentence citing designations/programs |
| `confidence_score` | Yes | Rules-based from source tier + match quality |
| `candidate_sources` rows | Yes (3D+) | One row per field provenance |

---

## 5. Privacy and source citation requirements

### 5.1 Data classification

Per `docs/data-privacy-audit.md`, institutional data from IPEDS, Scorecard, CAE, and state directories is **Public**. Catalyst stores it in org-scoped staging tables for workflow reasons, not because it is confidential.

| Data | Classification | Storage |
| --- | --- | --- |
| Institution name, website, city, state | Public | `prospect_candidates` |
| Enrollment, program titles, CAE designation | Public | `profile` jsonb + `candidate_sources` |
| Reviewer approve/reject actions | Internal | `audit_events`, `prospect_candidates.status` |
| Promoted CRM records | Internal / Confidential mix | `schools` after approval |

**Catalyst must not** ingest student-level records, FERPA-protected data, or non-public directories behind authentication.

### 5.2 Citation requirements

Every real candidate must have at least one `candidate_sources` row for:

- `name`
- `website` (if present)
- Each designation tag used in rationale (HBCU, CAE, state system, workforce)

**`candidate_sources` minimum fields:**

| Field | Requirement |
| --- | --- |
| `source_type` | `api` or `bulk_dataset` (not `llm_inference` in 3D) |
| `source_url` | HTTPS link to dataset documentation or API request template |
| `source_title` | e.g., "IPEDS 2023 Institutional Directory" |
| `snippet` | Truncated JSON or CSV row fragment (max 2 KB) |
| `field_path` | e.g., `name`, `website`, `profile.designations.cae` |
| `fetched_at` | Timestamp of ingest or per-job fetch |
| `confidence` | 0.95 for Tier 1 exact UNITID match; lower for fuzzy name match |

### 5.3 UI disclosure

Review queue should show an **evidence panel** (Phase 3E UI) listing sources per candidate. Until then, rationale string must mention source class:

> "NSA CAE-CD designated (2024 roster); IPEDS public 4-year; Scorecard CIP 11.0701 Cybersecurity program."

### 5.4 Retention

| Artifact | Retention |
| --- | --- |
| Bulk source snapshots | Refresh quarterly; keep last 2 snapshots |
| `candidate_sources` | Life of candidate + 90 days after reject |
| Raw API responses in worker logs | Do not log; store snippet in DB only |

### 5.5 Legal / terms

| Source | Notes |
| --- | --- |
| IPEDS / Scorecard | Open government data; attribute U.S. Dept. of Education |
| NSA CAE lists | Public designation; cite NSA CAE program page |
| State directories | Check per-state terms; most are public workforce data |
| Search APIs | Require org opt-in + API key in worker env; log provider name |

---

## 6. Background job flow

Real prospect generation should run in a **dedicated worker** (not Vercel serverless), reusing the Postgres job queue designed in `docs/phase-3-agentic-architecture.md`.

### 6.1 High-level flow

```
User clicks "Generate candidates" (or auto-worker picks queued job)
        │
        ▼
Worker claims job (status: queued → running)
        │
        ▼
Audit: prospect.job_run
        │
        ▼
┌───────────────────────────────────────┐
│ Source-backed discovery module        │
│  1. Resolve geography → state list    │
│  2. Query local source tables (IPEDS+  │
│     Scorecard+CAE+HBCU crosswalk)     │
│  3. Filter by schoolTypes + keywords  │
│  4. Rank and cap at maxResults        │
│  5. Dedup vs schools + pending cands  │
└───────────────────────────────────────┘
        │
        ▼
Insert prospect_candidates + candidate_sources
        │
        ▼
Update job summary (counts, warnings, source version)
        │
        ▼
status: completed (or failed)
        │
        ▼
Audit: prospect.job_complete | prospect.job_fail
```

### 6.2 Transition from stub

| Step | Action |
| --- | --- |
| 1 | Add `source_mode` to job `input` or `summary`: `stub` \| `real` |
| 2 | Introduce worker env `PROSPECT_SOURCE_MODE=real` |
| 3 | Keep stub behind `PROSPECT_SOURCE_MODE=stub` for CI/dev |
| 4 | Move `processProspectGenerationJob` logic from server action to worker; UI action enqueues/ triggers worker only |
| 5 | Server action returns immediately after claim (already async UX) |

### 6.3 Job state machine (aligned with implementation)

```
queued ──claim──► running ──success──► completed
                    │
                    └──error──► failed
```

**Idempotency:** Claim with `UPDATE ... WHERE status = 'queued' RETURNING id`. Re-running a completed job is rejected (current behavior).

### 6.4 Dedup rules

| Check | Action |
| --- | --- |
| Same `UNITID` already in job's candidates | Skip |
| Normalized website domain matches existing `schools` in org | Set `duplicate_of_school_id` hint; lower confidence |
| Name + state matches existing school | Flag in rationale; surface in review |

Primary key for matching: **IPEDS `UNITID`**; fallback: normalized domain; last resort: normalized name + state.

### 6.5 Source refresh jobs (separate job type)

| Job type | Schedule | Purpose |
| --- | --- | --- |
| `refresh_source_tables` | Weekly | Re-download IPEDS/Scorecard/CAE bulk files |
| `discover_prospects` | User-triggered | Query local tables only |

User-facing discovery jobs should **not** download multi-GB datasets per run.

---

## 7. Cost and rate-limit considerations

### 7.1 Cost model

| Approach | Cost profile | Recommendation |
| --- | --- | --- |
| Bulk IPEDS/Scorecard ingest to Postgres | One-time download + storage; negligible per job | **Preferred** |
| Per-job Scorecard API calls | Free tier but rate-limited; latency scales with max results | Avoid for production |
| Search API gap-fill | $1–5 per 1,000 queries | Cap per org/month; off by default |
| LLM enrichment | Token-based | Phase 3G+ only; out of scope here |

### 7.2 Rate limits (recommended defaults)

Extend `rate_limit_events` per `docs/phase-3-agentic-architecture.md` Appendix A:

| Meter | Default limit | Notes |
| --- | --- | --- |
| `discover_prospects` jobs / org / day | 5 | Up from stub-era manual testing |
| Candidates per job | 100 | Hard cap at schema validation |
| Scorecard API calls / worker / minute | 10 | Only if live API used |
| Source table refresh / week | 1 | Admin-triggered or cron |
| Search API queries / org / day | 0 (disabled) | Enable in 3F with quota |

### 7.3 Worker sizing

| Workload | Estimate |
| --- | --- |
| Local SQL discovery over 10k institutions | < 2 seconds |
| Full candidate insert (25 rows + sources) | < 1 second |
| Bulk IPEDS refresh | 5–30 minutes (offline) |

**Target:** User-perceived time from click to reviewable queue **< 30 seconds** for 25 candidates.

### 7.4 Caching

| Cache | TTL | Key |
| --- | --- | --- |
| Normalized source tables | Refreshed weekly | Dataset version in `summary.source_version` |
| Geography → state list parse | 24 h | Hash of geography string |
| UNITID crosswalk (CAE name → IPEDS) | Until next CAE ingest | CAE roster version |

---

## 8. Implementation phases

### Phase 3D — Real data foundation

| Deliverable | Details |
| --- | --- |
| Migration | `candidate_sources` table + indexes |
| ETL scripts | IPEDS + Scorecard bulk → `source_institutions` (new internal table) |
| CAE ingest | One-time parser for CAE roster → `source_cae_designations` |
| Discovery module | `lib/prospectDiscovery/realSources.ts` replaces stub generator in worker |
| Crosswalk | UNITID-first; fuzzy name match with confidence penalty |
| Worker v1 | Claim jobs from Postgres; run discovery; write candidates + sources |
| Feature flag | `PROSPECT_SOURCE_MODE=stub\|real` (default `stub` in dev) |
| Audit | Existing `prospect.job_*` events + `source_version` in summary |

**Gate:** 10 real candidates generated in staging; each has ≥ 2 `candidate_sources` rows; zero stub references.

### Phase 3E — ICP lists and review evidence UI

| Deliverable | Details |
| --- | --- |
| HBCU crosswalk | Validate IPEDS flag against federal list |
| State system seeds | Priority states for pilot (e.g., AL, MD, TX, NC, GA, FL) |
| Review UI | Evidence panel per candidate |
| Confidence rules | Tier 1 = 0.90+; fuzzy match = 0.60–0.85 |
| Dedup warnings | Show duplicate school hints in review queue |

**Gate:** Pilot org generates HBCU + CAE list for Southeast; approves 5 without manual URL edits.

### Phase 3F — Community colleges and gap-fill

| Deliverable | Details |
| --- | --- |
| CC directories | 3–5 state community college system ingests |
| Workforce keyword pass | CIP + program title matching for `workforce_cyber` |
| Optional search gap-fill | Org opt-in; quota enforced |
| `safeFetch` program pages | Allowlisted `.edu` only; SSRF protections |

**Gate:** Community college job produces CAE-2Y candidates with citations.

### Phase 3G — Deprecate stub

| Deliverable | Details |
| --- | --- |
| Remove stub from production path | `PROSPECT_SOURCE_MODE=real` only in prod |
| Keep stub for tests | Fixture-based unit tests |
| Delete `CURATED_STUB_SCHOOL_SEEDS` from runtime | Retain as test fixtures only |

---

## 9. Testing plan

### 9.1 Unit tests

| Area | Cases |
| --- | --- |
| Geography resolver | "Southeast US" → state list; "Texas" → TX; empty → error |
| School type filter | HBCU flag; CAE join; sector 1–2 for community college |
| Keyword matcher | CIP 11.x; program title contains "cybersecurity" |
| UNITID crosswalk | Exact match; fuzzy name; no match → skip with warning |
| Dedup | Existing school same domain; same UNITID in job |
| Confidence scoring | Tier 1 vs fuzzy vs duplicate penalty |

### 9.2 Integration tests (worker)

| Scenario | Expected |
| --- | --- |
| Job `queued` → worker claim | `running`, `started_at` set |
| Valid ICP input | N candidates ≤ maxResults, all have sources |
| No matches | `completed`, `candidate_count: 0`, warning in summary |
| Insert failure | `failed`, audit `prospect.job_fail` |
| Double claim | Second worker gets no row |

### 9.3 Contract tests against source snapshots

- Commit **frozen JSON/CSV fixtures** (subset of IPEDS + Scorecard + CAE) in `tests/fixtures/prospectSources/`
- ETL tests assert row counts and join coverage
- Re-run when upstream schema changes

### 9.4 End-to-end (staging)

1. Enqueue job: geography = "Maryland", types = HBCU + CAE, max = 10
2. Worker processes job
3. Review queue shows candidates with evidence
4. Approve one → `schools` row matches source website
5. Reject one → not in `schools`
6. Audit log contains `prospect.job_run`, `prospect.job_complete`, `prospect_candidate.approve`

### 9.5 Regression

- Existing stub tests remain until 3G
- Approve/reject action tests unchanged
- RLS: org A cannot see org B candidates or source rows

---

## 10. Rollback plan

### 10.1 Feature flags

| Flag | Rollback action |
| --- | --- |
| `PROSPECT_SOURCE_MODE=stub` | Instant revert to Phase 3C behavior |
| `REAL_PROSPECT_SOURCES_ENABLED=false` | Worker skips real module |
| `SEARCH_GAP_FILL_ENABLED=false` | Disable Tier 3 (default off) |

Flags live in worker env and optionally `organizations.settings` for per-org pilot control.

### 10.2 Database rollback

| Change | Rollback |
| --- | --- |
| `candidate_sources` table | Leave empty; drop table in down migration if needed |
| `source_institutions` / `source_cae_designations` | Internal tables; safe to truncate |
| `prospect_candidates` from real jobs | Mark job `failed` or delete candidates by `job_id` |

**No rollback impact on `schools`:** Approved schools remain; rollback only affects generation path.

### 10.3 Worker rollback

1. Deploy previous worker image (stub-only)
2. Set `PROSPECT_SOURCE_MODE=stub`
3. Drain `running` jobs (wait or mark `failed` with `WORKER_ROLLBACK` code)
4. Queued jobs process with stub on next run

### 10.4 Operational playbook

| Symptom | Response |
| --- | --- |
| Bad candidate batch (wrong geography) | Reject candidates; fix source ETL; re-run job |
| CAE crosswalk drift | Pin CAE snapshot version; hotfix crosswalk CSV |
| Scorecard API rate limit | Fall back to local `source_institutions` only |
| Worker outage | Jobs stay `queued`; no CRM impact |
| Privacy concern on source | Disable source; switch to stub; purge `candidate_sources` for affected job |

### 10.5 Communication

- Pilot orgs notified when switching `stub` → `real`
- Review UI badge: "Source: IPEDS + Scorecard + CAE (Jul 2026 snapshot)"
- Changelog entry per source version bump

---

## Appendix A — Suggested internal source tables (design only)

```
source_dataset_versions
  id, name, version, fetched_at, record_count, checksum

source_institutions
  unitid PK, name, city, state, sector, level, control,
  hbcu, website, enrollment, scorecard_programs jsonb,
  dataset_version_id

source_cae_designations
  id, unitid nullable, name, designation_type, state, roster_year,
  dataset_version_id

source_state_system_members
  id, unitid nullable, system_name, campus_name, state, website,
  dataset_version_id
```

User jobs query **only** these tables at runtime — never raw federal APIs in the request path.

---

## Appendix B — Mapping job input to source queries

| Job input | Source query |
| --- | --- |
| `geography` | Filter `state` IN resolved states |
| `schoolTypes: hbcu` | `source_institutions.hbcu = 1` |
| `schoolTypes: cae` | JOIN `source_cae_designations` |
| `schoolTypes: state_university` | `sector IN (1,2)` + optional state system join |
| `schoolTypes: community_college` | `sector = 4` OR CAE-2Y |
| `schoolTypes: workforce_cyber` | Scorecard CIP 11.x OR keyword in program titles |
| `keywords` | Filter program titles + rationale builder |
| `maxResults` | `LIMIT` after ranking |

**Ranking (deterministic):** CAE designation > HBCU + cyber program > enrollment desc > UNITID asc (stable tie-break).

---

## Appendix C — Open questions

1. **Worker hosting:** Fly.io vs Railway vs Supabase Edge (recommend dedicated Node worker per architecture doc).
2. **Scorecard bulk vs API:** Bulk preferred; confirm latest stable bulk URL in implementation ticket.
3. **CAE roster format:** HTML table vs PDF — build parser or manual quarterly CSV?
4. **Per-org geography defaults:** Should pilot orgs save favorite geographies in `organizations.settings`?
5. **Stub retirement date:** Target end of Phase 3F once real coverage ≥ 95% for pilot ICP queries.

---

*Documentation only. No application code. Implementation PRs should reference this document and `docs/phase-3-agentic-architecture.md` for schema and worker contracts.*
