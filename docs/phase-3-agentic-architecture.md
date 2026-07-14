# Catalyst CRM — Phase 3 Agentic Architecture

**Status:** Design baseline plus Phase 4 implementation (orchestrator, worker, approvals, quality, prompt versioning)  
**Date:** July 14, 2026  
**Audience:** Engineering, product, security, pilot operations  
**Prerequisite:** Phase 2 Pilot Launch Track complete (`v0.4-pilot-ready` baseline)

**Related documents:**
- `docs/phase-2-roadmap.md` (deferred research v2: tasks 2.21–2.23; LLM: 2.27)
- `docs/ai-safety-audit.md`
- `docs/data-privacy-audit.md`
- `docs/supabase-rls-audit.md`
- `docs/agent-prompt-versioning.md` (Phase 4.11 prompt registry and rollouts)
- `docs/agent-policy-management.md` (Phase 4.12 policy console)
- `docs/agent-quality-evaluation.md` (Phase 4.10)
- `lib/universityResearch.ts` (legacy synchronous research — superseded by this design)

---

## 1. Vision

### 1.1 Problem statement

Phase 2 made Catalyst CRM a trustworthy daily workflow tool, but partnership teams still spend significant time on **manual prospecting**: finding schools, copying public profile data, guessing contacts, and drafting first-touch outreach. The disabled synchronous University Research Agent proved that long-running enrichment **must not block the UI** or run inside Vercel serverless request paths.

### 1.2 Phase 3 vision

> **An agentic CRM where machines do the prospecting work and humans approve what enters the pipeline.**

Catalyst becomes an **operating system for partnership development** with assistive agents that:

- Discover and enrich school prospects in the background
- Recommend contacts and outreach angles with evidence
- Never write to production CRM tables without human approval
- Remain modular, auditable, org-scoped, and cost-bounded

### 1.3 Design principles

| Principle | Meaning |
| --- | --- |
| **Zero manual prospecting entry** | Reps review and approve; they do not seed the pipeline by typing school names and websites. |
| **Background enrichment** | All agent work is async. The UI shows job status and a review queue — never a blocking spinner on submit. |
| **Human approval gate** | Staging tables hold agent output until an authorized user approves, edits, or rejects. |
| **Modular agents** | Narrow input/output contracts; orchestrator composes agents into pipelines. |
| **Evidence over assertion** | Every extracted field links to a source URL, snippet, and confidence score. |
| **Fail safe** | Low-confidence or conflicting output stays in review; agents never auto-promote. |

### 1.4 Success criteria

| Metric | Target (first pilot org) |
| --- | --- |
| Time from “start discovery” to first approvable candidate | < 15 minutes wall clock |
| Approved candidates requiring zero field edits | ≥ 70% |
| Unapproved writes to `schools` / `contacts` | 0 (verified in audit sample) |
| UI request timeout during agent work | 0 |
| Agent cost per approved school | Within contracted pilot budget |

### 1.5 What Phase 3 is not

- Autonomous email sending or outreach logging
- A replacement for discovery interviews and human relationship judgment
- A student data system or FERPA record store
- Cross-tenant prospect sharing or a global school database
- SOC 2 / enterprise certification (Phase 4+)

---

## 2. System architecture

### 2.1 High-level diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Catalyst CRM — Next.js App (Vercel)                      │
│                                                                             │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐   │
│  │ Dashboard   │  │ Prospect Review  │  │ School profile (existing)    │   │
│  │ + job badge │  │ Queue            │  │ + enrichment status          │   │
│  └──────┬──────┘  └────────┬─────────┘  └──────────────┬───────────────┘   │
│         │                  │                           │                   │
│         └──────────────────┴───────────────────────────┘                   │
│                            │                                               │
│              Server Actions / API routes (auth session + RLS)              │
└────────────────────────────┼───────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Supabase — Postgres + Auth + RLS                            │
│                                                                             │
│  ┌─────────────────────────┐    ┌──────────────────────────────────────┐   │
│  │ Core CRM (existing)     │    │ Phase 3 staging + observability      │   │
│  │ schools, contacts,      │    │ prospect_generation_jobs             │   │
│  │ outreach, interviews,   │    │ prospect_candidates                  │   │
│  │ follow_ups, ...         │    │ candidate_sources                    │   │
│  │                         │    │ agent_runs                           │   │
│  │                         │    │ agent_feedback                       │   │
│  └─────────────────────────┘    └──────────────────────────────────────┘   │
│  ┌─────────────────────────┐    ┌──────────────────────────────────────┐   │
│  │ audit_events            │    │ rate_limit_events (extended keys)    │   │
│  └─────────────────────────┘    └──────────────────────────────────────┘   │
└────────────────────────────▲────────────────────────────────────────────────┘
                             │ claim jobs / write staging rows
                             │
┌────────────────────────────┴────────────────────────────────────────────────┐
│              Agent Worker (dedicated process — not Vercel SSR)            │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐│
│  │ Orchestrator: claim → pipeline → persist staging → complete job        ││
│  └───────────────────────────────────────────────────────────────────────┘│
│       │           │            │              │              │             │
│       ▼           ▼            ▼              ▼              ▼             │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐      │
│  │Prospect │ │Research │ │ Contact  │ │ Outreach │ │ QA /        │      │
│  │Discovery│ │ Agent   │ │ Recommend│ │ Strategy │ │ Confidence  │      │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └────┬─────┘ └──────┬──────┘      │
└───────┼───────────┼───────────┼────────────┼──────────────┼───────────────┘
        │           │           │            │              │
        ▼           ▼           ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ External boundaries (SSRF-safe, allowlisted)                                │
│  • Public data APIs (IPEDS/NCES, state education directories)               │
│  • Allowlisted web domains (.edu, org-configured patterns)                  │
│  • AI provider (org opt-in, via abstraction layer — Section 7)            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Runtime responsibilities

| Component | Role | Constraints |
| --- | --- | --- |
| **Next.js app** | Auth, UI, enqueue jobs, review queue, approve/reject, promote to CRM | No long-running fetches or LLM calls in request path |
| **Postgres** | Source of truth; job queue via `FOR UPDATE SKIP LOCKED` | RLS on all new tables |
| **Agent worker** | Multi-step pipelines, web fetches, LLM calls | Horizontally scalable; lease-based claiming |
| **AI provider** | Structured extraction and drafting only | Accessed through abstraction layer; never receives secrets or full CRM exports |

### 2.3 Integration with existing CRM

| Existing artifact | Phase 3 disposition |
| --- | --- |
| `schools`, `contacts`, `outreach` | Unchanged schema; writes only via human-approved promotion |
| `lib/universityResearch.ts` | Heuristics absorbed into Research Agent; sync path retired |
| `UniversityResearchAgent.tsx` | Replaced by job enqueue + status UI |
| `lib/safeFetch.ts` | Reused by worker for SSRF-safe fetches |
| `audit_events`, `rate_limit_events` | Extended with prospect/agent action keys |
| Manual `SchoolForm` / CSV import | Retained for edge cases; not the primary prospecting path |

### 2.4 Agent module contract

```text
AgentModule {
  name:         string          // e.g. "research"
  version:      string          // semver for reproducibility
  inputSchema:  JSON Schema
  outputSchema: JSON Schema
  run(ctx, input): Promise<AgentRunResult>
}

AgentRunResult {
  output:    object
  sources:   CandidateSourceDraft[]
  warnings:  string[]
  usage?:    { provider, model, inputTokens, outputTokens, estimatedCostUsd }
}
```

Agents are **pure over their contract** — side effects occur only through the orchestrator writing to staging tables and `agent_runs`.

---

## 3. Agent responsibilities

Five modular agents compose the default prospecting pipeline. None write to `schools`, `contacts`, or `outreach` directly.

### 3.1 Prospect Discovery Agent

| | |
| --- | --- |
| **Purpose** | Find net-new school prospects matching org-defined ideal customer profile (ICP) criteria |
| **Input** | ICP: states, sectors, enrollment band, program keywords, HBCU/CC flags, max count |
| **Output** | `ProspectSeed[]`: name, website guess, district, location, discovery rationale |
| **Sources** | IPEDS/NCES open data, state education directories, allowlisted search APIs |
| **Does not** | Scrape arbitrarily at scale, guess private emails, or create CRM rows |

### 3.2 Research Agent

| | |
| --- | --- |
| **Purpose** | Enrich a prospect (or re-enrich an existing school) with public institutional profile data |
| **Input** | School name, website URL, optional existing `school_id` |
| **Output** | Profile fields (enrollment, programs, offices, public/private, state) + source drafts |
| **Evolution** | Async replacement for `lib/universityResearch.ts`; implements Phase 2 tasks 2.21–2.23 intent |
| **Does not** | Fetch non-allowlisted domains, scrape login-gated pages, or write to `schools` |

### 3.3 Contact Recommendation Agent

| | |
| --- | --- |
| **Purpose** | Suggest likely decision-maker roles and public contact paths |
| **Input** | Enriched profile + public staff directory pages (if found) |
| **Output** | Ranked `ContactSuggestion[]`: role, name (if public), confidence, public URL, rationale |
| **Does not** | Auto-create `contacts`, send email, or fabricate direct emails without evidence |

### 3.4 Outreach Strategy Agent

| | |
| --- | --- |
| **Purpose** | Propose outreach plan and draft messaging angles — not auto-send |
| **Input** | Profile, contact suggestions, org-approved playbook snippets |
| **Output** | `OutreachPlan`: channel, subject lines, talking points, suggested `next_step` |
| **Does not** | Send email, log outreach, or overwrite user content without explicit “Apply” action |

### 3.5 QA / Confidence Agent

| | |
| --- | --- |
| **Purpose** | Quality gate before candidates surface in the human review queue |
| **Input** | Aggregated upstream outputs + `candidate_sources` |
| **Output** | `confidence_score`, per-field confidence, `review_status`, duplicate flags |
| **Rules** | Conflicting facts → `needs_review`; no sources for required field → cap confidence; injection patterns in scraped text → flag and strip from LLM context; dedup against `schools` and pending candidates |
| **Position** | Runs last; can hide candidates (`review_status = reject`) from default queue |

### 3.6 Default pipeline order

```
Prospect Discovery → Research → Contact Recommendation → Outreach Strategy → QA / Confidence
```

`enrich_school` and `refresh_sources` job types run subsets (Research → QA, or Research only).

---

## 4. Background job pipeline

### 4.1 Job types

| `job_type` | Trigger | Pipeline |
| --- | --- | --- |
| `discover_prospects` | User submits ICP + count | Full pipeline per candidate |
| `enrich_candidate` | Re-run on one staging candidate | Research → Contact → Outreach → QA |
| `enrich_school` | Re-enrich existing CRM school | Research → QA (overlay, not live mutation) |
| `refresh_sources` | Scheduled or manual | Research only |

### 4.2 Job state machine

```
                    ┌──────────┐
                    │ pending  │◄──── requeue / stale lease reclaim
                    └────┬─────┘
                         │ worker claim
                         ▼
                    ┌──────────┐
                    │ claimed  │
                    └────┬─────┘
                         │ first agent run starts
                         ▼
                    ┌──────────┐
         ┌─────────│ running  │─────────┐
         │         └────┬─────┘         │
         │              │               │
         ▼              ▼               ▼
   ┌──────────┐  ┌───────────┐  ┌───────────┐
   │ failed   │  │ completed │  │ cancelled │
   └──────────┘  └───────────┘  └───────────┘
```

### 4.3 Queue implementation

**Postgres-backed queue** (Phase 2 roadmap recommendation: DB first, not Redis).

```sql
-- Conceptual claim (design only)
SELECT id FROM prospect_generation_jobs
WHERE status = 'pending'
  AND (scheduled_at IS NULL OR scheduled_at <= now())
ORDER BY priority DESC, created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

| Mechanism | Value |
| --- | --- |
| **Lease TTL** | 300 seconds default; stale claims return to `pending` via cron |
| **Retries** | `attempt_count < max_attempts` (default 3); exponential backoff on `scheduled_at` |
| **Parallelism** | `max_parallel_candidates` per job (default 5) |
| **Idempotency** | Dedup key: `job_id` + `agent_name` + `candidate_id` in `agent_runs` |

### 4.4 Orchestrator steps

1. Claim job → set `claimed_at`, `claimed_by` (worker instance id)
2. Insert orchestrator `agent_runs` row → `status = running`
3. Run agents in pipeline order; each agent gets a child `agent_runs` row
4. Upsert `prospect_candidates`, `candidate_sources`
5. Run QA agent; set `review_status` and `confidence_score` on candidates
6. Set job `status = completed`, write `summary` JSON (counts: discovered, surfaced, flagged, failed)
7. On terminal failure: `status = failed`, sanitized `error_code` / `error_message`

### 4.5 UI interaction (non-blocking)

| User action | Response |
| --- | --- |
| “Start discovery” | `INSERT` job → return `job_id` immediately (< 200 ms) |
| Dashboard | Read job counts + review queue badge; no wait for worker |
| Job detail | Poll every 5 s or Supabase Realtime on `prospect_generation_jobs` (Phase 3B+) |
| Approve candidate | Server action: promote to CRM in a transaction (Section 6) |

### 4.6 Error handling and retries

| Error code | Retry? | Behavior |
| --- | --- | --- |
| `SOURCE_FETCH_TIMEOUT` | Yes (per URL, max 2) | Partial profile; warning on candidate |
| `SOURCE_BLOCKED` | No for that URL | Skip source; log in `agent_runs.warnings` |
| `LLM_RATE_LIMIT` | Yes (exponential backoff) | Reschedule agent run |
| `LLM_SCHEMA_INVALID` | Once (stricter prompt) | Then flag `needs_review` |
| `DUPLICATE_CANDIDATE` | No | `review_status = reject` |
| `QUOTA_EXCEEDED` | No | Job → `failed`; user message |
| `WORKER_LEASE_EXPIRED` | Job → `pending` | Transparent retry |

**Partial success:** Job can `complete` with `summary.failed_candidates > 0`. UI shows per-candidate error badges; user can spawn `enrich_candidate` retry.

**Scheduled maintenance crons:**

| Schedule | Task |
| --- | --- |
| Hourly | Reclaim stale leases; retry eligible failures |
| Daily | Purge expired rejected candidates (retention policy) |
| Weekly (opt-in) | Re-enrich stale profiles (`fetched_at` > 90 days) |

---

## 5. Database schema additions

All new tables include `organization_id`, `created_at`, `updated_at`, and RLS policies consistent with `docs/supabase-rls-audit.md`.

### 5.1 Entity relationship diagram

```
organizations
      │
      ├──< prospect_generation_jobs
      │         │
      │         ├──< agent_runs (parent_run_id → self)
      │         │
      │         └──< prospect_candidates
      │                   │
      │                   ├──< candidate_sources
      │                   └──< agent_feedback
      │
      └──< schools  ←── promoted_school_id (after human approve)
```

### 5.2 `prospect_generation_jobs`

**Purpose:** Top-level async work unit; drives agent pipeline and UI job status.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK → `organizations` | Tenant boundary |
| `created_by` | `uuid` FK → `auth.users` | Who enqueued |
| `job_type` | `text` / enum | `discover_prospects`, `enrich_candidate`, `enrich_school`, `refresh_sources` |
| `status` | `text` / enum | `pending`, `claimed`, `running`, `completed`, `failed`, `cancelled` |
| `priority` | `smallint` | Default 0 |
| `input` | `jsonb` | ICP criteria, target ids, options |
| `summary` | `jsonb` | Result counts and warnings |
| `error_code` | `text` | Machine-readable |
| `error_message` | `text` | Sanitized, user-facing |
| `attempt_count` | `int` | Default 0 |
| `max_attempts` | `int` | Default 3 |
| `scheduled_at` | `timestamptz` | Delayed start / backoff |
| `claimed_at` | `timestamptz` | Worker lease |
| `claimed_by` | `text` | Worker instance id |
| `started_at` | `timestamptz` | |
| `completed_at` | `timestamptz` | |
| `cancelled_at` | `timestamptz` | |
| `cancelled_by` | `uuid` | |

**Relationships:** → `organizations`; ← `agent_runs`, `prospect_candidates`  
**Indexes:** `(organization_id, status, created_at)`, `(status, scheduled_at)`

---

### 5.3 `prospect_candidates`

**Purpose:** Staging record for a school prospect. **Human approval happens here.**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK | |
| `job_id` | `uuid` FK → `prospect_generation_jobs` | |
| `status` | `text` / enum | `pending_review`, `approved`, `rejected`, `promoted`, `expired` |
| `review_status` | `text` | QA output: `auto_surface`, `needs_review`, `reject` |
| `confidence_score` | `numeric(4,3)` | 0–1 overall |
| `duplicate_of_school_id` | `uuid` FK → `schools` nullable | Dedup hint |
| `promoted_school_id` | `uuid` FK → `schools` nullable | Set on promote |
| `name` | `text` | |
| `website` | `text` | |
| `district` | `text` | |
| `location` | `text` | |
| `proposed_status` | `text` | Default `Prospect` |
| `proposed_owner` | `text` | |
| `proposed_next_step` | `text` | From Outreach Strategy agent |
| `profile` | `jsonb` | Enriched institutional fields |
| `contact_suggestions` | `jsonb` | From Contact Recommendation agent |
| `outreach_plan` | `jsonb` | Draft angles and channels |
| `field_confidence` | `jsonb` | Per-field scores from QA |
| `reviewed_by` | `uuid` | |
| `reviewed_at` | `timestamptz` | |
| `rejection_reason` | `text` | |
| `promoted_at` | `timestamptz` | |

**Relationships:** → `prospect_generation_jobs`, `schools`; ← `candidate_sources`, `agent_feedback`  
**Indexes:** `(organization_id, status)`, `(job_id)`

---

### 5.4 `candidate_sources`

**Purpose:** Provenance for every extracted fact; supports audit, re-fetch, and confidence scoring.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK | |
| `candidate_id` | `uuid` FK → `prospect_candidates` | ON DELETE CASCADE |
| `agent_run_id` | `uuid` FK → `agent_runs` nullable | |
| `field_path` | `text` | e.g. `profile.enrollment` |
| `source_type` | `text` | `web_page`, `api`, `search_result`, `llm_inference` |
| `source_url` | `text` | HTTPS only |
| `source_title` | `text` | |
| `snippet` | `text` | Truncated evidence (max 2 KB) |
| `snippet_hash` | `text` | SHA-256 for change detection |
| `fetched_at` | `timestamptz` | |
| `confidence` | `numeric(4,3)` | |
| `is_primary` | `boolean` | Winning source when conflicts exist |

**Relationships:** → `prospect_candidates`, `agent_runs`  
**Indexes:** `(candidate_id)`, `(candidate_id, field_path)`

---

### 5.5 `agent_runs`

**Purpose:** Observability, debugging, cost attribution, and reproducibility per agent invocation.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK | |
| `job_id` | `uuid` FK → `prospect_generation_jobs` | |
| `parent_run_id` | `uuid` FK → `agent_runs` nullable | Pipeline tree |
| `agent_name` | `text` | `prospect_discovery`, `research`, etc. |
| `agent_version` | `text` | Semver |
| `status` | `text` | `pending`, `running`, `succeeded`, `failed`, `skipped` |
| `input` | `jsonb` | Redacted snapshot |
| `output` | `jsonb` | Structured result |
| `warnings` | `jsonb` | string array |
| `error_code` | `text` | |
| `error_message` | `text` | Sanitized |
| `started_at` | `timestamptz` | |
| `completed_at` | `timestamptz` | |
| `duration_ms` | `int` | |
| `model_provider` | `text` | nullable |
| `model_name` | `text` | nullable |
| `input_tokens` | `int` | |
| `output_tokens` | `int` | |
| `estimated_cost_usd` | `numeric(10,6)` | |

**Relationships:** → `prospect_generation_jobs`, `agent_runs` (self); ← `candidate_sources`, `agent_feedback`  
**Retention:** Raw `input`/`output` purged after 30 days; metadata retained 12 months.

---

### 5.6 `agent_feedback`

**Purpose:** Human corrections and ratings for offline eval and prompt tuning.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK | |
| `candidate_id` | `uuid` FK → `prospect_candidates` | |
| `agent_run_id` | `uuid` FK → `agent_runs` nullable | |
| `submitted_by` | `uuid` FK → `auth.users` | |
| `feedback_type` | `text` | `approval`, `rejection`, `field_correction`, `quality_rating` |
| `field_path` | `text` | nullable |
| `original_value` | `jsonb` | |
| `corrected_value` | `jsonb` | |
| `rating` | `smallint` | 1–5 |
| `comment` | `text` | |
| `created_at` | `timestamptz` | |

**Relationships:** → `prospect_candidates`, `agent_runs`  
**Note:** Aggregated patterns inform prompt updates; raw feedback is not auto-injected into live prompts.

---

## 6. Human review workflow

Human approval is the **only path** from agent output to production CRM. Agents never bypass this gate.

### 6.1 Review queue UX

```
┌─────────────────────────────────────────────────────────────────┐
│ Prospect Review Queue                          [3 need review]  │
├─────────────────────────────────────────────────────────────────┤
│ Filter: [All] [High confidence] [Needs review] [Rejected hidden]│
├─────────────────────────────────────────────────────────────────┤
│ ○ Roosevelt High School          Confidence: 0.91  [Review]   │
│ ○ Lincoln Academy                Confidence: 0.62  [Review]   │
│ ○ Westview Prep (duplicate?)     Confidence: 0.44  [Review]   │
└─────────────────────────────────────────────────────────────────┘
```

Default view shows `review_status IN (auto_surface, needs_review)` and `status = pending_review`. Rejected candidates are hidden unless filter expanded.

### 6.2 Review detail screen

For each candidate, the reviewer sees:

- Proposed school fields with per-field confidence badges
- `candidate_sources` evidence panel (expandable snippets + URLs)
- Contact suggestions (checkboxes — user selects which to promote)
- Outreach plan draft (optional “Copy to clipboard” / “Apply as next step”)
- Duplicate warning if `duplicate_of_school_id` is set
- Actions: **Approve**, **Edit & Approve**, **Reject**, **Re-run enrichment**

### 6.3 Approve flow

```
Reviewer clicks Approve (or Edit & Approve)
        │
        ▼
Confirm dialog (existing Phase 2 H6 pattern for destructive-adjacent actions)
        │
        ▼
BEGIN TRANSACTION
  1. INSERT schools (...) FROM candidate fields
  2. INSERT contacts (...) FOR each user-selected suggestion
  3. UPDATE prospect_candidates
       SET status = promoted, promoted_school_id, reviewed_by, reviewed_at
  4. INSERT agent_feedback (feedback_type = approval, corrections if any)
  5. INSERT audit_events (prospect.candidate_approve, school.create)
COMMIT
        │
        ▼
revalidatePath dashboard + school profile
```

**Idempotency:** Approve action keyed on `candidate_id` + `reviewed_at`; duplicate submit returns existing `promoted_school_id`.

### 6.4 Reject flow

```
Reviewer clicks Reject → optional reason
        │
        ▼
UPDATE prospect_candidates SET status = rejected, rejection_reason
INSERT agent_feedback (feedback_type = rejection)
INSERT audit_events (prospect.candidate_reject)
```

Rejected candidates retained 90 days then `status = expired` (configurable).

### 6.5 Re-enrichment of existing schools

Agents **do not mutate** live `schools` rows. `enrich_school` jobs write a staging overlay linked via `duplicate_of_school_id`. Reviewer sees a **diff view** (current CRM vs. proposed enrichment) and explicitly applies approved fields.

### 6.6 Role permissions

| Role | View queue | Approve / reject | Enqueue discovery |
| --- | --- | --- | --- |
| `read_only` | Yes (redacted contact emails) | No | No |
| `sales` | Yes | Yes | Yes |
| `admin` | Yes | Yes | Yes |
| `super_admin` | Yes | Yes | Yes |

---

## 7. AI provider abstraction

Phase 3 introduces a **provider-agnostic layer** so agents can use heuristics-only mode (no external AI) or an org-opt-in LLM without coupling agent logic to a vendor SDK.

### 7.1 Layer diagram

```
┌─────────────────────────────────────────┐
│ Agent modules (Research, Outreach, QA)  │
└──────────────────┬──────────────────────┘
                   │ structured request
                   ▼
┌─────────────────────────────────────────┐
│ lib/ai/AssistiveProvider (interface)    │
│  • completeStructured<T>(request)       │
│  • estimateCost(request)                │
│  • healthCheck()                        │
└──────────────────┬──────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
┌────────────┐ ┌────────┐ ┌─────────────┐
│ Heuristic  │ │ OpenAI │ │ Anthropic   │
│ Provider   │ │Adapter │ │ Adapter     │
│ (default)  │ │        │ │ (future)    │
└────────────┘ └────────┘ └─────────────┘
```

### 7.2 Interface contract

```text
StructuredCompletionRequest {
  feature:        string       // e.g. "research.extract_profile"
  organizationId: string
  schema:         JSON Schema  // strict output shape
  systemPrompt:   string       // fixed, versioned per agent
  userContent:    string       // untrusted, delimited source text
  maxInputTokens: number
  maxOutputTokens: number
  modelTier:      "fast" | "capable"
}

StructuredCompletionResult<T> {
  data:           T
  provider:       string
  model:          string
  inputTokens:    number
  outputTokens:   number
  estimatedCostUsd: number
  cached:         boolean
}
```

### 7.3 Provider selection

| Condition | Provider used |
| --- | --- |
| `ASSISTIVE_LLM_ENABLED=false` | Heuristic only |
| Org `settings.agentic_enabled=false` | Heuristic only |
| Org quota exhausted | Heuristic only; warning on run |
| LLM enabled + quota available | Configured adapter (`AI_PROVIDER=openai` etc.) |

### 7.4 Prompt safety patterns

- System instructions are **versioned and stored in code**, not user-editable at runtime
- Untrusted scraped text wrapped in explicit delimiters; instruction to ignore embedded commands
- JSON Schema validation on every response; one retry with stricter prompt on schema failure
- No secrets, service keys, or broad database context in prompts
- PII stripper runs before LLM call (emails, phones, SSN patterns)

### 7.5 Caching and cost

| Mechanism | Purpose |
| --- | --- |
| Cache key = `hash(schema + systemPromptVersion + userContent)` | 24 h TTL; reduces duplicate token spend |
| `agent_runs` token columns | Per-org cost dashboards |
| `modelTier: fast` for QA | Cheaper validation pass |
| `modelTier: capable` for Outreach Strategy | Higher quality drafts |
| Pre-LLM heuristic pass | Skip LLM when heuristic confidence ≥ 0.85 |

### 7.6 Logging policy

| Logged | Not logged |
| --- | --- |
| Feature name, org id, user id, model, token counts, cost, latency | Raw prompts and completions (default) |
| Error codes and schema validation failures | Contact names, emails, interview notes |

Optional debug mode (super_admin only, 24 h): stores redacted prompt hash + response hash for support.

---

## 8. Security and privacy

### 8.1 Tenant isolation

- All five new tables carry `organization_id` with RLS matching existing CRM patterns
- Worker uses service role only through narrow RPCs (`claim_next_job`, `complete_agent_run`)
- Service role **cannot** call promotion RPCs — those require authenticated user session

### 8.2 Network security

- Reuse `lib/safeFetch.ts` SSRF protections in the worker
- Domain allowlist per org (`.edu` default; admin-configured patterns)
- Block private IP ranges, non-HTTPS, and unknown TLDs unless allowlisted
- Max response bytes and timeout per fetch (carry forward Phase 2 limits)

### 8.3 Data classification

| Data | Classification | Agent handling |
| --- | --- | --- |
| NCES / public web profile | Public | Fetch and store with source URL |
| Contact suggestions | Confidential | Staging only until approve; redacted in `agent_runs.input` |
| Outreach drafts | Internal | Staging only; never auto-sent |
| Promoted CRM records | Per existing CRM policy | Standard RLS after approval |

### 8.4 Human approval as security control

Prevents agent compromise, prompt injection, or model hallucination from directly polluting `schools` / `contacts`. Even `review_status = auto_surface` candidates require explicit approve — no silent promotion.

### 8.5 Consent and compliance

| Requirement | Implementation |
| --- | --- |
| Org opt-in before LLM | `organizations.settings.agentic_enabled` + admin acknowledgment |
| Disclosure | UI states provider name, data sent, and that outputs require review |
| FERPA / student data | Agents do not process student-level records; UI warns against pasting PII |
| Audit trail | `audit_events` for job create, approve, reject; `agent_runs` for cost |
| Rate limits | Extend `rate_limit_events`: `prospect_discovery`, `agent_enrich`, `llm_call` |
| Retention | Rejected candidates 90 days; `agent_runs` I/O 30 days |

### 8.6 Suggested audit actions

| Action | When |
| --- | --- |
| `prospect.job_create` | Job enqueued |
| `prospect.job_cancel` | User cancelled |
| `prospect.candidate_approve` | Promoted to CRM |
| `prospect.candidate_reject` | Rejected |
| `agent.run_failed` | Terminal agent failure (metadata only) |

---

## 9. Rollout plan (Phase 3A–3D)

Phase 3 ships in four increments. Each phase has a gate before the next begins.

### Phase 3A — Foundation (weeks 1–3)

**Goal:** Async job infrastructure and staging schema without external LLM.

| Deliverable | Details |
| --- | --- |
| Migrations | All five tables + RLS + indexes |
| Agent worker v1 | DB queue claim, lease reclaim cron, orchestrator skeleton |
| `discover_prospects` job | Heuristic-only Prospect Discovery (NCES API) |
| Research Agent | Port `lib/universityResearch.ts` heuristics to async worker |
| QA Agent | Rules-based confidence (no LLM) |
| UI | Job status badge + empty review queue shell |
| Kill switch | `AGENTIC_ENABLED=false` env flag |

**Gate:** Job completes end-to-end in staging; zero writes to `schools` without approve action; no Vercel timeouts.

---

### Phase 3B — Human review loop (weeks 4–5)

**Goal:** Complete approve/reject workflow; first pilot org can onboard prospects.

| Deliverable | Details |
| --- | --- |
| Review queue UI | List, filter, detail with sources panel |
| Approve / reject / edit flows | Transactional promotion to `schools` + optional `contacts` |
| `agent_feedback` capture | Field corrections on edit-approve |
| Confirm dialogs | Approve uses existing accessible modal pattern (Phase 2 H6) |
| Contact Recommendation Agent | Role-level suggestions (heuristic) |
| Outreach Strategy Agent | Template-based drafts (no LLM) |
| Audit + rate limits | New action keys enforced |
| Supabase Realtime | Job status updates (replace polling) |

**Gate:** Pilot org approves 10+ candidates; audit confirms no unapproved CRM writes; median review time < 3 min per candidate.

---

### Phase 3C — LLM assistive layer (weeks 6–8)

**Goal:** Optional AI enrichment with abstraction layer, quotas, and cost controls.

| Deliverable | Details |
| --- | --- |
| `lib/ai/AssistiveProvider` | Interface + Heuristic + OpenAI adapters |
| Org opt-in | `organizations.settings.agentic_enabled` + admin UI |
| LLM in Research + Outreach agents | Structured extraction and draft polish |
| QA Agent LLM pass | Conflict detection and injection flagging |
| Cost dashboard | Admin view: tokens and `estimated_cost_usd` by week |
| Quotas | Per-org monthly token cap; per-user daily job cap |
| Domain allowlist admin UI | Phase 2 task 2.23 intent |
| `enrich_school` job | Diff view for existing CRM schools |

**Gate:** Legal/DPA sign-off for pilot org; LLM can be disabled per org without code deploy; cost stays within pilot budget for 30-day window.

---

### Phase 3D — Scale and intelligence (weeks 9–12)

**Goal:** Harden for 5–15 pilot orgs; improve agent quality from feedback.

| Deliverable | Details |
| --- | --- |
| Worker horizontal scaling | Multiple worker instances; `SKIP LOCKED` verified under load |
| Source cache | `snippet_hash` dedup; 24 h TTL |
| Scheduled re-enrichment | Weekly opt-in stale profile refresh |
| Eval pipeline | Aggregate `agent_feedback` into offline test sets |
| Prompt version management | `agent_version` bump process documented |
| `read_only` safe view | Redacted candidate queue for observers |
| Ambassador hook (optional) | “Refer a school” → `discover_prospects` with seed URL |
| Redis queue (optional) | Only if DB claim latency > 200 ms p99 under load |

**Gate:** 5 orgs onboarded; p99 job claim < 500 ms; agent-sourced pipeline ≥ 50% of new schools; zero Sev-1 security incidents.

---

### Rollout summary

| Phase | Duration | LLM | CRM writes | Pilot orgs |
| --- | --- | --- | --- | --- |
| **3A** Foundation | 3 weeks | No | None (staging only) | Internal dev |
| **3B** Review loop | 2 weeks | No | Approve-gated | 1 pilot org |
| **3C** LLM layer | 3 weeks | Opt-in | Approve-gated | 1–3 pilot orgs |
| **3D** Scale | 4 weeks | Opt-in | Approve-gated | 5–15 pilot orgs |

### Explicit non-goals (all phases)

- Auto-approve high-confidence candidates
- Autonomous email send or outreach logging
- Cross-tenant prospect sharing
- Training custom models on customer CRM data without explicit contract
- Auto-promote prompt treatment variants (Phase 4.11 requires manual promote)

### Phase 4.11 — Prompt versioning (implemented)

See `docs/agent-prompt-versioning.md`. Agents resolve stamped `prompt_version_id` / `experiment_variant` through the existing orchestrator queue path. Prompt registry and rollouts live under `/agents/prompts` and `/agents/rollouts` with org-scoped RLS.

### Phase 4.12 — Policy management console (implemented)

See `docs/agent-policy-management.md`. Organization/global policy sets resolve over system defaults and stamp `policy_set_id` / limits onto executions. Admin UI: `/agents/policies`. Break-glass is super_admin-only with expiry and audit.

---

## Appendix A — Cost control defaults (pilot)

| Meter | Default limit |
| --- | --- |
| Discovery jobs / org / day | 2 |
| Candidates per job | 25 |
| Web fetches / candidate | 5 |
| LLM input tokens / org / month | 500,000 |
| Concurrent running jobs / org | 1 |

---

## Appendix B — Open questions

1. **Worker hosting:** Dedicated Node on Fly/Railway vs. Supabase Edge Functions? (Recommendation: dedicated worker for long fetches.)
2. **Dedup key:** Normalized website domain primary vs. name + district? (Recommendation: domain primary, name fallback.)
3. **Bulk approve:** Allow multi-select approve for `auto_surface` tab? (Recommendation: yes in 3B, still explicit user action.)
4. **Merge with Phase 2 task 2.21:** Unify `candidate_sources` and planned `school_research_sources` in 3D? (Recommendation: yes.)

---

*Documentation only. No application code changes. Implementation PRs should follow `docs/phase-2-roadmap.md` Section 17: independent tasks, tests, rollback plans, and commit messages.*
