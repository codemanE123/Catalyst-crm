import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentName } from "@/lib/agents/types";
import type { AgentPolicyDecision, AgentPolicyReasonCode } from "@/lib/agents/policy";

import { evaluatePilotAccess } from "./evaluate";
import { loadAgentPilotRuntimeState, loadAgentPilotUsageSnapshot } from "./supabase";
import type { PilotReasonCode } from "./types";
import { countEnabledPilotOrganizations } from "./evaluate";

export type PilotGateInput = {
  organizationId: string;
  actorUserId: string;
  agentName: AgentName;
  candidateBatchSize?: number | null;
  env?: NodeJS.ProcessEnv;
};

export type PilotGateResolver = (
  input: PilotGateInput
) => Promise<AgentPolicyDecision>;

export function pilotDecisionToPolicyDecision(
  decision: Awaited<ReturnType<typeof evaluatePilotAccess>>
): AgentPolicyDecision {
  if (decision.allowed) {
    return {
      allowed: true,
      reason_code: null,
      user_safe_message: null
    };
  }

  return {
    allowed: false,
    reason_code: decision.reason_code as AgentPolicyReasonCode,
    user_safe_message: decision.user_safe_message
  };
}

export function createPilotGateResolverFromSupabase(
  supabase: SupabaseClient
): PilotGateResolver {
  return async (input) => {
    const state = await loadAgentPilotRuntimeState({
      supabase,
      env: input.env
    });
    const enabledOrgIds = state.organizations
      .filter((entry) => entry.status === "enabled")
      .map((entry) => entry.organization_id);

    const usage =
      countEnabledPilotOrganizations(state) > 0
        ? await loadAgentPilotUsageSnapshot({
            supabase,
            organizationIds: enabledOrgIds
          })
        : { dailyJobs: 0, dailySpendUsd: 0 };

    const decision = evaluatePilotAccess({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      agentName: input.agentName,
      state,
      usage,
      candidateBatchSize: input.candidateBatchSize
    });

    return pilotDecisionToPolicyDecision(decision);
  };
}

export function isPilotReasonCode(
  code: string | null | undefined
): code is PilotReasonCode {
  return (
    typeof code === "string" &&
    code.startsWith("pilot_")
  );
}
