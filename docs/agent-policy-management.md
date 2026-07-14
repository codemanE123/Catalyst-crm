# Agent policy management console (Phase 4.12)

## Goals

Provide one secure admin console for managing agent behavior, feature flags, usage limits, safety policies, provider/model defaults, and rollout-related operational settings — without editing environment variables or source for every change.

Builds on the existing orchestrator, worker, operations dashboard, usage limits, approvals, quality evaluation, and prompt/rollout registry. **Does not** create a second configuration or execution system.

## Policy hierarchy

Resolved deterministically in this order:

1. **Organization override** — active `agent_policy_sets` row for the org  
2. **Global override** — active set with `organization_id = null`  
3. **System default** — catalog defaults + safe env bootstrap (`buildBootstrapSystemDefaults`)

Each resolved key includes **value + source** (`system_default` | `global_override` | `organization_override`).

Stricter safety rules: autonomy / disabling human review / private CRM context / citation requirements **cannot** be loosened by DB policy without an active **break-glass** grant. Environment bootstrap also cannot enable autonomous actions.

## Supported keys

See `lib/agents/policies/schema.ts` (`POLICY_KEY_REGISTRY`). Categories:

| Category | Examples |
| --- | --- |
| Features | `prospect_enrichment_enabled`, `automated_worker_enabled` |
| Human review | `require_prospect_approval`, `require_outreach_review`, … |
| Execution | `max_agent_executions_per_hour`, `max_chain_depth`, … |
| Budgets | `daily_budget_usd`, `monthly_budget_usd` |
| Quality | `minimum_quality_score`, `require_source_citations`, … |
| Providers | `default_provider`, `default_model`, `max_output_tokens` |
| Data access | `allow_public_web_sources`, `allow_private_crm_context`, … |
| Autonomy | `allow_auto_send_email`, … (default **false**) |

Unknown keys and invalid types are rejected.

## Safe defaults

- All external-send / auto-approve / auto-create autonomy keys **false**
- Human approval required for prospect / outreach / contact / meeting / proposal
- Source citations required
- Conservative budgets and concurrency (bootstrap-tunable)
- Private CRM context and personal contact data **disabled**
- Prospect enrichment / outreach draft features **disabled** unless configured
- Fallback provider/model limited to supported enum values

## Version lifecycle

`draft` → validate → preview impact → `active` (immutable) → `deprecated` → `archived`

- One active set per org scope (and one global active)
- Draft values editable; non-draft values immutable (DB triggers)
- Clone active/draft into a new draft; restore previous version via activation/rollback

## Activation flow

1. Create or clone draft  
2. Edit values (admin/super_admin)  
3. Validate schema/min/max/prohibited settings  
4. Preview diff with risk classes: safe / operational / high_risk / prohibited  
5. Activate (blocked if prohibited without break-glass)  
6. Audit `agent_policy.activate`

## Break-glass process

For high-risk keys (disable approvals, private CRM context, personal contact data, disable citations, raise budgets past safe thresholds, autonomy):

1. **super_admin only**
2. Typed reason (≥ 20 chars)
3. Explicit confirmation (`BREAK GLASS`)
4. Expiration required (≤ `AGENT_POLICY_BREAK_GLASS_MAX_HOURS`)
5. Audit `agent_policy.break_glass_enable`
6. Grants expire automatically when `expireDueBreakGlass` / expiry time passes (`agent_policy.break_glass_expire`)

Product code still refuses autonomous external sending regardless of policy UI.

## Authorization

| Role | Access |
| --- | --- |
| `read_only` | Denied |
| `sales` | Limited summary of enabled features/limits (view only) |
| `admin` | Org-scoped drafts/activate subject to safety rules |
| `super_admin` | Global + org policies + break-glass |

## Drift detection

Flags (informational; **no auto-mutation**):

- Organization has no active policy  
- Execution referenced deprecated policy set  
- Env bootstrap differs from resolved DB values  
- Rollout/policy references unsupported provider/model  

## Rollback

Activate a prior non-archived set in the same scope. Audits `agent_policy.rollback`. In-flight executions keep stamped policy metadata; future queues resolve the new active set.

## AgentExecution integration

On queue, metadata may include:

- `policy_set_id`, `policy_version`, `policy_scope`, `resolved_policy_hash`
- Relevant flags/limits (`policy_feature_enabled`, `policy_max_executions_per_hour`, `policy_daily_budget_usd`, `policy_require_approvals`, `policy_require_citations`)

No secrets or prompts. Historical stamps are preserved (not rewritten).

Resolved limits feed `evaluateAgentPolicy` via `applyResolvedPolicyToSafetyLimits` (does not duplicate budget math).

## How future agents consume policies

```ts
import {
  resolveAgentPolicyFromSupabase,
  stampFromResolvedPolicy
} from "@/lib/agents/policies";

const resolved = await resolveAgentPolicyFromSupabase({ supabase, organizationId });
if (!resolved.flat.meeting_prep_enabled) { /* deny */ }
const stamp = stampFromResolvedPolicy(resolved);
```

Prefer the shared resolver over reading env directly for org-specific behavior. Env remains bootstrap for system defaults and offline/local use.

## UI

`/agents/policies` — policy sets, resolved view by category, impact preview, history actions, break-glass panel.
