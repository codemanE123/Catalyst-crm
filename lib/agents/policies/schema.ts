import type { PolicyCategory, PolicyRiskLevel, PolicyValueType } from "./types";

export type PolicyKeyDefinition = {
  key: string;
  category: PolicyCategory;
  value_type: PolicyValueType;
  description: string;
  /** Default system value when no DB override exists. */
  default_value: unknown;
  risk: PolicyRiskLevel;
  /** Changing toward this "unsafe" direction is high-risk / needs break-glass. */
  break_glass_when?: (value: unknown) => boolean;
  min?: number;
  max?: number;
  enum_values?: readonly string[];
  /** Always false for autonomy keys unless break-glass. */
  prohibited_without_break_glass?: boolean;
};

function alwaysTrue(value: unknown): boolean {
  return value === true;
}

function isFalse(value: unknown): boolean {
  return value === false;
}

export const POLICY_KEY_REGISTRY: readonly PolicyKeyDefinition[] = [
  // Features
  {
    key: "prospect_generation_enabled",
    category: "features",
    value_type: "boolean",
    description: "Allow prospect generation agent",
    default_value: true,
    risk: "operational"
  },
  {
    key: "prospect_enrichment_enabled",
    category: "features",
    value_type: "boolean",
    description: "Allow LLM prospect enrichment",
    default_value: false,
    risk: "operational"
  },
  {
    key: "outreach_draft_enabled",
    category: "features",
    value_type: "boolean",
    description: "Allow outreach draft generation",
    default_value: false,
    risk: "operational"
  },
  {
    key: "contact_discovery_enabled",
    category: "features",
    value_type: "boolean",
    description: "Allow contact discovery agent",
    default_value: true,
    risk: "operational"
  },
  {
    key: "meeting_prep_enabled",
    category: "features",
    value_type: "boolean",
    description: "Allow meeting prep agent",
    default_value: true,
    risk: "operational"
  },
  {
    key: "proposal_generation_enabled",
    category: "features",
    value_type: "boolean",
    description: "Allow proposal generation agent",
    default_value: true,
    risk: "operational"
  },
  {
    key: "automated_worker_enabled",
    category: "features",
    value_type: "boolean",
    description: "Allow automated background worker",
    default_value: true,
    risk: "operational"
  },

  // Human review
  {
    key: "require_prospect_approval",
    category: "human_review",
    value_type: "boolean",
    description: "Require human approval before promoting prospects",
    default_value: true,
    risk: "high_risk",
    break_glass_when: isFalse
  },
  {
    key: "require_outreach_review",
    category: "human_review",
    value_type: "boolean",
    description: "Require human review of outreach drafts",
    default_value: true,
    risk: "high_risk",
    break_glass_when: isFalse
  },
  {
    key: "require_contact_review",
    category: "human_review",
    value_type: "boolean",
    description: "Require human review of contact recommendations",
    default_value: true,
    risk: "high_risk",
    break_glass_when: isFalse
  },
  {
    key: "require_meeting_prep_review",
    category: "human_review",
    value_type: "boolean",
    description: "Require human review of meeting briefs",
    default_value: true,
    risk: "high_risk",
    break_glass_when: isFalse
  },
  {
    key: "require_proposal_review",
    category: "human_review",
    value_type: "boolean",
    description: "Require human review of proposals",
    default_value: true,
    risk: "high_risk",
    break_glass_when: isFalse
  },

  // Execution
  {
    key: "max_agent_executions_per_hour",
    category: "execution",
    value_type: "integer",
    description: "Max agent executions queued per hour",
    default_value: 60,
    risk: "operational",
    min: 1,
    max: 10_000
  },
  {
    key: "max_llm_calls_per_day",
    category: "execution",
    value_type: "integer",
    description: "Max LLM calls per day",
    default_value: 200,
    risk: "operational",
    min: 1,
    max: 100_000
  },
  {
    key: "max_concurrent_executions",
    category: "execution",
    value_type: "integer",
    description: "Max concurrent running executions",
    default_value: 5,
    risk: "operational",
    min: 1,
    max: 100
  },
  {
    key: "max_candidate_batch_size",
    category: "execution",
    value_type: "integer",
    description: "Max candidates per generation job",
    default_value: 50,
    risk: "operational",
    min: 1,
    max: 100
  },
  {
    key: "max_retry_attempts",
    category: "execution",
    value_type: "integer",
    description: "Max automatic retry attempts",
    default_value: 3,
    risk: "operational",
    min: 1,
    max: 10
  },
  {
    key: "max_chain_depth",
    category: "execution",
    value_type: "integer",
    description: "Max agent chain depth",
    default_value: 5,
    risk: "operational",
    min: 1,
    max: 50
  },

  // Budgets
  {
    key: "daily_budget_usd",
    category: "budgets",
    value_type: "decimal",
    description: "Daily LLM spend budget (USD)",
    default_value: 25,
    risk: "operational",
    min: 0,
    max: 1_000_000,
    break_glass_when: (value) => typeof value === "number" && value > 250
  },
  {
    key: "monthly_budget_usd",
    category: "budgets",
    value_type: "decimal",
    description: "Monthly LLM spend budget (USD)",
    default_value: 250,
    risk: "operational",
    min: 0,
    max: 10_000_000,
    break_glass_when: (value) => typeof value === "number" && value > 2500
  },

  // Quality
  {
    key: "minimum_quality_score",
    category: "quality",
    value_type: "decimal",
    description: "Minimum overall quality score (1–5)",
    default_value: 3,
    risk: "operational",
    min: 1,
    max: 5
  },
  {
    key: "minimum_safety_score",
    category: "quality",
    value_type: "decimal",
    description: "Minimum safety dimension score (1–5)",
    default_value: 3,
    risk: "operational",
    min: 1,
    max: 5
  },
  {
    key: "require_source_citations",
    category: "quality",
    value_type: "boolean",
    description: "Require source citations when applicable",
    default_value: true,
    risk: "high_risk",
    break_glass_when: isFalse
  },
  {
    key: "rejection_rate_alert_threshold",
    category: "quality",
    value_type: "decimal",
    description: "Alert when rejection rate exceeds threshold",
    default_value: 0.4,
    risk: "safe",
    min: 0,
    max: 1
  },

  // Providers
  {
    key: "default_provider",
    category: "providers",
    value_type: "string",
    description: "Default LLM provider",
    default_value: "openai",
    risk: "operational",
    enum_values: ["openai", "none"] as const
  },
  {
    key: "default_model",
    category: "providers",
    value_type: "string",
    description: "Default LLM model",
    default_value: "gpt-4o-mini",
    risk: "operational",
    enum_values: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "none"] as const
  },
  {
    key: "fallback_model",
    category: "providers",
    value_type: "string",
    description: "Fallback LLM model",
    default_value: "gpt-4o-mini",
    risk: "operational",
    enum_values: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "none"] as const
  },
  {
    key: "default_temperature",
    category: "providers",
    value_type: "decimal",
    description: "Default sampling temperature",
    default_value: 0.2,
    risk: "safe",
    min: 0,
    max: 2
  },
  {
    key: "max_output_tokens",
    category: "providers",
    value_type: "integer",
    description: "Default max output tokens",
    default_value: 1200,
    risk: "operational",
    min: 64,
    max: 16_000
  },

  // Data access
  {
    key: "allow_public_web_sources",
    category: "data_access",
    value_type: "boolean",
    description: "Allow public web source fetches",
    default_value: true,
    risk: "operational"
  },
  {
    key: "allow_government_datasets",
    category: "data_access",
    value_type: "boolean",
    description: "Allow government/public dataset APIs",
    default_value: true,
    risk: "safe"
  },
  {
    key: "allow_third_party_search_api",
    category: "data_access",
    value_type: "boolean",
    description: "Allow third-party search APIs",
    default_value: false,
    risk: "operational"
  },
  {
    key: "allow_private_crm_context",
    category: "data_access",
    value_type: "boolean",
    description: "Allow private CRM context in LLM prompts",
    default_value: false,
    risk: "high_risk",
    break_glass_when: alwaysTrue,
    prohibited_without_break_glass: true
  },
  {
    key: "allow_contact_personal_data",
    category: "data_access",
    value_type: "boolean",
    description: "Allow personal contact data discovery",
    default_value: false,
    risk: "high_risk",
    break_glass_when: alwaysTrue,
    prohibited_without_break_glass: true
  },

  // Autonomy — defaults locked false
  {
    key: "allow_auto_approve_prospects",
    category: "autonomy",
    value_type: "boolean",
    description: "Allow automatic prospect approval",
    default_value: false,
    risk: "prohibited",
    break_glass_when: alwaysTrue,
    prohibited_without_break_glass: true
  },
  {
    key: "allow_auto_send_email",
    category: "autonomy",
    value_type: "boolean",
    description: "Allow automatic external email send",
    default_value: false,
    risk: "prohibited",
    break_glass_when: alwaysTrue,
    prohibited_without_break_glass: true
  },
  {
    key: "allow_auto_send_proposals",
    category: "autonomy",
    value_type: "boolean",
    description: "Allow automatic proposal send",
    default_value: false,
    risk: "prohibited",
    break_glass_when: alwaysTrue,
    prohibited_without_break_glass: true
  },
  {
    key: "allow_auto_create_contacts",
    category: "autonomy",
    value_type: "boolean",
    description: "Allow automatic contact creation without review",
    default_value: false,
    risk: "prohibited",
    break_glass_when: alwaysTrue,
    prohibited_without_break_glass: true
  }
] as const;

const byKey = new Map(POLICY_KEY_REGISTRY.map((entry) => [entry.key, entry]));

export function getPolicyKeyDefinition(
  key: string
): PolicyKeyDefinition | null {
  return byKey.get(key) ?? null;
}

export function listPolicyKeys(): PolicyKeyDefinition[] {
  return [...POLICY_KEY_REGISTRY];
}

export function listPolicyKeysByCategory(
  category: PolicyCategory
): PolicyKeyDefinition[] {
  return POLICY_KEY_REGISTRY.filter((entry) => entry.category === category);
}

export function isKnownPolicyKey(key: string): boolean {
  return byKey.has(key);
}
