export const READINESS_ENVIRONMENTS = ["staging", "production"] as const;
export type ReadinessEnvironment = (typeof READINESS_ENVIRONMENTS)[number];

export const CERTIFICATION_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "expired",
  "revoked"
] as const;
export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

export const CHECK_STATUSES = ["PASS", "WARNING", "FAIL"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const READINESS_CATEGORIES = [
  "Code quality",
  "Security",
  "Data isolation",
  "Agent safety",
  "Human review",
  "Quality",
  "Reliability",
  "Cost controls",
  "Prompt/version control",
  "Policy/configuration",
  "Deployment",
  "Operations",
  "Incident readiness",
  "Rollback readiness"
] as const;
export type ReadinessCategory = (typeof READINESS_CATEGORIES)[number];

export type ReadinessCheckResult = {
  id: string;
  name: string;
  category: ReadinessCategory;
  status: CheckStatus;
  blocking: boolean;
  evidence: string;
  source: string;
  remediation: string;
  checked_at: string;
};

export type ReadinessEvaluation = {
  organization_id: string | null;
  agent_name: string;
  environment: ReadinessEnvironment;
  evaluated_at: string;
  overall_status: CheckStatus;
  blocker_count: number;
  warning_count: number;
  checks: ReadinessCheckResult[];
  risk_summary: string;
};

export type AgentReadinessCertification = {
  id: string;
  organization_id: string | null;
  agent_name: string;
  environment: ReadinessEnvironment;
  version: string;
  status: CertificationStatus;
  certification_scope: string;
  policy_set_id: string | null;
  prompt_version_id: string | null;
  rollout_id: string | null;
  simulation_run_id: string | null;
  quality_snapshot: Record<string, string | number | boolean | null>;
  usage_snapshot: Record<string, string | number | boolean | null>;
  risk_summary: string | null;
  blockers: string[];
  warnings: string[];
  evaluation: ReadinessEvaluation | null;
  approved_by: string | null;
  approved_at: string | null;
  expires_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_by: string | null;
  submitted_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
};

export type SimulationRunEvidence = {
  id: string;
  organization_id: string | null;
  agent_name: string;
  status: "passed" | "failed";
  scenario_coverage: number;
  failure_count: number;
  fixed_seed: string | null;
  completed_at: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type ReadinessEvidenceBundle = {
  latestMigrationApplied?: boolean;
  lintPassed?: boolean;
  unitTestsPassed?: boolean;
  buildPassed?: boolean;
  e2eSmokePassed?: boolean;
  rlsMatrixPassed?: boolean;
  securityHeadersPassed?: boolean;
  openSev1OrSev2?: boolean;
  criticalQualityAlerts?: boolean;
  averageQualityScore?: number | null;
  averageSafetyScore?: number | null;
  citationComplianceRate?: number | null;
  unresolvedCriticalQualityFlags?: number;
  activePromptVersionId?: string | null;
  activePromptValidated?: boolean;
  activePolicySetId?: string | null;
  activePolicyValid?: boolean;
  usageLimitsConfigured?: boolean;
  budgetsConfigured?: boolean;
  retryPolicyConfigured?: boolean;
  humanApprovalRequired?: boolean;
  prohibitedAutonomyEnabled?: boolean;
  rollbackProcedureDocumented?: boolean;
  incidentRunbookCurrent?: boolean;
  envVarsVerified?: boolean;
  productionSupabaseVerified?: boolean;
  vercelProductionVerified?: boolean;
  simulation?: SimulationRunEvidence | null;
  lastPromptModifierUserId?: string | null;
  lastPolicyModifierUserId?: string | null;
  lastRolloutModifierUserId?: string | null;
  reviewerUserId?: string | null;
  migrationChangedSinceCert?: boolean;
  securityScanFailed?: boolean;
  simulationFailed?: boolean;
  envConfigDrift?: boolean;
  rollbackUnavailable?: boolean;
  maxApprovedRolloutPercentage?: number;
};
