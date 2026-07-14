import {
  resolveAgentReadinessConfig,
  type AgentReadinessConfig
} from "./config";
import { runReadinessChecks } from "./checks";
import type {
  ReadinessEnvironment,
  ReadinessEvaluation,
  ReadinessEvidenceBundle,
  CheckStatus
} from "./types";

export function summarizeCheckStatus(
  checks: ReturnType<typeof runReadinessChecks>
): {
  overall_status: CheckStatus;
  blocker_count: number;
  warning_count: number;
  risk_summary: string;
} {
  const blocker_count = checks.filter(
    (row) => row.status === "FAIL" && row.blocking
  ).length;
  const warning_count = checks.filter((row) => row.status === "WARNING").length;
  const fail_count = checks.filter((row) => row.status === "FAIL").length;

  let overall_status: CheckStatus = "PASS";
  if (blocker_count > 0 || fail_count > 0) {
    overall_status = "FAIL";
  } else if (warning_count > 0) {
    overall_status = "WARNING";
  }

  // WARNING is not PASS without explicit policy — overall stays WARNING.
  const risk_summary =
    overall_status === "PASS"
      ? "All required gates passed."
      : overall_status === "WARNING"
        ? `${warning_count} warning(s); no blocking failures.`
        : `${blocker_count} blocking failure(s), ${warning_count} warning(s).`;

  return { overall_status, blocker_count, warning_count, risk_summary };
}

export function evaluateAgentReadiness(params: {
  organizationId: string | null;
  agentName: string;
  environment: ReadinessEnvironment;
  evidence: ReadinessEvidenceBundle;
  config?: AgentReadinessConfig;
  now?: Date;
}): ReadinessEvaluation {
  const config = params.config ?? resolveAgentReadinessConfig();
  const checks = runReadinessChecks({
    evidence: params.evidence,
    environment: params.environment,
    config,
    now: params.now
  });
  const summary = summarizeCheckStatus(checks);

  return {
    organization_id: params.organizationId,
    agent_name: params.agentName,
    environment: params.environment,
    evaluated_at: (params.now ?? new Date()).toISOString(),
    overall_status: summary.overall_status,
    blocker_count: summary.blocker_count,
    warning_count: summary.warning_count,
    checks,
    risk_summary: summary.risk_summary
  };
}

export function isEvaluationApprovable(
  evaluation: ReadinessEvaluation
): boolean {
  // Do not treat WARNING as PASS; still allow approval when no blockers.
  return evaluation.blocker_count === 0 && evaluation.overall_status !== "FAIL";
}
