# Phase 5.1 — Production Integration Readiness Audit

**Date:** 2026-07-14  
**Scope:** Verify Phase 3 and Phase 4 agent architecture consistency before enabling new external provider integrations.  
**Constraint:** No new external providers connected in this phase.  
**Verdict:** **NOT READY** for Phase 5.2 provider integration until blocking issues below are resolved (or formally deferred with compensating controls).

---

## Overall summary

| Dimension | Result | Blocking? |
| --- | --- | --- |
| Module singletons (design) | **PASS** | No |
| Runtime constructor / cron wiring | **FAIL** | **Yes** |
| Product path vs orchestrator spine | **FAIL** | **Yes** |
| Handler completeness | **FAIL** | **Yes** |
| Phase 4.13 simulation framework | **FAIL** | **Yes** (for readiness evidence integrity) |
| Readiness certification gate completeness | **FAIL** | **Yes** |
| Readiness evidence honesty (`buildEvidenceBundle`) | **FAIL** | **Yes** |
| Usage / budget controls (orchestrator path) | **PASS** / **WARNING** | Wiring-dependent |
| Human approval center | **PASS** | No |
| Quality evaluation | **PASS** (post-hoc) / **WARNING** (not an execution gate) | Non-blocking for integration prep |
| Prompt registry + rollouts | **PASS** (modules) / **WARNING** (cron skips stamps) | Related to cron FAIL |
| Policy management | **PASS** (modules) / **WARNING** (cron skips stamps) | Related to cron FAIL |
| Prohibited autonomy (practical) | **PASS** | No |
| Sensitive data scrubbing for LLM | **PASS** | No |
| Org isolation / RLS / audit | **PASS** | No |
| Migrations order + docs | **PASS** / minor **WARNING** | Non-blocking |
| Environment variable documentation | **PASS** / minor **WARNING** | Non-blocking |
| `npm test` / `lint` / `build` | **PASS** (with flaky-timeout **WARNING**) | Non-blocking |

---

## Methodology

Reviewed source for:

- Prospect generation jobs, candidates, approval flow
- Agent orchestrator, background worker, retry policy
- Usage/budget, human approval, quality evaluation
- Prompt registry, rollouts, policy management
- Simulation evidence, readiness certification
- Organization isolation, audit logging, env configuration

Commands run:

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | **328/329** then full re-check of flaky file **4/4 PASS** | Full suite once timed out at 5s on `tests/actions/agentOperations.test.ts` (“denies sales users…”) under parallel load; isolated re-run passed (1043ms). |
| `npm run lint` | **PASS** | Exit 0 |
| `npm run build` | **PASS** | Next.js 16.2.10; routes include `/agents/readiness`, `/agents/policies`, `/agents/prompts`, `/agents/rollouts`, `/approvals`, `/api/agents/process` |

---

## 1. Singleton verification

| System | Count / design | Status | Evidence | Remediation | Blocking |
| --- | --- | --- | --- | --- | --- |
| Agent orchestrator | One `AgentOrchestrator` class | **PASS** | `lib/agents/orchestrator.ts` | — | No |
| Background worker | One `AgentWorker` + one `processAgentExecutionBatch` | **PASS** | `lib/agents/worker.ts`, `lib/agents/batchWorker.ts` | Unify constructors (see §3) | Related YES |
| Policy resolver | One pure `resolveAgentPolicy`; Supabase + in-memory adapters | **PASS** | `lib/agents/policies/resolve.ts`, `supabase.ts`, `service.ts` | — | No |
| Prompt registry | One `PROMPT_CATALOG` + DB versions | **PASS** | `lib/agents/prompts/registry.ts` | — | No |
| Usage tracking | One `recordLlmUsageEvent` + `AgentUsageStore` | **PASS** | `lib/agents/usage.ts`, `usageStore.ts` | Ensure all workers pass usage store | No |
| Approval aggregation | One Approval Center | **PASS** | `app/approvals/page.tsx`, `lib/approvals/data.ts` | — | No |
| Readiness certification | One evaluate/service/UI path | **PASS** | `lib/agents/readiness/*`, `app/agents/readiness` | Fix gate fail-closed (see §5) | Related YES |

**Conflicting constructors (not duplicate classes, but divergent runtime wiring):**

| Factory / entry | Prompt stamp | Policy stamp | Certification | Handler deps | Usage store |
| --- | --- | --- | --- | --- | --- |
| `createAgentWorkerFromSupabase` | Yes | Yes | Yes | Optional (partial today) | Optional |
| `processAgentExecutionsFromCron` | **No** | **No** | **No** | Default registry → **stubs** | Yes |
| Ops `retryAgentExecution` / `cancelAgentExecution` | No | No | No | N/A (retry/cancel only) | Yes (usage store constructed) |

Status: **FAIL** — production cron path is not equivalent to the gated worker factory.

---

## 2. Incomplete, stub, placeholder, and dual-path findings

| Finding | Status | Evidence | Remediation | Blocking |
| --- | --- | --- | --- | --- |
| Cron orchestrator uses default handlers; missing deps return **`worker_stub` success** | **FAIL** | `lib/agents/batchWorker.ts` L150–155; `lib/agents/handlers.ts` L103–110, L137–144, L171–178, etc. | Cron must use full handler deps or **fail closed** when deps missing | **Yes** |
| Handler factory omits prospect generation / enrichment / outreach | **FAIL** | `lib/actions/agentHandlerDependencies.ts` wires only contact/meeting/proposal | Wire prospect handlers or fail closed | **Yes** |
| Future agents return “not implemented yet” | **WARNING** | `lib/agents/handlers.ts` `futureAgentResult` | Keep out of production pipelines; fail closed if queued | No |
| Prospect generator stub fallback when Scorecard key missing | **WARNING** | `lib/prospectSources/index.ts`; UI mentions stub | Require real provider or explicit non-prod stub flag before Phase 5.2 | Recommended before live data |
| Product CRM agent actions bypass orchestrator `queueAgent` | **FAIL** | Prospect generation / enrich / outreach / meeting / proposal actions do not call `queueAgent` (no match in `lib/actions/prospectGeneration.ts`) | Route Phase 5 provider calls through orchestrator **or** document dual-path and gate both | **Yes** for unified gating claim |
| `processNextAgentExecution` unused by UI | **WARNING** | Used in tests; admin worker action exists | Wire intentionally or remove from ops claims | No |
| Phase 4.13 simulation = evidence adapter only | **FAIL** | `lib/agents/simulation/evidence.ts` (“Not a second scenario runner”); `createPassingSimulationEvidence` can fabricate PASS; docs jump 4.12 → 4.14 | Implement real suite writing `agent_simulation_runs`, or stop requiring simulation until then | **Yes** for cert integrity |
| `buildEvidenceBundle` defaults CI/security/quality attestations to **true/happy** | **FAIL** | `lib/actions/agentReadiness.ts` L160–189 (`?? true`, default quality scores) | Require explicit operator attestations; default missing evidence to FAIL/WARNING | **Yes** |
| LLM “Not wired to UI yet” in `.env.example` | **WARNING** | `.env.example` LLM section comment is stale (UI enrichment/outreach exist) | Update comment in Phase 5.2 prep | No |

---

## 3. Phase 4 feature runtime wiring

| Feature | Wired at runtime? | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| Retry / scheduling | Yes | **PASS** | Migrations + `claimBatch` / `recoverStaleRunning` / cron | — |
| Usage / budget preflight | Yes on orchestrator when usage store present | **PASS** / **WARNING** | `orchestrator.evaluatePreflight` → `evaluateAgentPolicy` | Direct UI LLM paths use their own limits; may diverge from policy sets |
| Human Approval Center | Yes | **PASS** | `/approvals`, assignments migration, actions | Does not auto-send |
| Quality evaluation | Yes (store + dashboard + readiness evidence) | **WARNING** | Does **not** block `queueAgent` / `runClaimedExecution` | Post-hoc by design; OK if certifications use real scores |
| Prompt registry | Yes (UI + DB + stamp resolver) | **WARNING** | Stamp only when resolver injected | Cron skips |
| Rollouts | Yes; production activation checks cert | **PASS** | `lib/actions/agentRollouts.ts` | — |
| Policy management | Yes (UI + resolve + stamp) | **WARNING** | Stamp only when resolver injected | Cron skips |
| Simulation framework | Evidence adapter + DB table only | **FAIL** | No scenario runner | Phase 4.13 skipped |
| Readiness certification | UI + evaluate + approve + revoke hooks | **FAIL** gate completeness | Gate skipped if `resolveCertification` undefined | See §5 |

---

## 4. Production execution blocking (required controls)

Required before production agent execution:

| Control | Enforced? | Status | Evidence | Gap | Blocking |
| --- | --- | --- | --- | --- | --- |
| Valid readiness certification | Only if resolver present **and** env requires cert | **FAIL** | `orchestrator.ts`: `if (readinessRequired && this.resolveCertification)` | Missing resolver ⇒ **allow**; not re-checked in `runClaimedExecution`; cron has no resolver | **Yes** |
| Policy allows execution | Orchestrator preflight when queued/run via orchestrator | **PASS** / **WARNING** | Feature flag, rate, concurrency, budget codes in `policy.ts` | Direct UI actions outside orchestrator | Dual-path |
| Budget / usage limits | Orchestrator + LLM helpers with usage store | **PASS** / **WARNING** | `limits.ts`, `usage.ts`, cron includes usage store | Zero spend if usage not recorded | Dual-path |
| Human review remains enabled | Policy flags + Approval Center; autonomy guards constant-false | **PASS** (practical) / **WARNING** | `AGENT_AUTONOMY_GUARDS`; approval HITL; no auto-send code | Not a dedicated `queueAgent` reason code for “HITL disabled” | Soft |
| Provider configuration valid | LLM disabled without key/flag | **PASS** for OpenAI scaffold | `lib/llm/index.ts`, `outreachDraft.ts` | Readiness does not attest provider health; Scorecard stub fallback | Before Phase 5.2 |

**Conclusion:** Production agent **queue** gating is incomplete on the scheduled worker and optional on bare orchestrators. Product LLM/agent actions largely run **outside** the certification gate.

---

## 5. Prohibited autonomous actions

| Prohibited action | Status | Evidence | Remediation | Blocking |
| --- | --- | --- | --- | --- |
| Automatic email sending | **PASS** | No production mailer/send path; autonomy guards always false (`lib/agents/safety.ts`) | Keep fail-closed at any future send call site via `assertNoAutonomousExternalAction` | No |
| Automatic proposal sending | **PASS** | Proposal generate/save only; no send | Same | No |
| Automatic prospect approval | **PASS** | Explicit approve actions; approvals deny bulk unsafe actions | Same | No |
| Automatic personal contact creation | **PASS** | Contact discovery recommends roles; no auto-create of personal contacts from agents | Same | No |
| Policy break-glass can store prohibited values | **WARNING** | Break-glass allows prohibited keys in resolve/validation | Never implement runtime that trusts `allow_auto_*` without hard guards | Non-blocking today |

---

## 6. Sensitive content to external providers

| Risk | Status | Evidence | Remediation | Blocking |
| --- | --- | --- | --- | --- |
| Student PII / FERPA | **PASS** | Forbidden keys, prompt validation patterns, CRM redaction | Retain allowlists for Phase 5.2 providers | No |
| Cookies / auth tokens / API keys | **PASS** | `FORBIDDEN_INPUT_KEYS`; audit sanitizers strip secrets | — | No |
| Raw private / interview notes | **PASS** | Forbidden in enrichment/outreach inputs; role redaction | — | No |
| Restricted budget / objection fields | **PASS** | Outreach forbid list includes budget/objections | — | No |
| Unresolved PII in strings | **PASS** | Email/phone/SSN scrub + block | — | No |

---

## 7. Migrations

| Migration | Purpose | Timestamp order | In deployment docs |
| --- | --- | --- | --- |
| `20260707130000`–`20260707200000` | Prospect generation / candidates / contact / meeting / proposal | OK | Covered by “apply all by timestamp” |
| `20260707170000` | `agent_executions` | OK | Implicit; easy to miss if operators only list late Phase 4 rows |
| `20260714150000` | Retry scheduling | OK | Explicit §5 |
| `20260714160000` | Usage events + chain depth | OK | Explicit |
| `20260714170000` | Approvals | OK | Explicit |
| `20260714180000` | Evaluations | OK | Explicit §6.6b |
| `20260714190000` | Prompts + rollouts | OK | Explicit §6.6c |
| `20260714200000` | Policy sets | OK | Explicit §6.6d |
| `20260714210000` | Readiness + simulation_runs | OK | Explicit §6.6e |

| Check | Status | Blocking |
| --- | --- | --- |
| Timestamp ordered | **PASS** | No |
| Internally consistent (FKs to prior tables) | **PASS** | No |
| Referenced in deployment documentation | **PASS** / **WARNING** for early agent_executions visibility in the late table | No |
| Safe to apply to staging (forward-only, RLS enabled on new tables) | **PASS** | No |

---

## 8. Environment variables

Documented in `.env.example` and `docs/deployment-runbook.md` §6.6a–e for:

- Cron / worker (`AGENT_CRON_SECRET`, batch, attempts)
- Usage / budgets (`AGENT_*`, `LLM_*`)
- Quality, prompts, policies, readiness (`AGENT_READINESS_*`)

| Finding | Status | Blocking |
| --- | --- | --- |
| Coverage vs code defaults | **PASS** | No |
| Dual budget knobs (env `LLM_*` vs policy `daily_budget_usd`) | **WARNING** — document precedence for operators | No |
| `AGENT_READINESS_ENVIRONMENT` documented in `.env.example` but outside `AGENT_READINESS_ENV` key map | **WARNING** — used by `resolveReadinessEnvironment` | No |
| Stale LLM “not wired to UI” comment | **WARNING** | No |

---

## 9. Organization isolation and audit logging

| Check | Status | Evidence |
| --- | --- | --- |
| Agent tables RLS / org scoping | **PASS** | Phase 4 migrations + authz helpers |
| Readiness / prompt / policy org vs global scopes | **PASS** | RLS + super_admin global management |
| Audit actions for agents / readiness / policy / prompts | **PASS** | `lib/auditLog.ts` action constants; sanitize helpers |
| Certification denial audited | **PASS** | `agent_readiness.execution_denied` when gate runs |

---

## Scorecard by requirement

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Identify incomplete / stub / duplicate / conflicting implementations | **Done** — see §2–§3 |
| 2 | Verify singletons | **PASS** modules; **FAIL** equivalent runtime wiring |
| 3 | Migrations ordered, consistent, documented, staging-safe | **PASS** (minor doc WARNING) |
| 4 | Phase 4 features wired, not docs-only | **Mixed** — UI/DB mostly wired; cron/simulation/evidence honesty **FAIL** |
| 5 | Production blocked unless cert + policy + budget + HITL + provider | **FAIL** incomplete |
| 6 | Prohibited autonomy disabled | **PASS** (practical) |
| 7 | No sensitive content to providers | **PASS** |
| 8 | Env vars documented/validated | **PASS** / minor WARNING |
| 9 | test / lint / build | **PASS** (flaky timeout WARNING under full parallel suite) |

---

## Recommended implementation order (before Phase 5.2)

1. **Fail closed on missing certification resolver** when readiness requires the environment (treat missing resolver as deny, not allow).  
2. **Unify cron + worker factories:** always inject prompt stamp, policy stamp, certification, usage store, and complete handler dependencies; never return `worker_stub` success in production.  
3. **Wire prospect generation / enrichment / outreach handler dependencies** (or permanently fail those agent names until wired).  
4. **Decide dual-path strategy:**  
   - Preferred: route provider-backed work through `queueAgent` so cert/policy/budget apply once; or  
   - Explicitly re-apply the same gates inside each direct action.  
5. **Fix readiness evidence honesty:** stop defaulting CI/security attestations and quality scores to happy values; require explicit attestations; fail missing simulation.  
6. **Complete or formally defer Phase 4.13 simulation:** real runner writing `agent_simulation_runs`, or remove/relax simulation gate until shipped (with documented risk).  
7. **Re-check certification at claim/run time** (or reject claim if cert revoked after queue).  
8. **Tighten Scorecard stub policy** for non-dev environments before live provider expansion.  
9. **Call hard autonomy asserts** at any future external-action call sites.  
10. **Docs polish:** update stale LLM `.env.example` comment; list `20260707170000` explicitly in runbook migration table; document env vs policy budget precedence.

---

## Blocking issues (must resolve or formally accept risk)

1. Cron worker constructs a bare orchestrator → **no readiness / prompt / policy stamps** and **handler stubs can mark success**.  
2. Handler dependency factory omits core prospect/LLM agents.  
3. Readiness gate is skipped when `resolveCertification` is undefined even if production certification is required.  
4. Primary product agent/LLM flows **bypass** orchestrator queue → certification does not protect them.  
5. Simulation framework is not a real suite; evidence can be fabricated / missing while cert still digests happy defaults from `buildEvidenceBundle`.

## Non-blocking issues

1. Quality evaluation is post-hoc (not an execution hard-stop).  
2. `processNextAgentExecution` not used from main UI.  
3. Future agent placeholders.  
4. Stub Scorecard fallback in non-key environments.  
5. Dual budget configuration surfaces (env vs policy).  
6. Break-glass can store prohibited policy values without a current send implementation.  
7. Flaky 5s timeout on one agent-operations authz test under full parallel vitest load.  
8. Stale `.env.example` LLM wiring comment; early agent migration less prominent in runbook §5 list.

## Phase 5.2 may safely begin?

**No.** Phase 5.2 (real provider integration) should not start until blocking items 1–5 are fixed or an explicit written exception accepts:

- Running providers only via direct actions with duplicated gates, **and**
- Disabling cron agent processing / stub success, **and**
- Treating readiness simulation evidence as non-authoritative.

Until then, enabling new external APIs would expand blast radius under incomplete production controls.

---

## Files changed (this phase)

| File | Change |
| --- | --- |
| `docs/phase-5-integration-readiness-audit.md` | **Created** (this audit) |

No application code was modified. Audit-only phase as specified.
