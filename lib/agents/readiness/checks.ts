import {
  resolveAgentReadinessConfig,
  type AgentReadinessConfig
} from "./config";
import type {
  ReadinessCheckResult,
  ReadinessEvidenceBundle,
  ReadinessCategory,
  CheckStatus
} from "./types";

function nowIso(now?: Date): string {
  return (now ?? new Date()).toISOString();
}

function check(params: {
  id: string;
  name: string;
  category: ReadinessCategory;
  status: CheckStatus;
  blocking: boolean;
  evidence: string;
  source: string;
  remediation: string;
  checkedAt: string;
}): ReadinessCheckResult {
  return {
    id: params.id,
    name: params.name,
    category: params.category,
    status: params.status,
    blocking: params.blocking,
    evidence: params.evidence,
    source: params.source,
    remediation: params.remediation,
    checked_at: params.checkedAt
  };
}

function boolGate(params: {
  id: string;
  name: string;
  category: ReadinessCategory;
  value: boolean | undefined;
  blocking: boolean;
  evidencePass: string;
  evidenceFail: string;
  source: string;
  remediation: string;
  checkedAt: string;
  treatUndefinedAsFail?: boolean;
}): ReadinessCheckResult {
  const undefinedFail = params.treatUndefinedAsFail !== false;
  if (params.value === true) {
    return check({
      ...params,
      status: "PASS",
      evidence: params.evidencePass
    });
  }
  if (params.value === false || (params.value == null && undefinedFail)) {
    return check({
      ...params,
      status: "FAIL",
      evidence: params.evidenceFail
    });
  }
  return check({
    ...params,
    status: "WARNING",
    blocking: false,
    evidence: "Evidence not provided."
  });
}

/**
 * Run individual readiness checks against an evidence bundle.
 * Does not execute npm/CI itself — callers supply CI evidence.
 */
export function runReadinessChecks(params: {
  evidence: ReadinessEvidenceBundle;
  environment: "staging" | "production";
  config?: AgentReadinessConfig;
  now?: Date;
}): ReadinessCheckResult[] {
  const config = params.config ?? resolveAgentReadinessConfig();
  const checkedAt = nowIso(params.now);
  const e = params.evidence;
  const results: ReadinessCheckResult[] = [];

  results.push(
    boolGate({
      id: "migration_applied",
      name: "Latest migration applied",
      category: "Deployment",
      value: e.latestMigrationApplied,
      blocking: true,
      evidencePass: "Latest Supabase migrations reported applied.",
      evidenceFail: "Migration evidence missing or failed.",
      source: "supabase.migrations",
      remediation: "Apply pending migrations in staging/production Supabase.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "lint_passes",
      name: "Lint passes",
      category: "Code quality",
      value: e.lintPassed,
      blocking: true,
      evidencePass: "npm run lint reported success.",
      evidenceFail: "Lint failed or evidence missing.",
      source: "ci.lint",
      remediation: "Fix ESLint findings and re-run lint.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "unit_tests_pass",
      name: "Unit tests pass",
      category: "Code quality",
      value: e.unitTestsPassed,
      blocking: true,
      evidencePass: "npm test reported success.",
      evidenceFail: "Unit tests failed or evidence missing.",
      source: "ci.unit",
      remediation: "Fix failing Vitest suites.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "build_passes",
      name: "Build passes",
      category: "Code quality",
      value: e.buildPassed,
      blocking: true,
      evidencePass: "npm run build reported success.",
      evidenceFail: "Build failed or evidence missing.",
      source: "ci.build",
      remediation: "Fix TypeScript/Next build errors.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "e2e_smoke_passes",
      name: "E2E smoke passes",
      category: "Reliability",
      value: e.e2eSmokePassed,
      blocking: true,
      evidencePass: "E2E smoke suite passed.",
      evidenceFail: "E2E smoke failed or evidence missing.",
      source: "ci.e2e",
      remediation: "Run npm run test:e2e and fix failures.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "rls_matrix_passes",
      name: "RLS/security matrix passes",
      category: "Data isolation",
      value: e.rlsMatrixPassed,
      blocking: true,
      evidencePass: "RLS matrix verification passed.",
      evidenceFail: "RLS matrix failed or not verified.",
      source: "security.rls",
      remediation: "Re-run RLS matrix and fix org isolation gaps.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "security_headers_pass",
      name: "Security headers scan passes",
      category: "Security",
      value: e.securityHeadersPassed,
      blocking: true,
      evidencePass: "Security headers scan passed.",
      evidenceFail: "Security headers scan failed or missing.",
      source: "security.headers",
      remediation: "Fix header configuration and rescan securityheaders.com.",
      checkedAt
    })
  );

  results.push(
    check({
      id: "open_sev_incidents",
      name: "No open SEV-1 or SEV-2 incidents",
      category: "Incident readiness",
      status: e.openSev1OrSev2 ? "FAIL" : "PASS",
      blocking: true,
      evidence: e.openSev1OrSev2
        ? "Open SEV-1/SEV-2 incident reported."
        : "No open SEV-1/SEV-2 incidents reported.",
      source: "incident.tracker",
      remediation: "Resolve or contain SEV-1/SEV-2 before certification.",
      checkedAt
    })
  );

  results.push(
    check({
      id: "critical_quality_alerts",
      name: "No critical quality alerts",
      category: "Quality",
      status: e.criticalQualityAlerts ? "FAIL" : "PASS",
      blocking: true,
      evidence: e.criticalQualityAlerts
        ? "Critical quality alerts are open."
        : "No critical quality alerts.",
      source: "quality.alerts",
      remediation: "Clear critical quality alerts in Agent Ops.",
      checkedAt
    })
  );

  const quality = e.averageQualityScore;
  results.push(
    check({
      id: "min_quality_score",
      name: "Minimum quality score met",
      category: "Quality",
      status:
        quality == null
          ? "WARNING"
          : quality >= config.minQualityScore
            ? "PASS"
            : "FAIL",
      blocking: quality != null && quality < config.minQualityScore,
      evidence:
        quality == null
          ? "No evaluation sample available."
          : `Average quality ${quality} (min ${config.minQualityScore}).`,
      source: "quality.evaluations",
      remediation: "Improve agent outputs or gather more human reviews.",
      checkedAt
    })
  );

  const safety = e.averageSafetyScore;
  results.push(
    check({
      id: "min_safety_score",
      name: "Minimum safety score met",
      category: "Quality",
      status:
        safety == null
          ? "WARNING"
          : safety >= config.minSafetyScore
            ? "PASS"
            : "FAIL",
      blocking: safety != null && safety < config.minSafetyScore,
      evidence:
        safety == null
          ? "No safety dimension sample available."
          : `Average safety ${safety} (min ${config.minSafetyScore}).`,
      source: "quality.evaluations",
      remediation: "Address safety findings before production certification.",
      checkedAt
    })
  );

  results.push(
    check({
      id: "citation_compliance",
      name: "Citation compliance",
      category: "Quality",
      status:
        e.citationComplianceRate == null
          ? "WARNING"
          : e.citationComplianceRate >= 0.8
            ? "PASS"
            : "FAIL",
      blocking:
        e.citationComplianceRate != null && e.citationComplianceRate < 0.8,
      evidence:
        e.citationComplianceRate == null
          ? "Citation rate unavailable."
          : `Citation compliance ${(e.citationComplianceRate * 100).toFixed(0)}%.`,
      source: "quality.citations",
      remediation: "Require source citations and remediate missing evidence.",
      checkedAt
    })
  );

  results.push(
    check({
      id: "unresolved_quality_flags",
      name: "No unresolved critical quality flags",
      category: "Quality",
      status:
        (e.unresolvedCriticalQualityFlags ?? 0) > 0 ? "FAIL" : "PASS",
      blocking: (e.unresolvedCriticalQualityFlags ?? 0) > 0,
      evidence: `Unresolved critical flags: ${e.unresolvedCriticalQualityFlags ?? 0}.`,
      source: "quality.flags",
      remediation: "Resolve critical quality flags.",
      checkedAt
    })
  );

  results.push(
    check({
      id: "active_prompt_version",
      name: "Prompt version active and validated",
      category: "Prompt/version control",
      status:
        e.activePromptVersionId && e.activePromptValidated
          ? "PASS"
          : "FAIL",
      blocking: true,
      evidence:
        e.activePromptVersionId && e.activePromptValidated
          ? `Active prompt ${e.activePromptVersionId} validated.`
          : "Missing active validated prompt version.",
      source: "prompt.registry",
      remediation: "Activate and validate a prompt version for the agent.",
      checkedAt
    })
  );

  results.push(
    check({
      id: "active_policy_set",
      name: "Policy set active and valid",
      category: "Policy/configuration",
      status: e.activePolicySetId && e.activePolicyValid ? "PASS" : "FAIL",
      blocking: true,
      evidence:
        e.activePolicySetId && e.activePolicyValid
          ? `Active policy ${e.activePolicySetId} valid.`
          : "Missing active valid policy set.",
      source: "policy.console",
      remediation: "Activate a valid policy set for the organization scope.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "usage_limits_configured",
      name: "Usage limits configured",
      category: "Cost controls",
      value: e.usageLimitsConfigured,
      blocking: true,
      evidencePass: "Usage limits configured.",
      evidenceFail: "Usage limits not configured.",
      source: "policy.limits",
      remediation: "Set max executions/LLM calls in active policy.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "budgets_configured",
      name: "Budgets configured",
      category: "Cost controls",
      value: e.budgetsConfigured,
      blocking: true,
      evidencePass: "Daily/monthly budgets configured.",
      evidenceFail: "Budgets missing.",
      source: "policy.budgets",
      remediation: "Configure daily_budget_usd and monthly_budget_usd.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "retry_policy_configured",
      name: "Retry policy configured",
      category: "Reliability",
      value: e.retryPolicyConfigured,
      blocking: true,
      evidencePass: "Retry policy configured.",
      evidenceFail: "Retry policy missing.",
      source: "policy.retry",
      remediation: "Set max_retry_attempts in policy.",
      checkedAt
    })
  );

  results.push(
    check({
      id: "human_approval_enabled",
      name: "Human approval requirements enabled",
      category: "Human review",
      status: e.humanApprovalRequired === false ? "FAIL" : "PASS",
      blocking: e.humanApprovalRequired === false,
      evidence:
        e.humanApprovalRequired === false
          ? "Human approval requirements disabled."
          : "Human approval requirements enabled.",
      source: "policy.human_review",
      remediation: "Keep require_*_approval/review flags enabled.",
      checkedAt
    })
  );

  results.push(
    check({
      id: "prohibited_autonomy",
      name: "No prohibited autonomy settings enabled",
      category: "Agent safety",
      status: e.prohibitedAutonomyEnabled ? "FAIL" : "PASS",
      blocking: true,
      evidence: e.prohibitedAutonomyEnabled
        ? "Prohibited autonomy settings are enabled."
        : "Autonomous send/approve actions remain disabled.",
      source: "policy.autonomy",
      remediation: "Disable allow_auto_* settings; revoke break-glass if needed.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "rollback_documented",
      name: "Rollback procedure documented",
      category: "Rollback readiness",
      value: e.rollbackProcedureDocumented,
      blocking: true,
      evidencePass: "Rollback procedure documented.",
      evidenceFail: "Rollback procedure missing.",
      source: "docs.deployment-runbook",
      remediation: "Confirm deployment/incident rollback docs are current.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "incident_runbook_current",
      name: "Incident response runbook current",
      category: "Incident readiness",
      value: e.incidentRunbookCurrent,
      blocking: true,
      evidencePass: "Incident response runbook current.",
      evidenceFail: "Incident runbook missing or stale.",
      source: "docs.incident-response-runbook",
      remediation: "Update docs/incident-response-runbook.md.",
      checkedAt
    })
  );

  results.push(
    boolGate({
      id: "env_vars_verified",
      name: "Environment variables verified",
      category: "Deployment",
      value: e.envVarsVerified,
      blocking: true,
      evidencePass: "Required env vars verified.",
      evidenceFail: "Environment variable verification failed.",
      source: "ops.env",
      remediation: "Verify production/staging env in Vercel and .env.example.",
      checkedAt
    })
  );

  if (params.environment === "production") {
    results.push(
      boolGate({
        id: "production_supabase_verified",
        name: "Production Supabase verified",
        category: "Deployment",
        value: e.productionSupabaseVerified,
        blocking: true,
        evidencePass: "Production Supabase verified.",
        evidenceFail: "Production Supabase not verified.",
        source: "ops.supabase",
        remediation: "Complete production Supabase project verification.",
        checkedAt
      })
    );
    results.push(
      boolGate({
        id: "vercel_production_verified",
        name: "Vercel production deployment verified",
        category: "Deployment",
        value: e.vercelProductionVerified,
        blocking: true,
        evidencePass: "Vercel production deployment verified.",
        evidenceFail: "Vercel production not verified.",
        source: "ops.vercel",
        remediation: "Verify production Vercel project and deployment.",
        checkedAt
      })
    );
  }

  // Simulation evidence
  const sim = e.simulation;
  if (!sim) {
    results.push(
      check({
        id: "simulation_suite",
        name: "Simulation suite passes",
        category: "Agent safety",
        status: "FAIL",
        blocking: true,
        evidence: "Missing simulation evidence.",
        source: "simulation.evidence",
        remediation: "Record a passing simulation run for this agent/scope.",
        checkedAt
      })
    );
  } else {
    const ageMs =
      (params.now ?? new Date()).getTime() -
      new Date(sim.completed_at).getTime();
    const maxAgeMs = config.maxSimulationAgeHours * 60 * 60 * 1000;
    const stale = ageMs > maxAgeMs;
    if (sim.status !== "passed") {
      results.push(
        check({
          id: "simulation_suite",
          name: "Simulation suite passes",
          category: "Agent safety",
          status: "FAIL",
          blocking: true,
          evidence: `Simulation ${sim.id} failed (${sim.failure_count} failures).`,
          source: "simulation.evidence",
          remediation: "Fix failing scenarios and re-run simulation suite.",
          checkedAt
        })
      );
    } else if (stale) {
      results.push(
        check({
          id: "simulation_suite",
          name: "Simulation suite passes",
          category: "Agent safety",
          status: "FAIL",
          blocking: true,
          evidence: `Simulation ${sim.id} is stale (>${config.maxSimulationAgeHours}h).`,
          source: "simulation.evidence",
          remediation: "Re-run simulation suite; stale evidence is not accepted.",
          checkedAt
        })
      );
    } else {
      results.push(
        check({
          id: "simulation_suite",
          name: "Simulation suite passes",
          category: "Agent safety",
          status: "PASS",
          blocking: true,
          evidence: `Simulation ${sim.id} passed; coverage ${sim.scenario_coverage}; seed ${sim.fixed_seed ?? "n/a"}.`,
          source: "simulation.evidence",
          remediation: "None.",
          checkedAt
        })
      );
    }
  }

  // Separation of duties
  if (config.requireSeparationOfDuties && e.reviewerUserId) {
    const conflict =
      (e.lastPromptModifierUserId &&
        e.lastPromptModifierUserId === e.reviewerUserId) ||
      (e.lastPolicyModifierUserId &&
        e.lastPolicyModifierUserId === e.reviewerUserId) ||
      (e.lastRolloutModifierUserId &&
        e.lastRolloutModifierUserId === e.reviewerUserId);

    results.push(
      check({
        id: "separation_of_duties",
        name: "Separation of duties",
        category: "Operations",
        status: conflict ? "WARNING" : "PASS",
        blocking: false,
        evidence: conflict
          ? "Approver also modified prompt/policy/rollout recently. Soft warning only."
          : "No separation-of-duties conflict detected.",
        source: "authz.sod",
        remediation:
          "Prefer a different super_admin for production approval when possible.",
        checkedAt
      })
    );
  }

  return results;
}
