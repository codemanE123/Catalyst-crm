# Phase 1 Security Sprint — Architecture Update

**Project:** Catalyst CRM  
**Document type:** Architecture delta (post–Phase 1)  
**Date:** 2026-07-03  
**Audience:** Engineering, Security, Leadership

---

## Purpose

This document describes how the Catalyst CRM architecture changed during Phase 1. It supersedes pre-Phase 1 assumptions documented in `docs/architecture-audit.md` and `docs/security-audit.md` for security-relevant concerns.

---

## Architecture overview (post–Phase 1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser (authenticated)                          │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ HTTPS (production) / HTTP (local dev)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Next.js 16 App Router (Catalyst CRM)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐  │
│  │ middleware.ts│  │ Server pages │  │ Client components (forms)   │  │
│  │ session gate │  │ + Server     │  │ DiscoveryInterviewForm, etc.  │  │
│  │ /, /schools/*│  │   Actions    │  │ Privacy copy (Task 14)        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────────┘  │
│         │                 │                                              │
│         │    ┌────────────┴────────────┐                                │
│         │    │     Application layer    │                                │
│         │    │  authz.ts  validation.ts │                                │
│         │    │  rateLimit  auditLog     │                                │
│         │    │  safeFetch (SSRF)        │                                │
│         │    │  supabase.ts (data+actions)│                              │
│         │    │  supabaseServer.ts       │                                │
│         │    └────────────┬────────────┘                                │
└─────────┼─────────────────┼────────────────────────────────────────────┘
          │                 │
          │ cookie session  │ anon key + JWT (user context)
          ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Supabase (Postgres + Auth)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐ │
│  │ Auth        │  │ CRM tables   │  │ rate_limit_ │  │ audit_events  │ │
│  │ (users)     │  │ + RLS        │  │ events      │  │ (append-only) │ │
│  └─────────────┘  └──────────────┘  └─────────────┘  └───────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ organizations · organization_members (app_role enum)              │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│              GitHub Actions CI (Task 15) — push / pull_request           │
│              npm ci → lint → build → audit (non-blocking)                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│     External public web (university research only, via safeFetch)      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Security architecture layers

### Layer 1: Edge / route protection

| Component | Responsibility |
| --- | --- |
| `middleware.ts` | Validates Supabase session cookie before `/` and `/schools/*` |
| Public routes | `/login`, `/logout`, `/auth/callback`, static assets |

**Change from Phase 0:** Dashboard was fully public; now requires authentication.

### Layer 2: Session & identity

| Component | Responsibility |
| --- | --- |
| `lib/supabaseServer.ts` | Creates request-scoped Supabase client from cookies |
| `requireUser()` | Resolves current `User` or null on server |
| Supabase Auth | Email/password (extensible to OAuth via callback route) |

**Change from Phase 0:** Static client with optional service role replaced by session-bound client.

### Layer 3: Application authorization

| Component | Responsibility |
| --- | --- |
| `lib/authz.ts` | Membership lookup, `requireRole()`, redaction policy |
| Server actions | Explicit role + org checks before mutations |
| `getSchoolProfileData()` | Field redaction for `read_only` |

**Roles:**

| Role | Mutations | Restricted field visibility |
| --- | --- | --- |
| `read_only` | Denied | Redacted in app layer |
| `sales` | Own org writes | Full |
| `admin` | Own org writes + deletes | Full |
| `super_admin` | All orgs | Full |

### Layer 4: Database enforcement (RLS)

| Helper | Behavior |
| --- | --- |
| `has_org_access(org_id)` | SELECT for org members + super_admin |
| `can_write_org(org_id)` | INSERT/UPDATE for sales, admin, super_admin |
| `can_manage_org(org_id)` | DELETE for admin, super_admin |

**Scoped tables:** `schools`, `contacts`, `outreach`, `interviews`, `follow_ups`

**Ownership columns:** `organization_id`, `created_by`, `updated_by`, `assigned_to`

**Change from Phase 0:** `using (true)` policies replaced with org-scoped least privilege.

### Layer 5: Input validation & abuse controls

| Component | Controls |
| --- | --- |
| `lib/validation.ts` | Zod schemas: UUIDs, enums, dates, URLs, max lengths |
| `lib/safeFetch.ts` | HTTPS-only, blocked IPs, redirect cap, 2MB response, 5s timeout |
| `lib/rateLimit.ts` | 10 interviews / 15 min; 3 research / 15 min per user |

### Layer 6: Observability

| Component | Behavior |
| --- | --- |
| `lib/auditLog.ts` | Metadata-only events; failures logged to console |
| `audit_events` table | Append-only; actor, org, action, table, record ID |

### Layer 7: Privacy (UX + data presentation)

| Control | Implementation |
| --- | --- |
| Field redaction | `read_only` placeholder for 5 restricted fields |
| Consent copy | Forms + README warn against PII/FERPA |
| Summary disclosure | Rule-based local summarization (not external LLM) |

---

## Data flow: key paths

### Read school profile

```
User → middleware (auth) → page → getSchoolProfileData()
  → Supabase SELECT (RLS filters org)
  → applyRedactionForCurrentUser() if read_only
  → Render with redacted UI
```

### Create interview note

```
Form → createInterviewNote (server action)
  → requireUser()
  → validateInterviewNote() [Zod]
  → enforceRateLimit()
  → requireRole(sales|admin|super_admin)
  → getSchoolOrganizationId() cross-org check
  → INSERT interviews (RLS + ownership fields)
  → recordAuditEvent(interview.create)
```

### University research

```
Form → researchUniversityProfile (server action)
  → requireUser() + requireRole() + rate limit
  → validateUniversityResearchInput()
  → safeFetchText(public HTTPS URLs)
  → Parse + upsert school profile
  → recordAuditEvent(run + save)
```

---

## Trust boundaries

| Boundary | Trust level | Enforcement |
| --- | --- | --- |
| Browser ↔ Next.js | Authenticated user | Middleware session |
| Next.js ↔ Supabase | User JWT via anon key | RLS + app guards |
| Next.js ↔ Public web | Untrusted remote content | safeFetch allow/deny |
| Developer ↔ GitHub | Code contributors | CI lint/build/audit |
| read_only ↔ Restricted data | Partial trust | App redaction only (gap) |

---

## Removed / deprecated patterns

| Pattern | Status |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` in request handlers | **Removed** |
| Broad RLS `using (true)` | **Removed** |
| Unauthenticated dashboard access | **Removed** |
| Unvalidated server action inputs | **Removed** |
| Unrestricted URL fetch in research | **Removed** |

---

## New infrastructure artifacts

| Artifact | Purpose |
| --- | --- |
| `organizations` / `organization_members` | Multi-tenant identity |
| `rate_limit_events` | Durable per-user throttling |
| `audit_events` | Sensitive action trail |
| `.github/workflows/ci.yml` | Automated quality/security gate |

---

## Architecture gaps (Phase 2 targets)

1. **Defense in depth for redaction** — move restricted-field policy to DB views or column grants.
2. **Admin plane** — membership management UI separated from CRM data plane.
3. **Async research jobs** — decouple outbound fetch from request thread; add domain allowlist.
4. **Observability stack** — structured logging, metrics, alerting on audit/rate-limit failures.
5. **Environment hardening** — fail closed without Supabase in staging/production.
6. **Test architecture** — security regression suite in CI alongside lint/build.

---

## Deployment topology (recommended)

| Environment | Supabase | Service role | Sample data | CI |
| --- | --- | --- | --- | --- |
| Local dev | Optional | Not used | Allowed if unset | Local commands |
| Staging | Required | Jobs only (future) | Disabled | PR workflow |
| Production | Required | Jobs only (future) | Disabled | PR + main workflow |

---

## Related documents

- `phase-1-security-completion-report.md`
- `phase-1-change-log.md`
- `docs/supabase-rls-audit.md`
- `docs/architecture-audit.md` (pre-Phase 1 baseline)
