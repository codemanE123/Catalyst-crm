import type {
  AgentReadinessCertification,
  ReadinessEvaluation
} from "./types";

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Exportable reports — no secrets, prompts, or private CRM data. */
export function exportCertificationJson(
  certification: AgentReadinessCertification
): string {
  const safe = {
    id: certification.id,
    organization_id: certification.organization_id,
    agent_name: certification.agent_name,
    environment: certification.environment,
    version: certification.version,
    status: certification.status,
    certification_scope: certification.certification_scope,
    policy_set_id: certification.policy_set_id,
    prompt_version_id: certification.prompt_version_id,
    rollout_id: certification.rollout_id,
    simulation_run_id: certification.simulation_run_id,
    quality_snapshot: certification.quality_snapshot,
    usage_snapshot: certification.usage_snapshot,
    risk_summary: certification.risk_summary,
    blockers: certification.blockers,
    warnings: certification.warnings,
    approved_by: certification.approved_by,
    approved_at: certification.approved_at,
    expires_at: certification.expires_at,
    revoked_by: certification.revoked_by,
    revoked_at: certification.revoked_at,
    revoke_reason: certification.revoke_reason,
    evaluation: certification.evaluation
      ? {
          overall_status: certification.evaluation.overall_status,
          blocker_count: certification.evaluation.blocker_count,
          warning_count: certification.evaluation.warning_count,
          risk_summary: certification.evaluation.risk_summary,
          checks: certification.evaluation.checks.map((row) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            status: row.status,
            blocking: row.blocking,
            evidence: row.evidence,
            source: row.source,
            remediation: row.remediation,
            checked_at: row.checked_at
          }))
        }
      : null
  };
  return JSON.stringify(safe, null, 2);
}

export function exportCertificationCsv(
  certification: AgentReadinessCertification
): string {
  const rows = [
    [
      "check_id",
      "name",
      "category",
      "status",
      "blocking",
      "evidence",
      "source",
      "remediation"
    ].join(",")
  ];
  for (const check of certification.evaluation?.checks ?? []) {
    rows.push(
      [
        check.id,
        check.name,
        check.category,
        check.status,
        String(check.blocking),
        check.evidence,
        check.source,
        check.remediation
      ]
        .map((cell) => escapeCsv(String(cell)))
        .join(",")
    );
  }
  return rows.join("\n");
}

export function exportCertificationMarkdown(
  certification: AgentReadinessCertification,
  evaluation?: ReadinessEvaluation | null
): string {
  const evalResult = evaluation ?? certification.evaluation;
  const lines = [
    `# Agent readiness certification`,
    ``,
    `- Agent: ${certification.agent_name}`,
    `- Environment: ${certification.environment}`,
    `- Scope: ${certification.certification_scope}`,
    `- Status: ${certification.status}`,
    `- Version: ${certification.version}`,
    `- Policy set: ${certification.policy_set_id ?? "n/a"}`,
    `- Prompt version: ${certification.prompt_version_id ?? "n/a"}`,
    `- Simulation run: ${certification.simulation_run_id ?? "n/a"}`,
    `- Approved by: ${certification.approved_by ?? "n/a"}`,
    `- Valid: ${certification.approved_at ?? "n/a"} → ${certification.expires_at ?? "n/a"}`,
    `- Risk: ${certification.risk_summary ?? "n/a"}`,
    ``,
    `## Blockers`,
    ...(certification.blockers.length
      ? certification.blockers.map((row) => `- ${row}`)
      : ["- None"]),
    ``,
    `## Warnings`,
    ...(certification.warnings.length
      ? certification.warnings.map((row) => `- ${row}`)
      : ["- None"]),
    ``,
    `## Checks`,
    ``
  ];

  for (const check of evalResult?.checks ?? []) {
    lines.push(
      `### ${check.name} (${check.status})`,
      `- Category: ${check.category}`,
      `- Evidence: ${check.evidence}`,
      `- Source: ${check.source}`,
      `- Remediation: ${check.remediation}`,
      ``
    );
  }

  lines.push(
    `## Rollback evidence`,
    `- See docs/deployment-runbook.md and docs/incident-response-runbook.md`,
    ``
  );

  return lines.join("\n");
}
