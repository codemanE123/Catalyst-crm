# Agent prompt versioning and controlled rollouts (Phase 4.11)

## Goals

Make Catalyst agents safely **versioned**, **reproducible**, **auditable**, and deployable through **controlled rollouts** instead of changing prompts or model behavior globally without traceability.

This builds on the existing Agent Orchestrator, background worker, Agent Operations dashboard, Human Approval Center, usage/safety limits, and quality evaluation. It does **not** create a second agent framework.

## Prompt registry architecture

| Layer | Location | Role |
| --- | --- | --- |
| Catalog (code) | `lib/agents/prompts/registry.ts` | Registers known `prompt_key`s, default templates, required placeholders, default schema/safety versions |
| Versions (DB) | `agent_prompt_versions` | Immutable versioned rows (after leaving draft) |
| Schemas (code) | `lib/agents/schemas/registry.ts` | Output schema versions validated with Zod |
| Rollouts (DB) | `agent_rollouts` | Control vs treatment experiments |
| Resolve | `lib/agents/prompts/supabase.ts` + orchestrator | Stamps execution metadata at queue time |
| Admin UI | `/agents/prompts`, `/agents/rollouts` | Lifecycle and experiment management |

Orchestrator integration: on `queueAgent`, if metadata lacks `prompt_version_id`, an optional resolver loads the active version (or rollout assignment) and stamps IDs only — never raw rendered prompts.

## Prompt lifecycle

1. **draft** — editable content; create or clone
2. **validate** — schema, placeholders, safety policy, provider/model, length, tests
3. **active** — only one active per `(prompt_key, organization scope)`; content immutable
4. **deprecated** — replaced by a newer active or manual deprecate
5. **archived** — terminal; cannot activate without going through a new draft/clone path

Global prompts use `organization_id = null`. Org-specific prompts override global active versions when present.

## Version immutability

After a version leaves `draft`, content fields (`system_prompt`, templates, model, schema, safety policy, etc.) cannot change. Database trigger `prevent_active_prompt_version_mutation` enforces this for non-draft rows. Lifecycle transitions only update `status` and timestamps.

## Output schema versioning

Each prompt version references `output_schema_version`. Provider JSON is validated with `validateOutputAgainstSchema`. Materially invalid output is rejected (no silent coercion). Schema version is recorded on `AgentExecution.metadata.output_schema_version`.

## Activation gates

A version cannot become active unless:

- Schema validation passes / schema exists in code registry
- Prompt validation tests pass (placeholder + forbidden content checks)
- `safety_policy_version` present (when `AGENT_PROMPT_REQUIRE_SAFETY_POLICY=true`)
- No forbidden placeholders / forbidden content patterns
- `max_output_tokens` defined and within limits
- Provider/model supported
- If evaluation data exists for the prompt key, average quality score ≥ `AGENT_PROMPT_ACTIVATION_MIN_QUALITY`

LLM self-evaluation alone never auto-activates prompts.

## Rollout assignment

**Default assignment key: `organization_id`** (`AGENT_ROLLOUT_ASSIGNMENT_KEY`).

Supported keys: `organization_id` | `user_id` | `target_id`.

Percentage rollouts use a stable hash of `rollout_id + assignment_key + value` mapped to bucket `0–99`. The same org/user/target stays in the same variant for the life of the rollout. No per-request randomness.

| Type | Behavior |
| --- | --- |
| `percentage` | 0 / 10 / 25 / 50 / 100% treatment |
| `organization_allowlist` | Treatment if org in metadata allowlist |
| `user_allowlist` | Treatment if user in allowlist |
| `fixed_control` | Always control |
| `fixed_treatment` | Always treatment |

Statuses: `draft` → `active` ↔ `paused` → `completed` | `cancelled`.

## Experiment metrics

Rollout UI compares control vs treatment using Phase 4.10 evaluations + execution duration + usage costs:

- Average quality score
- Acceptance / rejection / needs-revision rates
- Cost per accepted output
- Latency
- Safety flag rate
- Source citation rate
- High-confidence rejection rate

**Treatment is never auto-promoted** in this phase.

## Rollback procedure

1. Choose a prior non-archived version (or use rollout “Roll back to control”).
2. Activate that version (gates still apply when quality data exists).
3. Audit: `prompt.version_rollback` / `rollout.rollback`.
4. In-flight executions keep their queued `prompt_version_id`.
5. Future queues resolve the new active version.
6. Historical execution metadata is never rewritten.

## Role permissions

| Role | Prompt metadata | Org drafts/rollouts | Global prompts/rollouts |
| --- | --- | --- | --- |
| `read_only` | Denied | Denied | Denied |
| `sales` | Read | Denied | Denied |
| `admin` | Read | Manage own org | Denied |
| `super_admin` | Read | Manage | Manage |

## Privacy restrictions

Templates must not request or include:

- Student PII / protected education records
- Auth tokens, cookies, API keys
- Raw private CRM notes
- Hidden system-prompt jailbreaks
- Autonomous external send / prospect approval / proposal send

Audit metadata is sanitized (`sanitizePromptAuditMetadata`). AgentExecution stores version IDs and experiment fields only — not rendered prompts.

## Registering prompts for future agents

1. Add a catalog entry in `PROMPT_CATALOG` (`lib/agents/prompts/registry.ts`).
2. Register an output schema in `lib/agents/schemas/registry.ts`.
3. Map the agent name in `AGENT_PROMPT_KEY_MAP`.
4. Create a draft via UI or insert (global requires super_admin).
5. Validate → activate → optionally create a rollout.

Handlers continue to run through the existing orchestrator/worker; they should read stamped metadata (`prompt_key`, `prompt_version_id`, `output_schema_version`, `rollout_id`, `experiment_variant`) when calling providers.
