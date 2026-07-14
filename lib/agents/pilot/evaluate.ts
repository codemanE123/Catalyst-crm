import { AGENT_AUTONOMY_GUARDS } from "@/lib/agents/safety";
import type { AgentName } from "@/lib/agents/types";

import {
  isPilotPermittedAgent,
  PILOT_DISABLED_CAPABILITIES,
  PILOT_PERMITTED_AGENTS,
  PILOT_USER_SAFE_MESSAGES,
  type AgentPilotRuntimeState,
  type AgentPilotStatusSummary,
  type AgentPilotUsageSnapshot,
  type PilotDecision,
  type PilotReasonCode
} from "./types";

function deny(
  reason: PilotReasonCode,
  limits: AgentPilotRuntimeState["limits"]
): PilotDecision {
  return {
    allowed: false,
    reason_code: reason,
    user_safe_message: PILOT_USER_SAFE_MESSAGES[reason],
    limits
  };
}

function isOrgEnabled(
  state: AgentPilotRuntimeState,
  organizationId: string
): boolean {
  return state.organizations.some(
    (entry) =>
      entry.organization_id === organizationId && entry.status === "enabled"
  );
}

function isUserEnabled(
  state: AgentPilotRuntimeState,
  userId: string,
  organizationId: string
): boolean {
  return state.users.some(
    (entry) =>
      entry.user_id === userId &&
      entry.status === "enabled" &&
      (entry.organization_id === "*" ||
        entry.organization_id === organizationId)
  );
}

export function countEnabledPilotOrganizations(
  state: AgentPilotRuntimeState
): number {
  return state.organizations.filter((entry) => entry.status === "enabled")
    .length;
}

export function countEnabledPilotUsers(state: AgentPilotRuntimeState): number {
  return state.users.filter((entry) => entry.status === "enabled").length;
}

/**
 * Evaluate whether real provider execution is allowed for this actor/agent.
 * Defaults closed: disablements, kill switch, missing allowlists all deny.
 */
export function evaluatePilotAccess(params: {
  organizationId: string;
  actorUserId: string;
  agentName: AgentName | string;
  state: AgentPilotRuntimeState;
  usage?: AgentPilotUsageSnapshot | null;
  candidateBatchSize?: number | null;
}): PilotDecision {
  const { state, limits } = {
    state: params.state,
    limits: params.state.limits
  };

  if (state.killSwitch) {
    return deny("pilot_kill_switch", limits);
  }

  if (!state.enabled) {
    return deny("pilot_disabled", limits);
  }

  if (!isPilotPermittedAgent(params.agentName)) {
    return deny("pilot_agent_not_permitted", limits);
  }

  const enabledOrgCount = countEnabledPilotOrganizations(state);
  if (enabledOrgCount > limits.maxOrganizations) {
    return deny("pilot_org_cap", limits);
  }

  const enabledUserCount = countEnabledPilotUsers(state);
  if (enabledUserCount > limits.maxUsers) {
    return deny("pilot_user_cap", limits);
  }

  if (!isOrgEnabled(state, params.organizationId)) {
    return deny("pilot_organization_not_allowlisted", limits);
  }

  if (!isUserEnabled(state, params.actorUserId, params.organizationId)) {
    return deny("pilot_user_not_allowlisted", limits);
  }

  if (
    params.candidateBatchSize != null &&
    Number.isFinite(params.candidateBatchSize) &&
    params.candidateBatchSize > limits.maxCandidateBatchSize
  ) {
    return deny("pilot_batch_limit", limits);
  }

  const usage = params.usage ?? { dailyJobs: 0, dailySpendUsd: 0 };

  if (usage.dailyJobs >= limits.maxDailyJobs) {
    return deny("pilot_daily_jobs_limit", limits);
  }

  if (usage.dailySpendUsd >= limits.maxDailySpendUsd) {
    return deny("pilot_daily_spend_limit", limits);
  }

  return {
    allowed: true,
    reason_code: null,
    user_safe_message: null,
    limits
  };
}

/**
 * Hard assertion that pilot-prohibited autonomous capabilities remain off.
 */
export function assertPilotAutonomyGuardsIntact(): {
  ok: true;
} | {
  ok: false;
  error: string;
  disabled_capabilities: typeof PILOT_DISABLED_CAPABILITIES;
} {
  const intact =
    AGENT_AUTONOMY_GUARDS.mayAutonomouslySendEmail === false &&
    AGENT_AUTONOMY_GUARDS.mayAutonomouslyApproveProspects === false &&
    AGENT_AUTONOMY_GUARDS.mayAutonomouslySendProposals === false &&
    AGENT_AUTONOMY_GUARDS.requiresHumanApprovalForExternalActions === true;

  if (!intact) {
    return {
      ok: false,
      error:
        "Pilot autonomy guards were altered. Automatic sending, approval, proposal delivery, and contact creation must remain disabled.",
      disabled_capabilities: PILOT_DISABLED_CAPABILITIES
    };
  }

  return { ok: true };
}

export function buildAgentPilotStatusSummary(params: {
  state: AgentPilotRuntimeState;
  usage?: AgentPilotUsageSnapshot | null;
}): AgentPilotStatusSummary {
  const usage = params.usage ?? { dailyJobs: 0, dailySpendUsd: 0 };

  return {
    enabled: params.state.enabled,
    kill_switch: params.state.killSwitch,
    organizations_enabled: countEnabledPilotOrganizations(params.state),
    organizations_max: params.state.limits.maxOrganizations,
    users_enabled: countEnabledPilotUsers(params.state),
    users_max: params.state.limits.maxUsers,
    daily_jobs_used: usage.dailyJobs,
    daily_jobs_max: params.state.limits.maxDailyJobs,
    daily_spend_usd: usage.dailySpendUsd,
    daily_spend_max_usd: params.state.limits.maxDailySpendUsd,
    max_candidate_batch_size: params.state.limits.maxCandidateBatchSize,
    permitted_agents: [...PILOT_PERMITTED_AGENTS],
    disabled_capabilities: [...PILOT_DISABLED_CAPABILITIES],
    source: params.state.source
  };
}

export function canEnableAnotherPilotOrganization(
  state: AgentPilotRuntimeState
): boolean {
  return countEnabledPilotOrganizations(state) < state.limits.maxOrganizations;
}

export function canEnableAnotherPilotUser(state: AgentPilotRuntimeState): boolean {
  return countEnabledPilotUsers(state) < state.limits.maxUsers;
}
