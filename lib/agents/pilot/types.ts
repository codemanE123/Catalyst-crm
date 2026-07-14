import type { AgentName } from "@/lib/agents/types";

/**
 * Agents allowed to use real providers during the limited production pilot.
 * Everything else stays out of scope for Phase 5.5.
 */
export const PILOT_PERMITTED_AGENTS = [
  "ProspectGenerationAgent",
  "ProspectEnrichmentAgent",
  "OutreachDraftAgent"
] as const satisfies readonly AgentName[];

export type PilotPermittedAgent = (typeof PILOT_PERMITTED_AGENTS)[number];

export const PILOT_DISABLED_CAPABILITIES = [
  "automatic_sending",
  "automatic_approval",
  "automatic_proposal_delivery",
  "autonomous_contact_creation"
] as const;

export type PilotDisabledCapability = (typeof PILOT_DISABLED_CAPABILITIES)[number];

export const AGENT_PILOT_ENV = {
  enabled: "AGENT_PILOT_ENABLED",
  killSwitch: "AGENT_PILOT_KILL_SWITCH",
  orgAllowlist: "AGENT_PILOT_ORG_ALLOWLIST",
  userAllowlist: "AGENT_PILOT_USER_ALLOWLIST",
  maxOrganizations: "AGENT_PILOT_MAX_ORGANIZATIONS",
  maxUsers: "AGENT_PILOT_MAX_USERS",
  maxDailyJobs: "AGENT_PILOT_MAX_DAILY_JOBS",
  maxDailySpendUsd: "AGENT_PILOT_MAX_DAILY_SPEND_USD",
  maxCandidateBatchSize: "AGENT_PILOT_MAX_CANDIDATE_BATCH_SIZE"
} as const;

export const DEFAULT_AGENT_PILOT_LIMITS = {
  maxOrganizations: 3,
  maxUsers: 15,
  maxDailyJobs: 50,
  maxDailySpendUsd: 25,
  maxCandidateBatchSize: 25
} as const;

export const PILOT_REASON_CODES = [
  "pilot_kill_switch",
  "pilot_disabled",
  "pilot_organization_not_allowlisted",
  "pilot_user_not_allowlisted",
  "pilot_agent_not_permitted",
  "pilot_org_cap",
  "pilot_user_cap",
  "pilot_daily_jobs_limit",
  "pilot_daily_spend_limit",
  "pilot_batch_limit"
] as const;

export type PilotReasonCode = (typeof PILOT_REASON_CODES)[number];

export type AgentPilotLimits = {
  maxOrganizations: number;
  maxUsers: number;
  maxDailyJobs: number;
  maxDailySpendUsd: number;
  maxCandidateBatchSize: number;
};

export type AgentPilotSettings = {
  enabled: boolean;
  killSwitch: boolean;
  limits: AgentPilotLimits;
};

export type AgentPilotOrganizationAllowlistEntry = {
  organization_id: string;
  status: "enabled" | "disabled";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentPilotUserAllowlistEntry = {
  user_id: string;
  organization_id: string;
  status: "enabled" | "disabled";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentPilotRuntimeState = AgentPilotSettings & {
  organizations: AgentPilotOrganizationAllowlistEntry[];
  users: AgentPilotUserAllowlistEntry[];
  source: "env" | "database" | "merged";
};

export type AgentPilotUsageSnapshot = {
  dailyJobs: number;
  dailySpendUsd: number;
};

export type PilotDecision =
  | {
      allowed: true;
      reason_code: null;
      user_safe_message: null;
      limits: AgentPilotLimits;
    }
  | {
      allowed: false;
      reason_code: PilotReasonCode;
      user_safe_message: string;
      limits: AgentPilotLimits;
    };

export type AgentPilotStatusSummary = {
  enabled: boolean;
  kill_switch: boolean;
  organizations_enabled: number;
  organizations_max: number;
  users_enabled: number;
  users_max: number;
  daily_jobs_used: number;
  daily_jobs_max: number;
  daily_spend_usd: number;
  daily_spend_max_usd: number;
  max_candidate_batch_size: number;
  permitted_agents: PilotPermittedAgent[];
  disabled_capabilities: PilotDisabledCapability[];
  source: AgentPilotRuntimeState["source"];
};

export const PILOT_USER_SAFE_MESSAGES: Record<PilotReasonCode, string> = {
  pilot_kill_switch:
    "Agent pilot has been emergency-stopped. Contact an administrator.",
  pilot_disabled:
    "Production agent pilot is disabled. Real provider execution is not available.",
  pilot_organization_not_allowlisted:
    "This organization is not on the production agent pilot allowlist.",
  pilot_user_not_allowlisted:
    "Your account is not on the production agent pilot allowlist.",
  pilot_agent_not_permitted:
    "This agent is not permitted during the limited production pilot.",
  pilot_org_cap: "Pilot organization capacity has been reached.",
  pilot_user_cap: "Pilot user capacity has been reached.",
  pilot_daily_jobs_limit: "Daily pilot job limit has been reached.",
  pilot_daily_spend_limit: "Daily pilot spend limit has been reached.",
  pilot_batch_limit: "Requested candidate batch exceeds the pilot maximum."
};

export function isPilotPermittedAgent(agentName: string): agentName is PilotPermittedAgent {
  return (PILOT_PERMITTED_AGENTS as readonly string[]).includes(agentName);
}
