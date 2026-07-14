import { buildBootstrapSystemDefaults } from "./defaults";
import { getPolicyKeyDefinition, listPolicyKeys } from "./schema";
import type {
  AgentPolicySet,
  AgentPolicyValue,
  PolicyExecutionStamp,
  PolicySource,
  ResolvedAgentPolicy,
  ResolvedPolicyValue
} from "./types";

export type PolicyOverrideLayer = {
  policySet: AgentPolicySet;
  values: AgentPolicyValue[];
};

function hashResolved(flat: Record<string, unknown>): string {
  const keys = Object.keys(flat).sort();
  const payload = JSON.stringify(
    Object.fromEntries(keys.map((key) => [key, flat[key]]))
  );
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Resolve policy hierarchy:
 * 1. organization override (active)
 * 2. global active policy
 * 3. system defaults (env bootstrap + catalog defaults)
 *
 * Stricter safety wins for autonomy/review/citation keys when DB would loosen
 * system defaults without break-glass (caller must supply activeBreakGlassKeys).
 */
export function resolveAgentPolicy(params: {
  organizationId: string | null;
  organizationLayer?: PolicyOverrideLayer | null;
  globalLayer?: PolicyOverrideLayer | null;
  env?: NodeJS.ProcessEnv;
  activeBreakGlassKeys?: Set<string>;
}): ResolvedAgentPolicy {
  const systemDefaults = buildBootstrapSystemDefaults(params.env);
  const resolved = new Map<string, ResolvedPolicyValue>();

  const setValue = (
    key: string,
    value: unknown,
    source: PolicySource,
    policySet: AgentPolicySet | null
  ) => {
    const definition = getPolicyKeyDefinition(key);
    if (!definition) {
      return;
    }
    resolved.set(key, {
      key,
      value,
      value_type: definition.value_type,
      source,
      category: definition.category,
      policy_set_id: policySet?.id ?? null,
      policy_version: policySet?.version ?? null
    });
  };

  for (const definition of listPolicyKeys()) {
    setValue(
      definition.key,
      systemDefaults[definition.key],
      "system_default",
      null
    );
  }

  const applyLayer = (
    layer: PolicyOverrideLayer | null | undefined,
    source: PolicySource
  ) => {
    if (!layer || layer.policySet.status !== "active") {
      return;
    }
    for (const row of layer.values) {
      const definition = getPolicyKeyDefinition(row.policy_key);
      if (!definition) {
        continue;
      }

      const wantsUnsafe = definition.break_glass_when?.(row.value_json) === true;
      const hasBreakGlass =
        params.activeBreakGlassKeys?.has(row.policy_key) ?? false;

      if (
        definition.prohibited_without_break_glass &&
        wantsUnsafe &&
        !hasBreakGlass
      ) {
        // Keep stricter system default; do not silently accept unsafe value.
        continue;
      }

      // Env/system require-approval/citations: DB cannot silently loosen without break-glass
      if (
        (definition.key.startsWith("require_") ||
          definition.key === "require_source_citations") &&
        row.value_json === false &&
        systemDefaults[definition.key] === true &&
        !hasBreakGlass
      ) {
        continue;
      }

      setValue(row.policy_key, row.value_json, source, layer.policySet);
    }
  };

  applyLayer(params.globalLayer, "global_override");
  applyLayer(params.organizationLayer, "organization_override");

  const flat: Record<string, unknown> = {};
  const values: Record<string, ResolvedPolicyValue> = {};
  for (const [key, entry] of resolved) {
    values[key] = entry;
    flat[key] = entry.value;
  }

  let policy_scope: ResolvedAgentPolicy["policy_scope"] = "system";
  let policy_set_id: string | null = null;
  let policy_version: string | null = null;

  if (params.organizationLayer?.policySet.status === "active") {
    policy_scope = "organization";
    policy_set_id = params.organizationLayer.policySet.id;
    policy_version = params.organizationLayer.policySet.version;
  } else if (params.globalLayer?.policySet.status === "active") {
    policy_scope = "global";
    policy_set_id = params.globalLayer.policySet.id;
    policy_version = params.globalLayer.policySet.version;
  }

  return {
    organization_id: params.organizationId,
    policy_set_id,
    policy_version,
    policy_scope,
    resolved_policy_hash: hashResolved(flat),
    values,
    flat
  };
}

export function stampFromResolvedPolicy(
  policy: ResolvedAgentPolicy
): PolicyExecutionStamp {
  return {
    policy_set_id: policy.policy_set_id,
    policy_version: policy.policy_version,
    policy_scope: policy.policy_scope,
    resolved_policy_hash: policy.resolved_policy_hash,
    policy_feature_enabled: Boolean(
      policy.flat.automated_worker_enabled ??
        policy.flat.prospect_generation_enabled
    ),
    policy_max_executions_per_hour: Number(
      policy.flat.max_agent_executions_per_hour ?? 60
    ),
    policy_daily_budget_usd: Number(policy.flat.daily_budget_usd ?? 25),
    policy_require_approvals: Boolean(
      policy.flat.require_prospect_approval ?? true
    ),
    policy_require_citations: Boolean(
      policy.flat.require_source_citations ?? true
    )
  };
}

export function resolvedPolicyToSafetyLimits(
  policy: ResolvedAgentPolicy
): {
  maxExecutionsPerHour: number;
  maxLlmCallsPerDay: number;
  dailyBudgetUsd: number;
  monthlyBudgetUsd: number;
  maxConcurrentExecutions: number;
  maxCandidateBatchSize: number;
  maxChainDepth: number;
  maxAutomaticRetries: number;
  featureEnabled: boolean;
} {
  return {
    maxExecutionsPerHour: Number(policy.flat.max_agent_executions_per_hour),
    maxLlmCallsPerDay: Number(policy.flat.max_llm_calls_per_day),
    dailyBudgetUsd: Number(policy.flat.daily_budget_usd),
    monthlyBudgetUsd: Number(policy.flat.monthly_budget_usd),
    maxConcurrentExecutions: Number(policy.flat.max_concurrent_executions),
    maxCandidateBatchSize: Number(policy.flat.max_candidate_batch_size),
    maxChainDepth: Number(policy.flat.max_chain_depth),
    maxAutomaticRetries: Number(policy.flat.max_retry_attempts),
    featureEnabled: Boolean(policy.flat.automated_worker_enabled)
  };
}
