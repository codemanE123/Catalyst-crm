import { afterEach, describe, expect, it } from "vitest";

import {
  canApproveProductionReadiness,
  canManageOrgReadiness,
  canViewAgentReadiness
} from "@/lib/authz";
import { classifyAgentFailure } from "@/lib/agents/failureClassification";
import { AgentOrchestrator } from "@/lib/agents/orchestrator";
import { InMemoryAgentExecutionStore } from "@/lib/agents/store";
import { createPassingSimulationEvidence } from "@/lib/agents/simulation/evidence";
import {
  InMemoryReadinessService,
  assertRolloutAllowedByCertification,
  evaluateAgentReadiness,
  exportCertificationCsv,
  exportCertificationJson,
  exportCertificationMarkdown,
  isCertificationValidForExecution,
  isEvaluationApprovable,
  resolveAgentReadinessConfig,
  sanitizeReadinessAuditMetadata,
  type ReadinessEvidenceBundle
} from "@/lib/agents/readiness";
import type { OrganizationMember } from "@/lib/supabase";

function member(
  role: OrganizationMember["role"],
  organizationId = "org-1"
): OrganizationMember {
  return {
    id: `${role}-${organizationId}`,
    organization_id: organizationId,
    user_id: "user-1",
    role,
    created_at: "2026-07-14T12:00:00.000Z",
    updated_at: "2026-07-14T12:00:00.000Z"
  };
}

const now = new Date("2026-07-14T12:00:00.000Z");
const AGENT = "ProspectGenerationAgent";

const ENV_KEYS = [
  "AGENT_READINESS_ENABLED",
  "AGENT_READINESS_PRODUCTION_REQUIRED",
  "AGENT_READINESS_STAGING_REQUIRED",
  "AGENT_READINESS_ENVIRONMENT",
  "AGENT_READINESS_MAX_SIMULATION_AGE_HOURS",
  "VERCEL_ENV",
  "NODE_ENV"
] as const;

const savedEnv: Record<string, string | undefined> = {};

function snapshotEnv() {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
}

function passingEvidence(
  overrides: Partial<ReadinessEvidenceBundle> = {}
): ReadinessEvidenceBundle {
  return {
    latestMigrationApplied: true,
    lintPassed: true,
    unitTestsPassed: true,
    buildPassed: true,
    e2eSmokePassed: true,
    rlsMatrixPassed: true,
    securityHeadersPassed: true,
    openSev1OrSev2: false,
    criticalQualityAlerts: false,
    averageQualityScore: 4,
    averageSafetyScore: 4,
    citationComplianceRate: 0.95,
    unresolvedCriticalQualityFlags: 0,
    activePromptVersionId: "prompt-1",
    activePromptValidated: true,
    activePolicySetId: "policy-1",
    activePolicyValid: true,
    usageLimitsConfigured: true,
    budgetsConfigured: true,
    retryPolicyConfigured: true,
    humanApprovalRequired: true,
    prohibitedAutonomyEnabled: false,
    rollbackProcedureDocumented: true,
    incidentRunbookCurrent: true,
    envVarsVerified: true,
    productionSupabaseVerified: true,
    vercelProductionVerified: true,
    simulation: createPassingSimulationEvidence({
      id: "sim-1",
      agentName: AGENT,
      organizationId: "org-1",
      completedAt: now.toISOString()
    }),
    reviewerUserId: "approver-1",
    lastPromptModifierUserId: "author-1",
    lastPolicyModifierUserId: "author-2",
    lastRolloutModifierUserId: "author-3",
    ...overrides
  };
}

snapshotEnv();
afterEach(() => {
  restoreEnv();
});

describe("agent readiness evaluation", () => {
  it("passes when all gates are satisfied", () => {
    const evaluation = evaluateAgentReadiness({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      evidence: passingEvidence(),
      now
    });
    expect(evaluation.overall_status).toBe("PASS");
    expect(evaluation.blocker_count).toBe(0);
    expect(isEvaluationApprovable(evaluation)).toBe(true);
  });

  it("warns on separation-of-duties without blocking", () => {
    const evaluation = evaluateAgentReadiness({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      evidence: passingEvidence({
        reviewerUserId: "same-user",
        lastPromptModifierUserId: "same-user"
      }),
      now
    });
    expect(evaluation.overall_status).toBe("WARNING");
    expect(evaluation.blocker_count).toBe(0);
    expect(isEvaluationApprovable(evaluation)).toBe(true);
    const sod = evaluation.checks.find((c) => c.id === "separation_of_duties");
    expect(sod?.status).toBe("WARNING");
  });

  it("fails when security headers evidence is missing", () => {
    const evaluation = evaluateAgentReadiness({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      evidence: passingEvidence({ securityHeadersPassed: false }),
      now
    });
    expect(evaluation.overall_status).toBe("FAIL");
    expect(evaluation.blocker_count).toBeGreaterThan(0);
    expect(isEvaluationApprovable(evaluation)).toBe(false);
  });

  it("fails when simulation evidence is missing", () => {
    const evaluation = evaluateAgentReadiness({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      evidence: passingEvidence({ simulation: null }),
      now
    });
    const sim = evaluation.checks.find((c) => c.id === "simulation_suite");
    expect(sim?.status).toBe("FAIL");
    expect(sim?.evidence).toMatch(/Missing simulation/);
  });

  it("fails when simulation evidence is stale", () => {
    const staleCompleted = new Date(
      now.getTime() - 200 * 60 * 60 * 1000
    ).toISOString();
    const evaluation = evaluateAgentReadiness({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      evidence: passingEvidence({
        simulation: createPassingSimulationEvidence({
          id: "sim-stale",
          agentName: AGENT,
          completedAt: staleCompleted
        })
      }),
      config: resolveAgentReadinessConfig({
        ...process.env,
        AGENT_READINESS_MAX_SIMULATION_AGE_HOURS: "168"
      }),
      now
    });
    const sim = evaluation.checks.find((c) => c.id === "simulation_suite");
    expect(sim?.status).toBe("FAIL");
    expect(sim?.evidence).toMatch(/stale/i);
  });
});

describe("certification lifecycle and enforcement", () => {
  it("expires approved certifications and blocks execution", () => {
    const service = new InMemoryReadinessService();
    const evaluation = evaluateAgentReadiness({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      evidence: passingEvidence(),
      now
    });
    const draft = service.createDraft({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      version: "v1",
      evaluation,
      evidence: passingEvidence(),
      createdBy: "admin-1"
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(service.submit(draft.certification.id, "admin-1").ok).toBe(true);
    const approved = service.approve({
      id: draft.certification.id,
      approvedBy: "sa-1",
      now
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(isCertificationValidForExecution(approved.certification, now)).toBe(
      true
    );

    const later = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);
    const expired = service.expireDue(later);
    expect(expired).toHaveLength(1);
    expect(expired[0].status).toBe("expired");
    expect(isCertificationValidForExecution(expired[0], later)).toBe(false);
  });

  it("revokes on incident and prompt/policy change conditions", () => {
    const service = new InMemoryReadinessService();
    const evaluation = evaluateAgentReadiness({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      evidence: passingEvidence(),
      now
    });

    function approveNew(version: string) {
      const draft = service.createDraft({
        organizationId: "org-1",
        agentName: AGENT,
        environment: "production",
        version,
        evaluation,
        evidence: passingEvidence(),
        createdBy: "admin-1"
      });
      if (!draft.ok) {
        throw new Error(draft.error);
      }
      service.submit(draft.certification.id, "admin-1");
      const approved = service.approve({
        id: draft.certification.id,
        approvedBy: "sa-1",
        now
      });
      if (!approved.ok) {
        throw new Error(approved.error);
      }
      return approved.certification;
    }

    approveNew("v1");
    const revoked = service.revokeForCondition({
      organizationId: "org-1",
      agentName: AGENT,
      reason: "SEV-1 opened: INC-42 containment in progress",
      revokedBy: "sa-1"
    });
    expect(revoked).toHaveLength(1);
    expect(revoked[0].status).toBe("revoked");
    expect(revoked[0].revoke_reason).toMatch(/SEV-1/);

    approveNew("v2");
    const promptRevoked = service.revokeForCondition({
      organizationId: "org-1",
      agentName: AGENT,
      reason: "Active prompt changed; recertification required.",
      revokedBy: "admin-1"
    });
    expect(promptRevoked[0]?.revoke_reason).toMatch(/prompt/i);

    approveNew("v3");
    const policyRevoked = service.revokeForCondition({
      organizationId: "org-1",
      reason: "Active policy changed; recertification required.",
      revokedBy: "admin-1"
    });
    expect(policyRevoked[0]?.revoke_reason).toMatch(/policy/i);
  });

  it("blocks production rollout without valid certification", () => {
    const blocked = assertRolloutAllowedByCertification({
      certification: null,
      policySetId: "policy-1",
      controlPromptVersionId: "p1",
      treatmentPromptVersionId: "p2",
      rolloutPercentage: 10,
      now
    });
    expect(blocked.ok).toBe(false);
  });

  it("allows rollout when certification matches prompts and policy", () => {
    const service = new InMemoryReadinessService();
    const evaluation = evaluateAgentReadiness({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      evidence: passingEvidence(),
      now
    });
    const draft = service.createDraft({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "production",
      version: "v1",
      evaluation,
      evidence: passingEvidence(),
      createdBy: "admin-1"
    });
    if (!draft.ok) return;
    draft.certification.policy_set_id = "policy-1";
    draft.certification.prompt_version_id = "prompt-1";
    service.submit(draft.certification.id, "admin-1");
    const approved = service.approve({
      id: draft.certification.id,
      approvedBy: "sa-1",
      now
    });
    if (!approved.ok) return;
    const ok = assertRolloutAllowedByCertification({
      certification: approved.certification,
      policySetId: "policy-1",
      controlPromptVersionId: "prompt-1",
      treatmentPromptVersionId: "prompt-2",
      rolloutPercentage: 25,
      maxApprovedPercentage: 50,
      now
    });
    expect(ok.ok).toBe(true);
  });

  it("denies production execution without certification and does not classify as transient", async () => {
    process.env.AGENT_READINESS_ENABLED = "true";
    process.env.AGENT_READINESS_PRODUCTION_REQUIRED = "true";
    process.env.AGENT_READINESS_ENVIRONMENT = "production";
    process.env.VERCEL_ENV = "production";

    const store = new InMemoryAgentExecutionStore();
    const audits: { action: string }[] = [];
    const orchestrator = new AgentOrchestrator(
      store,
      undefined,
      async (event) => {
        audits.push({ action: event.action });
      },
      undefined,
      undefined,
      undefined,
      async () => null
    );

    const result = await orchestrator.queueAgent({
      organizationId: "org-1",
      agentName: AGENT,
      targetType: "organization",
      targetId: "org-1",
      actorUserId: "user-1"
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason_code).toBe("certification_denied");
    expect(
      audits.some((a) => a.action === "agent_readiness.execution_denied")
    ).toBe(true);
    expect(classifyAgentFailure(result.error, "certification_denied")).toBe(
      "permanent"
    );
  });

  it("does not require certification in staging by default", async () => {
    process.env.AGENT_READINESS_ENABLED = "true";
    process.env.AGENT_READINESS_STAGING_REQUIRED = "false";
    process.env.AGENT_READINESS_ENVIRONMENT = "staging";
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "test";

    const store = new InMemoryAgentExecutionStore();
    const orchestrator = new AgentOrchestrator(
      store,
      undefined,
      async () => undefined,
      undefined,
      undefined,
      undefined,
      async () => null
    );

    const result = await orchestrator.queueAgent({
      organizationId: "org-1",
      agentName: AGENT,
      targetType: "organization",
      targetId: "org-1",
      actorUserId: "user-1"
    });

    expect(result.ok).toBe(true);
  });
});

describe("readiness authz and export sanitation", () => {
  it("enforces role permissions", () => {
    expect(canViewAgentReadiness([member("read_only")])).toBe(false);
    expect(canViewAgentReadiness([member("sales")])).toBe(true);
    expect(canManageOrgReadiness([member("admin")], "org-1")).toBe(true);
    expect(canManageOrgReadiness([member("sales")], "org-1")).toBe(false);
    expect(canApproveProductionReadiness([member("admin")])).toBe(false);
    expect(canApproveProductionReadiness([member("super_admin")])).toBe(true);
  });

  it("keeps org manage scoped to membership org", () => {
    expect(canManageOrgReadiness([member("admin", "org-1")], "org-2")).toBe(
      false
    );
  });

  it("sanitizes audit metadata and exports without secrets/prompts", () => {
    const sanitized = sanitizeReadinessAuditMetadata({
      agent_name: AGENT,
      api_key: "sk-secret",
      system_prompt: "do not leak",
      token: "abc",
      reason: "ok"
    });
    expect(sanitized.api_key).toBeUndefined();
    expect(sanitized.system_prompt).toBeUndefined();
    expect(sanitized.token).toBeUndefined();
    expect(sanitized.reason).toBe("ok");

    const service = new InMemoryReadinessService();
    const evaluation = evaluateAgentReadiness({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "staging",
      evidence: passingEvidence({
        productionSupabaseVerified: undefined,
        vercelProductionVerified: undefined
      }),
      now
    });
    const draft = service.createDraft({
      organizationId: "org-1",
      agentName: AGENT,
      environment: "staging",
      version: "v1",
      evaluation,
      evidence: passingEvidence(),
      createdBy: "admin-1"
    });
    if (!draft.ok) return;
    const json = exportCertificationJson(draft.certification);
    const csv = exportCertificationCsv(draft.certification);
    const md = exportCertificationMarkdown(draft.certification);
    expect(json).not.toMatch(/sk-secret|system_prompt|private_notes/i);
    expect(csv).toMatch(/check_id/);
    expect(md).toMatch(/Agent readiness certification/);
    expect(md).not.toMatch(/OPENAI_API_KEY/);
  });
});
