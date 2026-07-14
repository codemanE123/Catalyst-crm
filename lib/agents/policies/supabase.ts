import type { SupabaseClient } from "@supabase/supabase-js";

import { collectActiveBreakGlassKeys } from "./breakGlass";
import {
  resolveAgentPolicy,
  stampFromResolvedPolicy,
  type PolicyOverrideLayer
} from "./resolve";
import type {
  AgentPolicySet,
  AgentPolicyValue,
  BreakGlassGrant,
  PolicyExecutionStamp,
  ResolvedAgentPolicy
} from "./types";

const SET_SELECT =
  "id,organization_id,name,version,status,description,change_summary,created_by,created_at,updated_at,activated_at,deprecated_at";

const VALUE_SELECT =
  "id,policy_set_id,policy_key,value_json,value_type,source,description,created_at,updated_at";

export function mapPolicySet(row: Record<string, unknown>): AgentPolicySet {
  return {
    id: String(row.id),
    organization_id: (row.organization_id as string | null) ?? null,
    name: String(row.name),
    version: String(row.version),
    status: row.status as AgentPolicySet["status"],
    description: (row.description as string | null) ?? null,
    change_summary: (row.change_summary as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    activated_at: (row.activated_at as string | null) ?? null,
    deprecated_at: (row.deprecated_at as string | null) ?? null
  };
}

export function mapPolicyValue(row: Record<string, unknown>): AgentPolicyValue {
  return {
    id: String(row.id),
    policy_set_id: String(row.policy_set_id),
    policy_key: String(row.policy_key),
    value_json: row.value_json,
    value_type: row.value_type as AgentPolicyValue["value_type"],
    source: row.source as AgentPolicyValue["source"],
    description: (row.description as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

async function loadActiveLayer(
  supabase: SupabaseClient,
  organizationId: string | null
): Promise<PolicyOverrideLayer | null> {
  let query = supabase
    .from("agent_policy_sets")
    .select(SET_SELECT)
    .eq("status", "active");

  if (organizationId == null) {
    query = query.is("organization_id", null);
  } else {
    query = query.eq("organization_id", organizationId);
  }

  const { data: setRow } = await query.maybeSingle();
  if (!setRow) {
    return null;
  }

  const set = mapPolicySet(setRow as Record<string, unknown>);
  const { data: valueRows } = await supabase
    .from("agent_policy_values")
    .select(VALUE_SELECT)
    .eq("policy_set_id", set.id);

  return {
    policySet: set,
    values: (valueRows ?? []).map((row) =>
      mapPolicyValue(row as Record<string, unknown>)
    )
  };
}

async function loadActiveBreakGlass(
  supabase: SupabaseClient,
  organizationId: string
): Promise<BreakGlassGrant[]> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("agent_policy_break_glass")
    .select(
      "id,organization_id,policy_key,reason,expires_at,created_by,created_at,expired_at"
    )
    .is("expired_at", null)
    .gt("expires_at", nowIso)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    organization_id: (row.organization_id as string | null) ?? null,
    policy_key: String(row.policy_key),
    reason: String(row.reason),
    expires_at: String(row.expires_at),
    created_by: String(row.created_by),
    created_at: String(row.created_at),
    expired_at: (row.expired_at as string | null) ?? null
  }));
}

export async function resolveAgentPolicyFromSupabase(params: {
  supabase: SupabaseClient;
  organizationId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ResolvedAgentPolicy> {
  const [organizationLayer, globalLayer, grants] = await Promise.all([
    loadActiveLayer(params.supabase, params.organizationId),
    loadActiveLayer(params.supabase, null),
    loadActiveBreakGlass(params.supabase, params.organizationId)
  ]);

  return resolveAgentPolicy({
    organizationId: params.organizationId,
    organizationLayer,
    globalLayer,
    env: params.env,
    activeBreakGlassKeys: collectActiveBreakGlassKeys(grants)
  });
}

export async function resolvePolicyStampFromSupabase(params: {
  supabase: SupabaseClient;
  organizationId: string;
  existing?: Record<string, string | number | boolean | null> | null;
  env?: NodeJS.ProcessEnv;
}): Promise<PolicyExecutionStamp | null> {
  if (
    params.existing?.policy_set_id != null ||
    params.existing?.resolved_policy_hash
  ) {
    return {
      policy_set_id:
        params.existing.policy_set_id == null
          ? null
          : String(params.existing.policy_set_id),
      policy_version:
        params.existing.policy_version == null
          ? null
          : String(params.existing.policy_version),
      policy_scope:
        params.existing.policy_scope === "organization" ||
        params.existing.policy_scope === "global" ||
        params.existing.policy_scope === "system"
          ? params.existing.policy_scope
          : "system",
      resolved_policy_hash: String(
        params.existing.resolved_policy_hash ?? ""
      ),
      policy_feature_enabled: Boolean(
        params.existing.policy_feature_enabled ?? true
      ),
      policy_max_executions_per_hour: Number(
        params.existing.policy_max_executions_per_hour ?? 60
      ),
      policy_daily_budget_usd: Number(
        params.existing.policy_daily_budget_usd ?? 25
      ),
      policy_require_approvals: Boolean(
        params.existing.policy_require_approvals ?? true
      ),
      policy_require_citations: Boolean(
        params.existing.policy_require_citations ?? true
      )
    };
  }

  try {
    const resolved = await resolveAgentPolicyFromSupabase({
      supabase: params.supabase,
      organizationId: params.organizationId,
      env: params.env
    });
    return stampFromResolvedPolicy(resolved);
  } catch {
    return stampFromResolvedPolicy(
      resolveAgentPolicy({
        organizationId: params.organizationId,
        organizationLayer: null,
        globalLayer: null,
        env: params.env
      })
    );
  }
}

export { SET_SELECT, VALUE_SELECT };
