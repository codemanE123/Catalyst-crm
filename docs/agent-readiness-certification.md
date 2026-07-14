# Agent readiness certification (Phase 4.14)

Formal go/no-go launch gate for enabling Catalyst agents in staging or production. Builds on the existing Agent Orchestrator, worker, operations dashboard, usage/safety limits, human approval, quality evaluation, prompt registry/rollouts, policy console, RBAC/RLS, audit logging, and incident/deployment runbooks.

This is **not** a second orchestrator, worker, simulation runner, or quality system. Certification **references** evidence from those systems and blocks unsafe enablement.

**UI:** `/agents/readiness`  
**Migration:** `supabase/migrations/20260714210000_agent_readiness_certifications.sql`

---

## Launch gate criteria

A production certification cannot be approved while any **blocking** check is `FAIL`. `WARNING` is never treated as `PASS` without an explicit policy decision (approvable only when there are zero blockers and overall is not `FAIL`).

Required gates (attested evidence + live references):

| Gate | Category |
| --- | --- |
| Latest migration applied | Deployment |
| Lint / unit tests / build / E2E smoke | Code quality / Reliability |
| RLS matrix + security headers | Data isolation / Security |
| Simulation suite (fresh, passing) | Agent safety |
| No open SEV-1/SEV-2 | Incident readiness |
| Quality + safety thresholds, citations, no critical flags | Quality |
| Active validated prompt + valid policy set | Prompt / Policy |
| Usage limits, budgets, retry policy | Cost / Reliability |
| Human approval enabled; no prohibited autonomy | Human review / Agent safety |
| Rollback + incident runbooks current | Rollback / Incident |
| Env vars verified; production Supabase + Vercel verified (prod only) | Deployment / Operations |

---

## Certification lifecycle

Statuses: `draft` → `in_review` → `approved` | `rejected` → (`expired` | `revoked`)

1. **Evaluate** — run readiness checks; results are serializable PASS/WARNING/FAIL with evidence, source, timestamp, remediation.
2. **Create draft** — stores evaluation snapshot; does not enable agents.
3. **Submit** — moves to `in_review`.
4. **Approve** — requires zero blocking failures; sets `approved_at` + `expires_at`.
5. **Reject** — returns to rejected with reason.
6. **Revoke** — audited with exact reason (never silent).
7. **Expire** — approved past `expires_at` becomes `expired` (blocks execution until renew).
8. **Renew** — creates a new draft from prior scope; full re-evaluation required.

There is **no auto-approve** and **no auto-enable** of production agents.

---

## Expiry

| Environment | Default expiry |
| --- | --- |
| production | 30 days (`AGENT_READINESS_PRODUCTION_EXPIRY_DAYS`) |
| staging | 14 days (`AGENT_READINESS_STAGING_EXPIRY_DAYS`) |

Approved rows must have both `approved_at` and `expires_at` (enforced in DB). Expired certifications are not valid for execution or production rollout activation.

---

## Revocation

Approved certifications are revoked (with audited reason) when:

- Active prompt version changes
- Active policy set changes
- Critical quality threshold breached (operator/incident path)
- SEV-1/SEV-2 incident opened (operator/process)
- Migration or security scan regressions
- Simulation suite fails
- Prohibited autonomy enabled
- Production env drift / rollback unavailable

Prompt activation and policy activation call `invalidateCertificationsForChange` so drift cannot stay silently certified.

### Incident-triggered revocation

When revoked due to an incident:

1. Link the incident / containment status in the revoke reason (and ops notes).
2. Follow `docs/incident-response-runbook.md` containment.
3. Recertify only after: incident contained, simulation re-pass, quality/safety thresholds recovered, and a new evaluation with fresh evidence.

---

## Role permissions

| Role | View | Evaluate / draft / submit (org) | Approve production / global | Revoke production / global |
| --- | --- | --- | --- | --- |
| `read_only` | No | No | No | No |
| `sales` | Limited summary | No | No | No |
| `admin` | Yes | Yes (org scope) | No | No (org staging revoke/reject allowed) |
| `super_admin` | Yes | Yes | Yes | Yes |

Existing RBAC is not weakened. Org isolation remains via RLS + membership checks.

---

## Separation of duties

When `AGENT_READINESS_REQUIRE_SEPARATION_OF_DUTIES=true`, if the reviewer also last modified the prompt, active policy, or production rollout, the evaluator emits a **WARNING** (non-blocking) and documents the soft limitation. Prefer a different `super_admin` for production approval when practical.

---

## Evidence sources

| Source | Used for |
| --- | --- |
| CI attestations (operator-supplied) | lint/test/build/e2e/migration/headers/RLS |
| `agent_simulation_runs` / simulation evidence adapter | Simulation coverage, seed, age |
| Quality evaluations | Avg quality/safety, citations, critical flags |
| Prompt registry | Active validated prompt version |
| Policy console | Active valid policy + limits/budgets/approval/autonomy |
| Ops docs | Rollback + incident runbook currency |
| Incident tracker (attested) | Open SEV-1/SEV-2 |

Simulation evidence older than `AGENT_READINESS_MAX_SIMULATION_AGE_HOURS` (default 168) is rejected.

Exports (JSON/CSV/markdown) omit secrets, raw prompts, tokens, and private CRM fields.

---

## Rollout protection

Before activating a **production** rollout (when readiness is enabled and production-required):

- Valid approved certification must exist for agent/environment/org (or matching global).
- Control/treatment prompt versions must match certification scope when a prompt is stamped.
- Policy set must match when stamped on the certification.
- Rollout percentage must not exceed approved max.

---

## Production execution blocking

When `AGENT_READINESS_ENABLED` and the environment requires certification:

1. Orchestrator resolves certification before queue insert.
2. Missing / expired / revoked / non-approved → deny with user-safe message and `reason_code: certification_denied`.
3. Denial is audited as `agent_readiness.execution_denied`.
4. Failure classification treats certification denials as **permanent** (not retried as transient).

Staging certification is **not** required by default (`AGENT_READINESS_STAGING_REQUIRED=false`).

---

## Audit actions

- `agent_readiness.evaluate`
- `agent_readiness.create`
- `agent_readiness.submit`
- `agent_readiness.approve`
- `agent_readiness.reject`
- `agent_readiness.revoke`
- `agent_readiness.expire`
- `agent_readiness.renew`
- `agent_readiness.execution_denied`

Metadata is sanitized (no secrets/prompts).

---

## Configuration

| Variable | Default |
| --- | --- |
| `AGENT_READINESS_ENABLED` | `true` |
| `AGENT_READINESS_PRODUCTION_REQUIRED` | `true` |
| `AGENT_READINESS_STAGING_REQUIRED` | `false` |
| `AGENT_READINESS_PRODUCTION_EXPIRY_DAYS` | `30` |
| `AGENT_READINESS_STAGING_EXPIRY_DAYS` | `14` |
| `AGENT_READINESS_MAX_SIMULATION_AGE_HOURS` | `168` |
| `AGENT_READINESS_REQUIRE_SEPARATION_OF_DUTIES` | `true` |
| `AGENT_READINESS_MIN_QUALITY_SCORE` | `3` |
| `AGENT_READINESS_MIN_SAFETY_SCORE` | `3` |
| `AGENT_READINESS_ENVIRONMENT` | inferred (`production` / `staging`) |

See `.env.example` and `docs/deployment-runbook.md` §6.6e.
