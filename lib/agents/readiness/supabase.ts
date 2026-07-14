import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isCertificationValidForExecution,
  type AgentReadinessCertification,
  type ReadinessEnvironment
} from "./index";

const CERT_SELECT =
  "id,organization_id,agent_name,environment,version,status,certification_scope,policy_set_id,prompt_version_id,rollout_id,simulation_run_id,quality_snapshot,usage_snapshot,risk_summary,blockers,warnings,evaluation,approved_by,approved_at,expires_at,revoked_by,revoked_at,revoke_reason,submitted_by,submitted_at,rejected_by,rejected_at,reject_reason,created_by,created_at,updated_at";

export function mapCertification(
  row: Record<string, unknown>
): AgentReadinessCertification {
  return {
    id: String(row.id),
    organization_id: (row.organization_id as string | null) ?? null,
    agent_name: String(row.agent_name),
    environment: row.environment as ReadinessEnvironment,
    version: String(row.version),
    status: row.status as AgentReadinessCertification["status"],
    certification_scope: String(row.certification_scope),
    policy_set_id: (row.policy_set_id as string | null) ?? null,
    prompt_version_id: (row.prompt_version_id as string | null) ?? null,
    rollout_id: (row.rollout_id as string | null) ?? null,
    simulation_run_id: (row.simulation_run_id as string | null) ?? null,
    quality_snapshot:
      (row.quality_snapshot as AgentReadinessCertification["quality_snapshot"]) ??
      {},
    usage_snapshot:
      (row.usage_snapshot as AgentReadinessCertification["usage_snapshot"]) ??
      {},
    risk_summary: (row.risk_summary as string | null) ?? null,
    blockers: Array.isArray(row.blockers)
      ? (row.blockers as string[])
      : [],
    warnings: Array.isArray(row.warnings)
      ? (row.warnings as string[])
      : [],
    evaluation:
      (row.evaluation as AgentReadinessCertification["evaluation"]) ?? null,
    approved_by: (row.approved_by as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    expires_at: (row.expires_at as string | null) ?? null,
    revoked_by: (row.revoked_by as string | null) ?? null,
    revoked_at: (row.revoked_at as string | null) ?? null,
    revoke_reason: (row.revoke_reason as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    submitted_by: (row.submitted_by as string | null) ?? null,
    submitted_at: (row.submitted_at as string | null) ?? null,
    rejected_by: (row.rejected_by as string | null) ?? null,
    rejected_at: (row.rejected_at as string | null) ?? null,
    reject_reason: (row.reject_reason as string | null) ?? null
  };
}

export function resolveReadinessEnvironment(
  env: NodeJS.ProcessEnv = process.env
): ReadinessEnvironment {
  const explicit = (env.AGENT_READINESS_ENVIRONMENT ?? "").trim().toLowerCase();
  if (explicit === "staging" || explicit === "production") {
    return explicit;
  }
  if (env.VERCEL_ENV === "production" || env.NODE_ENV === "production") {
    return "production";
  }
  return "staging";
}

export async function findValidCertification(params: {
  supabase: SupabaseClient;
  organizationId: string | null;
  agentName: string;
  environment: ReadinessEnvironment;
  now?: Date;
}): Promise<AgentReadinessCertification | null> {
  const now = params.now ?? new Date();
  let query = params.supabase
    .from("agent_readiness_certifications")
    .select(CERT_SELECT)
    .eq("agent_name", params.agentName)
    .eq("environment", params.environment)
    .eq("status", "approved")
    .limit(10);

  if (params.organizationId) {
    query = query.or(
      `organization_id.eq.${params.organizationId},organization_id.is.null`
    );
  } else {
    query = query.is("organization_id", null);
  }

  const { data } = await query;
  const rows = (data ?? []).map((row) =>
    mapCertification(row as Record<string, unknown>)
  );

  if (params.organizationId) {
    const org = rows.find(
      (row) =>
        row.organization_id === params.organizationId &&
        isCertificationValidForExecution(row, now)
    );
    if (org) {
      return org;
    }
  }

  return (
    rows.find(
      (row) =>
        row.organization_id == null &&
        isCertificationValidForExecution(row, now)
    ) ?? null
  );
}

export { CERT_SELECT };
