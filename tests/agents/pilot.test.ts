import { describe, expect, it } from "vitest";

import { AGENT_AUTONOMY_GUARDS } from "@/lib/agents/safety";
import {
  assertPilotAutonomyGuardsIntact,
  buildAgentPilotStatusSummary,
  evaluatePilotAccess,
  resolveAgentPilotRuntimeStateFromEnv,
  PILOT_DISABLED_CAPABILITIES,
  PILOT_PERMITTED_AGENTS
} from "@/lib/agents/pilot";
import { classifyAgentFailure, isRetriableFailureClass } from "@/lib/agents/failureClassification";

function enabledState(overrides?: {
  orgId?: string;
  userId?: string;
  killSwitch?: boolean;
  enabled?: boolean;
  maxOrganizations?: number;
  maxUsers?: number;
  maxDailyJobs?: number;
  maxDailySpendUsd?: number;
  maxCandidateBatchSize?: number;
}) {
  const orgId = overrides?.orgId ?? "org-1";
  const userId = overrides?.userId ?? "user-1";
  const now = "2026-07-14T12:00:00.000Z";

  return {
    enabled: overrides?.enabled ?? true,
    killSwitch: overrides?.killSwitch ?? false,
    limits: {
      maxOrganizations: overrides?.maxOrganizations ?? 3,
      maxUsers: overrides?.maxUsers ?? 15,
      maxDailyJobs: overrides?.maxDailyJobs ?? 50,
      maxDailySpendUsd: overrides?.maxDailySpendUsd ?? 25,
      maxCandidateBatchSize: overrides?.maxCandidateBatchSize ?? 25
    },
    organizations: [
      {
        organization_id: orgId,
        status: "enabled" as const,
        notes: null,
        created_at: now,
        updated_at: now
      }
    ],
    users: [
      {
        user_id: userId,
        organization_id: orgId,
        status: "enabled" as const,
        notes: null,
        created_at: now,
        updated_at: now
      }
    ],
    source: "env" as const
  };
}

describe("evaluatePilotAccess", () => {
  it("defaults disabled from env (no allowlist)", () => {
    const state = resolveAgentPilotRuntimeStateFromEnv({});
    expect(state.enabled).toBe(false);
    expect(state.organizations).toEqual([]);

    const decision = evaluatePilotAccess({
      organizationId: "org-1",
      actorUserId: "user-1",
      agentName: "ProspectEnrichmentAgent",
      state
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) {
      throw new Error("expected denial");
    }
    expect(decision.reason_code).toBe("pilot_disabled");
  });

  it("honors emergency kill switch first", () => {
    const decision = evaluatePilotAccess({
      organizationId: "org-1",
      actorUserId: "user-1",
      agentName: "ProspectGenerationAgent",
      state: enabledState({ killSwitch: true })
    });

    expect(decision).toMatchObject({
      allowed: false,
      reason_code: "pilot_kill_switch"
    });
  });

  it("permits Scorecard generation, enrichment, and outreach draft only", () => {
    for (const agentName of PILOT_PERMITTED_AGENTS) {
      const decision = evaluatePilotAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        agentName,
        state: enabledState()
      });
      expect(decision.allowed).toBe(true);
    }

    const denied = evaluatePilotAccess({
      organizationId: "org-1",
      actorUserId: "user-1",
      agentName: "ContactDiscoveryAgent",
      state: enabledState()
    });
    expect(denied).toMatchObject({
      allowed: false,
      reason_code: "pilot_agent_not_permitted"
    });
  });

  it("requires organization and user allowlists", () => {
    expect(
      evaluatePilotAccess({
        organizationId: "org-other",
        actorUserId: "user-1",
        agentName: "ProspectEnrichmentAgent",
        state: enabledState()
      })
    ).toMatchObject({
      allowed: false,
      reason_code: "pilot_organization_not_allowlisted"
    });

    expect(
      evaluatePilotAccess({
        organizationId: "org-1",
        actorUserId: "user-other",
        agentName: "ProspectEnrichmentAgent",
        state: enabledState()
      })
    ).toMatchObject({
      allowed: false,
      reason_code: "pilot_user_not_allowlisted"
    });
  });

  it("enforces pilot daily jobs, spend, and batch limits", () => {
    expect(
      evaluatePilotAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        agentName: "ProspectGenerationAgent",
        state: enabledState({ maxDailyJobs: 2 }),
        usage: { dailyJobs: 2, dailySpendUsd: 0 }
      })
    ).toMatchObject({ reason_code: "pilot_daily_jobs_limit" });

    expect(
      evaluatePilotAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        agentName: "ProspectEnrichmentAgent",
        state: enabledState({ maxDailySpendUsd: 10 }),
        usage: { dailyJobs: 0, dailySpendUsd: 10 }
      })
    ).toMatchObject({ reason_code: "pilot_daily_spend_limit" });

    expect(
      evaluatePilotAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        agentName: "ProspectGenerationAgent",
        state: enabledState({ maxCandidateBatchSize: 10 }),
        candidateBatchSize: 11
      })
    ).toMatchObject({ reason_code: "pilot_batch_limit" });
  });

  it("keeps autonomous capabilities disabled", () => {
    expect(assertPilotAutonomyGuardsIntact()).toEqual({ ok: true });
    expect(AGENT_AUTONOMY_GUARDS.mayAutonomouslySendEmail).toBe(false);
    expect(AGENT_AUTONOMY_GUARDS.mayAutonomouslyApproveProspects).toBe(false);
    expect(AGENT_AUTONOMY_GUARDS.mayAutonomouslySendProposals).toBe(false);
    expect(PILOT_DISABLED_CAPABILITIES).toEqual([
      "automatic_sending",
      "automatic_approval",
      "automatic_proposal_delivery",
      "autonomous_contact_creation"
    ]);
  });

  it("builds dashboard status summary", () => {
    const summary = buildAgentPilotStatusSummary({
      state: enabledState(),
      usage: { dailyJobs: 4, dailySpendUsd: 1.25 }
    });

    expect(summary).toMatchObject({
      enabled: true,
      kill_switch: false,
      organizations_enabled: 1,
      users_enabled: 1,
      daily_jobs_used: 4,
      daily_spend_usd: 1.25
    });
    expect(summary.permitted_agents).toEqual([...PILOT_PERMITTED_AGENTS]);
  });

  it("treats pilot denials as permanent (no automatic retry)", () => {
    for (const code of [
      "pilot_kill_switch",
      "pilot_disabled",
      "pilot_organization_not_allowlisted",
      "pilot_user_not_allowlisted",
      "pilot_agent_not_permitted",
      "pilot_daily_jobs_limit",
      "pilot_daily_spend_limit"
    ] as const) {
      expect(isRetriableFailureClass(classifyAgentFailure("denied", code))).toBe(
        false
      );
    }
  });
});
