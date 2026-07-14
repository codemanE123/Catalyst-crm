export const POLICY_SET_STATUSES = [
  "draft",
  "active",
  "deprecated",
  "archived"
] as const;

export type PolicySetStatus = (typeof POLICY_SET_STATUSES)[number];

export const POLICY_VALUE_TYPES = [
  "boolean",
  "integer",
  "decimal",
  "string",
  "string_array",
  "json"
] as const;

export type PolicyValueType = (typeof POLICY_VALUE_TYPES)[number];

export const POLICY_SOURCES = [
  "system_default",
  "global_override",
  "organization_override"
] as const;

export type PolicySource = (typeof POLICY_SOURCES)[number];

export const POLICY_CATEGORIES = [
  "features",
  "human_review",
  "execution",
  "budgets",
  "quality",
  "providers",
  "data_access",
  "autonomy"
] as const;

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

export const POLICY_RISK_LEVELS = [
  "safe",
  "operational",
  "high_risk",
  "prohibited"
] as const;

export type PolicyRiskLevel = (typeof POLICY_RISK_LEVELS)[number];

export type AgentPolicySet = {
  id: string;
  organization_id: string | null;
  name: string;
  version: string;
  status: PolicySetStatus;
  description: string | null;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  deprecated_at: string | null;
};

export type AgentPolicyValue = {
  id: string;
  policy_set_id: string;
  policy_key: string;
  value_json: unknown;
  value_type: PolicyValueType;
  source: PolicySource;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ResolvedPolicyValue = {
  key: string;
  value: unknown;
  value_type: PolicyValueType;
  source: PolicySource;
  category: PolicyCategory;
  policy_set_id: string | null;
  policy_version: string | null;
};

export type ResolvedAgentPolicy = {
  organization_id: string | null;
  policy_set_id: string | null;
  policy_version: string | null;
  policy_scope: "organization" | "global" | "system";
  resolved_policy_hash: string;
  values: Record<string, ResolvedPolicyValue>;
  flat: Record<string, unknown>;
};

export type PolicyExecutionStamp = {
  policy_set_id: string | null;
  policy_version: string | null;
  policy_scope: "organization" | "global" | "system";
  resolved_policy_hash: string;
  policy_feature_enabled: boolean;
  policy_max_executions_per_hour: number;
  policy_daily_budget_usd: number;
  policy_require_approvals: boolean;
  policy_require_citations: boolean;
};

export type BreakGlassGrant = {
  id: string;
  organization_id: string | null;
  policy_key: string;
  reason: string;
  expires_at: string;
  created_by: string;
  created_at: string;
  expired_at: string | null;
};
