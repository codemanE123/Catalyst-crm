import { POLICY_KEY_REGISTRY } from "./schema";

/**
 * System-safe defaults. Env bootstrap values may tighten or raise limits but
 * must not silently weaken stricter active DB safety policies (see resolve.ts).
 */
export function buildSystemDefaultValues(): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const entry of POLICY_KEY_REGISTRY) {
    values[entry.key] = entry.default_value;
  }
  return values;
}

export const AGENT_POLICY_ENV = {
  managementEnabled: "AGENT_POLICY_MANAGEMENT_ENABLED",
  defaultDailyBudgetUsd: "AGENT_POLICY_DEFAULT_DAILY_BUDGET_USD",
  defaultMonthlyBudgetUsd: "AGENT_POLICY_DEFAULT_MONTHLY_BUDGET_USD",
  defaultMaxConcurrency: "AGENT_POLICY_DEFAULT_MAX_CONCURRENCY",
  breakGlassMaxHours: "AGENT_POLICY_BREAK_GLASS_MAX_HOURS",
  requireApproval: "AGENT_POLICY_REQUIRE_APPROVAL",
  requireSourceCitations: "AGENT_POLICY_REQUIRE_SOURCE_CITATIONS"
} as const;

export const DEFAULT_AGENT_POLICY_BOOTSTRAP = {
  managementEnabled: true,
  defaultDailyBudgetUsd: 25,
  defaultMonthlyBudgetUsd: 250,
  defaultMaxConcurrency: 5,
  breakGlassMaxHours: 24,
  requireApproval: true,
  requireSourceCitations: true
} as const;

function parseFloatInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseFloat(raw ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseIntInRange(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function parseTruthy(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw.trim() === "") {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export type AgentPolicyBootstrapConfig = {
  managementEnabled: boolean;
  defaultDailyBudgetUsd: number;
  defaultMonthlyBudgetUsd: number;
  defaultMaxConcurrency: number;
  breakGlassMaxHours: number;
  requireApproval: boolean;
  requireSourceCitations: boolean;
};

export function resolveAgentPolicyBootstrap(
  env: NodeJS.ProcessEnv = process.env
): AgentPolicyBootstrapConfig {
  return {
    managementEnabled: parseTruthy(
      env[AGENT_POLICY_ENV.managementEnabled],
      DEFAULT_AGENT_POLICY_BOOTSTRAP.managementEnabled
    ),
    defaultDailyBudgetUsd: parseFloatInRange(
      env[AGENT_POLICY_ENV.defaultDailyBudgetUsd],
      DEFAULT_AGENT_POLICY_BOOTSTRAP.defaultDailyBudgetUsd,
      0,
      1_000_000
    ),
    defaultMonthlyBudgetUsd: parseFloatInRange(
      env[AGENT_POLICY_ENV.defaultMonthlyBudgetUsd],
      DEFAULT_AGENT_POLICY_BOOTSTRAP.defaultMonthlyBudgetUsd,
      0,
      10_000_000
    ),
    defaultMaxConcurrency: parseIntInRange(
      env[AGENT_POLICY_ENV.defaultMaxConcurrency],
      DEFAULT_AGENT_POLICY_BOOTSTRAP.defaultMaxConcurrency,
      1,
      100
    ),
    breakGlassMaxHours: parseIntInRange(
      env[AGENT_POLICY_ENV.breakGlassMaxHours],
      DEFAULT_AGENT_POLICY_BOOTSTRAP.breakGlassMaxHours,
      1,
      168
    ),
    requireApproval: parseTruthy(
      env[AGENT_POLICY_ENV.requireApproval],
      DEFAULT_AGENT_POLICY_BOOTSTRAP.requireApproval
    ),
    requireSourceCitations: parseTruthy(
      env[AGENT_POLICY_ENV.requireSourceCitations],
      DEFAULT_AGENT_POLICY_BOOTSTRAP.requireSourceCitations
    )
  };
}

/**
 * Apply bootstrap env as system-default overrides only where they remain safe
 * (never force autonomy on; never turn off required approvals via env alone
 * when bootstrap says require).
 */
export function buildBootstrapSystemDefaults(
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
  const base = buildSystemDefaultValues();
  const bootstrap = resolveAgentPolicyBootstrap(env);

  base.daily_budget_usd = bootstrap.defaultDailyBudgetUsd;
  base.monthly_budget_usd = bootstrap.defaultMonthlyBudgetUsd;
  base.max_concurrent_executions = bootstrap.defaultMaxConcurrency;

  if (bootstrap.requireApproval) {
    base.require_prospect_approval = true;
    base.require_outreach_review = true;
    base.require_contact_review = true;
    base.require_meeting_prep_review = true;
    base.require_proposal_review = true;
  }

  if (bootstrap.requireSourceCitations) {
    base.require_source_citations = true;
  }

  // Hard safety: env cannot enable autonomous actions
  base.allow_auto_approve_prospects = false;
  base.allow_auto_send_email = false;
  base.allow_auto_send_proposals = false;
  base.allow_auto_create_contacts = false;
  base.allow_private_crm_context = false;
  base.allow_contact_personal_data = false;

  return base;
}
