import {
  resolveAgentReadinessConfig,
  type AgentReadinessConfig
} from "./config";
import {
  evaluateAgentReadiness,
  isEvaluationApprovable
} from "./evaluate";
import type {
  AgentReadinessCertification,
  ReadinessEnvironment,
  ReadinessEvaluation,
  ReadinessEvidenceBundle
} from "./types";

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

type ServiceError = { ok: false; error: string };

export function isCertificationValidForExecution(
  certification: AgentReadinessCertification | null | undefined,
  now: Date = new Date()
): boolean {
  if (!certification) {
    return false;
  }
  if (certification.status !== "approved") {
    return false;
  }
  if (!certification.expires_at) {
    return false;
  }
  if (new Date(certification.expires_at).getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

/**
 * In-memory certification registry for tests and lifecycle logic.
 */
export class InMemoryReadinessService {
  certifications: AgentReadinessCertification[] = [];

  list(params?: {
    organizationId?: string | null;
    agentName?: string;
    environment?: ReadinessEnvironment;
  }): AgentReadinessCertification[] {
    return this.certifications.filter((row) => {
      if (
        params?.organizationId !== undefined &&
        row.organization_id !== params.organizationId
      ) {
        return false;
      }
      if (params?.agentName && row.agent_name !== params.agentName) {
        return false;
      }
      if (params?.environment && row.environment !== params.environment) {
        return false;
      }
      return true;
    });
  }

  getById(id: string): AgentReadinessCertification | null {
    return this.certifications.find((row) => row.id === id) ?? null;
  }

  getActiveApproved(params: {
    organizationId: string | null;
    agentName: string;
    environment: ReadinessEnvironment;
    now?: Date;
  }): AgentReadinessCertification | null {
    const now = params.now ?? new Date();
    const orgScoped = this.certifications.find(
      (row) =>
        row.organization_id === params.organizationId &&
        row.agent_name === params.agentName &&
        row.environment === params.environment &&
        isCertificationValidForExecution(row, now)
    );
    if (orgScoped) {
      return orgScoped;
    }
    return (
      this.certifications.find(
        (row) =>
          row.organization_id == null &&
          row.agent_name === params.agentName &&
          row.environment === params.environment &&
          isCertificationValidForExecution(row, now)
      ) ?? null
    );
  }

  evaluate(params: {
    organizationId: string | null;
    agentName: string;
    environment: ReadinessEnvironment;
    evidence: ReadinessEvidenceBundle;
    config?: AgentReadinessConfig;
    now?: Date;
  }): ReadinessEvaluation {
    return evaluateAgentReadiness(params);
  }

  createDraft(params: {
    organizationId: string | null;
    agentName: string;
    environment: ReadinessEnvironment;
    version: string;
    evaluation: ReadinessEvaluation;
    evidence: ReadinessEvidenceBundle;
    createdBy: string | null;
    certificationScope?: string;
  }): { ok: true; certification: AgentReadinessCertification } | ServiceError {
    const blockers = params.evaluation.checks
      .filter((row) => row.status === "FAIL" && row.blocking)
      .map((row) => row.name);
    const warnings = params.evaluation.checks
      .filter((row) => row.status === "WARNING")
      .map((row) => row.name);

    const certification: AgentReadinessCertification = {
      id: newId("arc"),
      organization_id: params.organizationId,
      agent_name: params.agentName,
      environment: params.environment,
      version: params.version,
      status: "draft",
      certification_scope:
        params.certificationScope ??
        `${params.environment}:${params.agentName}`,
      policy_set_id: params.evidence.activePolicySetId ?? null,
      prompt_version_id: params.evidence.activePromptVersionId ?? null,
      rollout_id: null,
      simulation_run_id: params.evidence.simulation?.id ?? null,
      quality_snapshot: {
        average_quality_score: params.evidence.averageQualityScore ?? null,
        average_safety_score: params.evidence.averageSafetyScore ?? null,
        citation_compliance_rate:
          params.evidence.citationComplianceRate ?? null
      },
      usage_snapshot: {
        usage_limits_configured: params.evidence.usageLimitsConfigured ?? null,
        budgets_configured: params.evidence.budgetsConfigured ?? null
      },
      risk_summary: params.evaluation.risk_summary,
      blockers,
      warnings,
      evaluation: params.evaluation,
      approved_by: null,
      approved_at: null,
      expires_at: null,
      revoked_by: null,
      revoked_at: null,
      revoke_reason: null,
      created_by: params.createdBy,
      created_at: nowIso(),
      updated_at: nowIso(),
      submitted_by: null,
      submitted_at: null,
      rejected_by: null,
      rejected_at: null,
      reject_reason: null
    };

    this.certifications.unshift(certification);
    return { ok: true, certification };
  }

  submit(
    id: string,
    submittedBy: string
  ): { ok: true; certification: AgentReadinessCertification } | ServiceError {
    const cert = this.getById(id);
    if (!cert) {
      return { ok: false, error: "Certification not found." };
    }
    if (cert.status !== "draft" && cert.status !== "rejected") {
      return { ok: false, error: "Only draft/rejected certifications can be submitted." };
    }
    cert.status = "in_review";
    cert.submitted_by = submittedBy;
    cert.submitted_at = nowIso();
    cert.updated_at = nowIso();
    return { ok: true, certification: cert };
  }

  approve(params: {
    id: string;
    approvedBy: string;
    config?: AgentReadinessConfig;
    now?: Date;
  }): { ok: true; certification: AgentReadinessCertification } | ServiceError {
    const cert = this.getById(params.id);
    if (!cert) {
      return { ok: false, error: "Certification not found." };
    }
    if (cert.status !== "in_review") {
      return { ok: false, error: "Only in_review certifications can be approved." };
    }
    if (!cert.evaluation || !isEvaluationApprovable(cert.evaluation)) {
      return {
        ok: false,
        error: "Cannot approve certification with blocking failures."
      };
    }

    const config = params.config ?? resolveAgentReadinessConfig();
    const approvedAt = nowIso(params.now);
    const expiryDays =
      cert.environment === "production"
        ? config.productionExpiryDays
        : config.stagingExpiryDays;

    cert.status = "approved";
    cert.approved_by = params.approvedBy;
    cert.approved_at = approvedAt;
    cert.expires_at = addDays(approvedAt, expiryDays);
    cert.updated_at = approvedAt;
    return { ok: true, certification: cert };
  }

  reject(params: {
    id: string;
    rejectedBy: string;
    reason: string;
  }): { ok: true; certification: AgentReadinessCertification } | ServiceError {
    const cert = this.getById(params.id);
    if (!cert) {
      return { ok: false, error: "Certification not found." };
    }
    if (cert.status !== "in_review") {
      return { ok: false, error: "Only in_review certifications can be rejected." };
    }
    cert.status = "rejected";
    cert.rejected_by = params.rejectedBy;
    cert.rejected_at = nowIso();
    cert.reject_reason = params.reason.trim();
    cert.updated_at = nowIso();
    return { ok: true, certification: cert };
  }

  revoke(params: {
    id: string;
    revokedBy: string;
    reason: string;
  }): { ok: true; certification: AgentReadinessCertification } | ServiceError {
    const cert = this.getById(params.id);
    if (!cert) {
      return { ok: false, error: "Certification not found." };
    }
    if (cert.status !== "approved") {
      return { ok: false, error: "Only approved certifications can be revoked." };
    }
    const reason = params.reason.trim();
    if (reason.length < 5) {
      return { ok: false, error: "Revocation requires an explicit reason." };
    }
    cert.status = "revoked";
    cert.revoked_by = params.revokedBy;
    cert.revoked_at = nowIso();
    cert.revoke_reason = reason;
    cert.updated_at = nowIso();
    return { ok: true, certification: cert };
  }

  expireDue(now: Date = new Date()): AgentReadinessCertification[] {
    const expired: AgentReadinessCertification[] = [];
    for (const cert of this.certifications) {
      if (
        cert.status === "approved" &&
        cert.expires_at &&
        new Date(cert.expires_at).getTime() <= now.getTime()
      ) {
        cert.status = "expired";
        cert.updated_at = now.toISOString();
        expired.push(cert);
      }
    }
    return expired;
  }

  renew(params: {
    id: string;
    evaluation: ReadinessEvaluation;
    evidence: ReadinessEvidenceBundle;
    createdBy: string | null;
  }): { ok: true; certification: AgentReadinessCertification } | ServiceError {
    const prior = this.getById(params.id);
    if (!prior) {
      return { ok: false, error: "Prior certification not found." };
    }
    return this.createDraft({
      organizationId: prior.organization_id,
      agentName: prior.agent_name,
      environment: prior.environment,
      version: `${prior.version}-renew`,
      evaluation: params.evaluation,
      evidence: params.evidence,
      createdBy: params.createdBy,
      certificationScope: prior.certification_scope
    });
  }

  /**
   * Automatic revocation conditions — always records exact reason via revoke().
   */
  revokeForCondition(params: {
    organizationId: string | null;
    agentName?: string;
    environment?: ReadinessEnvironment;
    reason: string;
    revokedBy: string;
  }): AgentReadinessCertification[] {
    const affected: AgentReadinessCertification[] = [];
    for (const cert of this.list({
      organizationId: params.organizationId,
      agentName: params.agentName,
      environment: params.environment
    })) {
      if (cert.status !== "approved") {
        continue;
      }
      const result = this.revoke({
        id: cert.id,
        revokedBy: params.revokedBy,
        reason: params.reason
      });
      if (result.ok) {
        affected.push(result.certification);
      }
    }
    return affected;
  }
}

export function assertRolloutAllowedByCertification(params: {
  certification: AgentReadinessCertification | null;
  policySetId: string | null;
  controlPromptVersionId: string;
  treatmentPromptVersionId: string;
  rolloutPercentage: number;
  maxApprovedPercentage?: number;
  now?: Date;
}): { ok: true } | { ok: false; error: string } {
  if (!isCertificationValidForExecution(params.certification, params.now)) {
    return {
      ok: false,
      error: "A valid readiness certification is required before production rollout activation."
    };
  }
  const cert = params.certification!;
  if (
    cert.policy_set_id &&
    params.policySetId &&
    cert.policy_set_id !== params.policySetId
  ) {
    return {
      ok: false,
      error: "Active policy set does not match the certification policy_set_id."
    };
  }
  if (
    cert.prompt_version_id &&
    cert.prompt_version_id !== params.controlPromptVersionId &&
    cert.prompt_version_id !== params.treatmentPromptVersionId
  ) {
    return {
      ok: false,
      error:
        "Control/treatment prompt versions are not included in the certification scope."
    };
  }
  const maxPct = params.maxApprovedPercentage ?? 100;
  if (params.rolloutPercentage > maxPct) {
    return {
      ok: false,
      error: `Rollout percentage ${params.rolloutPercentage}% exceeds approved limit ${maxPct}%.`
    };
  }
  return { ok: true };
}
