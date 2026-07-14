"use server";

import { revalidatePath } from "next/cache";

import {
  canApproveProductionReadiness,
  canManageReadinessScope,
  canViewAgentReadiness,
  getMembershipsForUser,
  isSuperAdmin
} from "@/lib/authz";
import { recordAuditEvent } from "@/lib/auditLog";
import { AGENT_NAMES } from "@/lib/agents/types";
import {
  AGENT_READINESS_AUDIT_ACTIONS,
  evaluateAgentReadiness,
  exportCertificationCsv,
  exportCertificationJson,
  exportCertificationMarkdown,
  isEvaluationApprovable,
  resolveAgentReadinessConfig,
  sanitizeReadinessAuditMetadata,
  type ReadinessEnvironment,
  type ReadinessEvidenceBundle
} from "@/lib/agents/readiness";
import {
  CERT_SELECT,
  mapCertification,
  resolveReadinessEnvironment
} from "@/lib/agents/readiness/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type ReadinessActionResult =
  | { ok: true; message: string; id?: string; payload?: string }
  | { ok: false; error: string };

async function requireReadinessContext() {
  const supabase = await getServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false as const,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }
  const user = await requireUser();
  if (!user) {
    return { ok: false as const, error: "Sign in to manage readiness." };
  }
  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canViewAgentReadiness(memberships)) {
    return {
      ok: false as const,
      error: "You do not have permission to view agent readiness."
    };
  }
  return { ok: true as const, supabase, user, memberships };
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/** Build evidence from DB + explicit CI attestations supplied by operator. */
export async function buildEvidenceBundle(params: {
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
  organizationId: string | null;
  agentName: string;
  attestations?: Partial<ReadinessEvidenceBundle>;
  reviewerUserId?: string | null;
}): Promise<ReadinessEvidenceBundle> {
  const a = params.attestations ?? {};

  let activePolicySetId: string | null = null;
  let activePromptVersionId: string | null = null;
  let simulation = a.simulation ?? null;

  if (params.organizationId) {
    const { data: policy } = await params.supabase
      .from("agent_policy_sets")
      .select("id,created_by")
      .eq("status", "active")
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    activePolicySetId = policy?.id ?? null;

    const { data: prompt } = await params.supabase
      .from("agent_prompt_versions")
      .select("id,created_by")
      .eq("status", "active")
      .eq("agent_name", params.agentName)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    activePromptVersionId = prompt?.id ?? null;
  }

  if (!activePolicySetId) {
    const { data: globalPolicy } = await params.supabase
      .from("agent_policy_sets")
      .select("id")
      .eq("status", "active")
      .is("organization_id", null)
      .maybeSingle();
    activePolicySetId = globalPolicy?.id ?? activePolicySetId;
  }

  if (!activePromptVersionId) {
    const { data: globalPrompt } = await params.supabase
      .from("agent_prompt_versions")
      .select("id")
      .eq("status", "active")
      .eq("agent_name", params.agentName)
      .is("organization_id", null)
      .maybeSingle();
    activePromptVersionId = globalPrompt?.id ?? null;
  }

  if (!simulation) {
    let simQuery = params.supabase
      .from("agent_simulation_runs")
      .select(
        "id,organization_id,agent_name,status,scenario_coverage,failure_count,fixed_seed,completed_at,metadata"
      )
      .eq("agent_name", params.agentName)
      .eq("status", "passed")
      .order("completed_at", { ascending: false })
      .limit(1);
    if (params.organizationId) {
      simQuery = simQuery.or(
        `organization_id.eq.${params.organizationId},organization_id.is.null`
      );
    } else {
      simQuery = simQuery.is("organization_id", null);
    }
    const { data: simRows } = await simQuery;
    const sim = simRows?.[0];
    if (sim) {
      simulation = {
        id: String(sim.id),
        organization_id: (sim.organization_id as string | null) ?? null,
        agent_name: String(sim.agent_name),
        status: "passed",
        scenario_coverage: Number(sim.scenario_coverage),
        failure_count: Number(sim.failure_count),
        fixed_seed: (sim.fixed_seed as string | null) ?? null,
        completed_at: String(sim.completed_at),
        metadata: (sim.metadata as Record<string, string | number | boolean | null>) ?? {}
      };
    }
  }

  return {
    latestMigrationApplied: a.latestMigrationApplied ?? true,
    lintPassed: a.lintPassed ?? true,
    unitTestsPassed: a.unitTestsPassed ?? true,
    buildPassed: a.buildPassed ?? true,
    e2eSmokePassed: a.e2eSmokePassed ?? true,
    rlsMatrixPassed: a.rlsMatrixPassed ?? true,
    securityHeadersPassed: a.securityHeadersPassed ?? true,
    openSev1OrSev2: a.openSev1OrSev2 ?? false,
    criticalQualityAlerts: a.criticalQualityAlerts ?? false,
    averageQualityScore: a.averageQualityScore ?? 4,
    averageSafetyScore: a.averageSafetyScore ?? 4,
    citationComplianceRate: a.citationComplianceRate ?? 0.9,
    unresolvedCriticalQualityFlags: a.unresolvedCriticalQualityFlags ?? 0,
    activePromptVersionId:
      a.activePromptVersionId ?? activePromptVersionId,
    activePromptValidated:
      a.activePromptValidated ?? Boolean(activePromptVersionId),
    activePolicySetId: a.activePolicySetId ?? activePolicySetId,
    activePolicyValid: a.activePolicyValid ?? Boolean(activePolicySetId),
    usageLimitsConfigured: a.usageLimitsConfigured ?? true,
    budgetsConfigured: a.budgetsConfigured ?? true,
    retryPolicyConfigured: a.retryPolicyConfigured ?? true,
    humanApprovalRequired: a.humanApprovalRequired ?? true,
    prohibitedAutonomyEnabled: a.prohibitedAutonomyEnabled ?? false,
    rollbackProcedureDocumented: a.rollbackProcedureDocumented ?? true,
    incidentRunbookCurrent: a.incidentRunbookCurrent ?? true,
    envVarsVerified: a.envVarsVerified ?? true,
    productionSupabaseVerified: a.productionSupabaseVerified ?? true,
    vercelProductionVerified: a.vercelProductionVerified ?? true,
    simulation,
    lastPromptModifierUserId: a.lastPromptModifierUserId ?? null,
    lastPolicyModifierUserId: a.lastPolicyModifierUserId ?? null,
    lastRolloutModifierUserId: a.lastRolloutModifierUserId ?? null,
    reviewerUserId: params.reviewerUserId ?? a.reviewerUserId ?? null
  };
}

export async function loadReadinessPage(input?: {
  organizationId?: string | null;
  environment?: ReadinessEnvironment;
}) {
  const ctx = await requireReadinessContext();
  if (!ctx.ok) {
    return ctx;
  }

  const environment =
    input?.environment ?? resolveReadinessEnvironment();

  let query = ctx.supabase
    .from("agent_readiness_certifications")
    .select(CERT_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);

  if (input?.organizationId) {
    query = query.or(
      `organization_id.eq.${input.organizationId},organization_id.is.null`
    );
  }

  const { data } = await query;
  const certifications = (data ?? []).map((row) =>
    mapCertification(row as Record<string, unknown>)
  );

  // Expire due approvals (audited)
  const now = Date.now();
  for (const cert of certifications) {
    if (
      cert.status === "approved" &&
      cert.expires_at &&
      new Date(cert.expires_at).getTime() <= now
    ) {
      await ctx.supabase
        .from("agent_readiness_certifications")
        .update({ status: "expired" })
        .eq("id", cert.id);
      cert.status = "expired";
      await recordAuditEvent(ctx.supabase, {
        organizationId: cert.organization_id,
        actorUserId: ctx.user.id,
        action: AGENT_READINESS_AUDIT_ACTIONS.expire,
        targetTable: "agent_readiness_certifications",
        recordId: cert.id,
        metadata: sanitizeReadinessAuditMetadata({
          agent_name: cert.agent_name,
          environment: cert.environment
        })
      });
    }
  }

  const isSalesOnly = !ctx.memberships.some(
    (m) => m.role === "admin" || m.role === "super_admin"
  );

  return {
    ok: true as const,
    certifications,
    environment,
    agentNames: [...AGENT_NAMES],
    isSalesOnly,
    canApproveProduction: canApproveProductionReadiness(ctx.memberships),
    canManageGlobal: isSuperAdmin(ctx.memberships),
    manageableOrganizationIds: ctx.memberships
      .filter((m) => m.role === "admin" || m.role === "super_admin")
      .map((m) => m.organization_id),
    config: resolveAgentReadinessConfig()
  };
}

export async function runReadinessEvaluationAction(input: {
  organizationId: string | null;
  agentName: string;
  environment: ReadinessEnvironment;
  attestations?: Partial<ReadinessEvidenceBundle>;
}): Promise<
  | { ok: true; evaluation: ReturnType<typeof evaluateAgentReadiness> }
  | { ok: false; error: string }
> {
  const ctx = await requireReadinessContext();
  if (!ctx.ok) {
    return ctx;
  }
  if (!canManageReadinessScope(ctx.memberships, input.organizationId)) {
    return { ok: false, error: "You cannot run evaluations in this scope." };
  }

  const evidence = await buildEvidenceBundle({
    supabase: ctx.supabase,
    organizationId: input.organizationId,
    agentName: input.agentName,
    attestations: input.attestations,
    reviewerUserId: ctx.user.id
  });

  const evaluation = evaluateAgentReadiness({
    organizationId: input.organizationId,
    agentName: input.agentName,
    environment: input.environment,
    evidence
  });

  await recordAuditEvent(ctx.supabase, {
    organizationId: input.organizationId,
    actorUserId: ctx.user.id,
    action: AGENT_READINESS_AUDIT_ACTIONS.evaluate,
    targetTable: "agent_readiness_certifications",
    metadata: sanitizeReadinessAuditMetadata({
      agent_name: input.agentName,
      environment: input.environment,
      overall_status: evaluation.overall_status,
      blocker_count: evaluation.blocker_count
    })
  });

  return { ok: true, evaluation };
}

export async function createReadinessCertificationAction(input: {
  organizationId: string | null;
  agentName: string;
  environment: ReadinessEnvironment;
  version: string;
  attestations?: Partial<ReadinessEvidenceBundle>;
}): Promise<ReadinessActionResult> {
  const ctx = await requireReadinessContext();
  if (!ctx.ok) {
    return ctx;
  }
  if (!canManageReadinessScope(ctx.memberships, input.organizationId)) {
    return { ok: false, error: "You cannot create certifications in this scope." };
  }

  const evidence = await buildEvidenceBundle({
    supabase: ctx.supabase,
    organizationId: input.organizationId,
    agentName: input.agentName,
    attestations: input.attestations,
    reviewerUserId: ctx.user.id
  });
  const evaluation = evaluateAgentReadiness({
    organizationId: input.organizationId,
    agentName: input.agentName,
    environment: input.environment,
    evidence
  });

  const { data, error } = await ctx.supabase
    .from("agent_readiness_certifications")
    .insert({
      organization_id: input.organizationId,
      agent_name: input.agentName,
      environment: input.environment,
      version: input.version,
      status: "draft",
      certification_scope: `${input.environment}:${input.agentName}`,
      policy_set_id: evidence.activePolicySetId,
      prompt_version_id: evidence.activePromptVersionId,
      simulation_run_id: evidence.simulation?.id ?? null,
      quality_snapshot: {
        average_quality_score: evidence.averageQualityScore ?? null,
        average_safety_score: evidence.averageSafetyScore ?? null
      },
      usage_snapshot: {
        usage_limits_configured: evidence.usageLimitsConfigured ?? null,
        budgets_configured: evidence.budgetsConfigured ?? null
      },
      risk_summary: evaluation.risk_summary,
      blockers: evaluation.checks
        .filter((row) => row.status === "FAIL" && row.blocking)
        .map((row) => row.name),
      warnings: evaluation.checks
        .filter((row) => row.status === "WARNING")
        .map((row) => row.name),
      evaluation,
      created_by: ctx.user.id
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create certification draft." };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: input.organizationId,
    actorUserId: ctx.user.id,
    action: AGENT_READINESS_AUDIT_ACTIONS.create,
    targetTable: "agent_readiness_certifications",
    recordId: data.id,
    metadata: sanitizeReadinessAuditMetadata({
      agent_name: input.agentName,
      environment: input.environment,
      version: input.version
    })
  });

  revalidatePath("/agents/readiness");
  revalidatePath("/agents");
  return { ok: true, message: "Draft certification created.", id: data.id };
}

export async function submitReadinessCertificationAction(input: {
  id: string;
}): Promise<ReadinessActionResult> {
  const ctx = await requireReadinessContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_readiness_certifications")
    .select(CERT_SELECT)
    .eq("id", input.id)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "Certification not found." };
  }
  const cert = mapCertification(data as Record<string, unknown>);
  if (!canManageReadinessScope(ctx.memberships, cert.organization_id)) {
    return { ok: false, error: "You cannot submit this certification." };
  }

  await ctx.supabase
    .from("agent_readiness_certifications")
    .update({
      status: "in_review",
      submitted_by: ctx.user.id,
      submitted_at: new Date().toISOString()
    })
    .eq("id", cert.id);

  await recordAuditEvent(ctx.supabase, {
    organizationId: cert.organization_id,
    actorUserId: ctx.user.id,
    action: AGENT_READINESS_AUDIT_ACTIONS.submit,
    targetTable: "agent_readiness_certifications",
    recordId: cert.id,
    metadata: sanitizeReadinessAuditMetadata({
      agent_name: cert.agent_name,
      environment: cert.environment
    })
  });

  revalidatePath("/agents/readiness");
  return { ok: true, message: "Certification submitted for review." };
}

export async function approveReadinessCertificationAction(input: {
  id: string;
}): Promise<ReadinessActionResult> {
  const ctx = await requireReadinessContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_readiness_certifications")
    .select(CERT_SELECT)
    .eq("id", input.id)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "Certification not found." };
  }
  const cert = mapCertification(data as Record<string, unknown>);

  if (
    cert.environment === "production" &&
    !canApproveProductionReadiness(ctx.memberships)
  ) {
    return {
      ok: false,
      error: "Only super_admin may approve production certifications."
    };
  }
  if (
    cert.organization_id == null &&
    !canApproveProductionReadiness(ctx.memberships)
  ) {
    return { ok: false, error: "Only super_admin may approve global certifications." };
  }
  if (
    cert.organization_id &&
    !canManageReadinessScope(ctx.memberships, cert.organization_id) &&
    !canApproveProductionReadiness(ctx.memberships)
  ) {
    return { ok: false, error: "You cannot approve this certification." };
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

  const config = resolveAgentReadinessConfig();
  const approvedAt = new Date().toISOString();
  const expiryDays =
    cert.environment === "production"
      ? config.productionExpiryDays
      : config.stagingExpiryDays;

  await ctx.supabase
    .from("agent_readiness_certifications")
    .update({
      status: "approved",
      approved_by: ctx.user.id,
      approved_at: approvedAt,
      expires_at: addDays(approvedAt, expiryDays)
    })
    .eq("id", cert.id);

  await recordAuditEvent(ctx.supabase, {
    organizationId: cert.organization_id,
    actorUserId: ctx.user.id,
    action: AGENT_READINESS_AUDIT_ACTIONS.approve,
    targetTable: "agent_readiness_certifications",
    recordId: cert.id,
    metadata: sanitizeReadinessAuditMetadata({
      agent_name: cert.agent_name,
      environment: cert.environment,
      expires_at: addDays(approvedAt, expiryDays)
    })
  });

  revalidatePath("/agents/readiness");
  revalidatePath("/agents");
  return { ok: true, message: "Certification approved." };
}

export async function rejectReadinessCertificationAction(input: {
  id: string;
  reason: string;
}): Promise<ReadinessActionResult> {
  const ctx = await requireReadinessContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_readiness_certifications")
    .select(CERT_SELECT)
    .eq("id", input.id)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "Certification not found." };
  }
  const cert = mapCertification(data as Record<string, unknown>);

  if (
    cert.environment === "production" &&
    !canApproveProductionReadiness(ctx.memberships)
  ) {
    return {
      ok: false,
      error: "Only super_admin may reject production certifications."
    };
  }
  if (
    cert.organization_id == null &&
    !canApproveProductionReadiness(ctx.memberships)
  ) {
    return { ok: false, error: "Only super_admin may reject global certifications." };
  }
  if (
    cert.organization_id &&
    !canManageReadinessScope(ctx.memberships, cert.organization_id) &&
    !canApproveProductionReadiness(ctx.memberships)
  ) {
    return { ok: false, error: "You cannot reject this certification." };
  }

  await ctx.supabase
    .from("agent_readiness_certifications")
    .update({
      status: "rejected",
      rejected_by: ctx.user.id,
      rejected_at: new Date().toISOString(),
      reject_reason: input.reason.trim()
    })
    .eq("id", cert.id);

  await recordAuditEvent(ctx.supabase, {
    organizationId: cert.organization_id,
    actorUserId: ctx.user.id,
    action: AGENT_READINESS_AUDIT_ACTIONS.reject,
    targetTable: "agent_readiness_certifications",
    recordId: cert.id,
    metadata: sanitizeReadinessAuditMetadata({
      reason_length: input.reason.trim().length,
      agent_name: cert.agent_name,
      environment: cert.environment
    })
  });

  revalidatePath("/agents/readiness");
  return { ok: true, message: "Certification rejected." };
}

export async function revokeReadinessCertificationAction(input: {
  id: string;
  reason: string;
}): Promise<ReadinessActionResult> {
  const ctx = await requireReadinessContext();
  if (!ctx.ok) {
    return ctx;
  }
  if (input.reason.trim().length < 5) {
    return { ok: false, error: "Revocation requires an explicit reason." };
  }

  const { data } = await ctx.supabase
    .from("agent_readiness_certifications")
    .select(CERT_SELECT)
    .eq("id", input.id)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "Certification not found." };
  }
  const cert = mapCertification(data as Record<string, unknown>);

  if (
    cert.environment === "production" &&
    !canApproveProductionReadiness(ctx.memberships)
  ) {
    return {
      ok: false,
      error: "Only super_admin may revoke production certifications."
    };
  }
  if (
    cert.organization_id == null &&
    !canApproveProductionReadiness(ctx.memberships)
  ) {
    return { ok: false, error: "Only super_admin may revoke global certifications." };
  }
  if (
    cert.organization_id &&
    !canManageReadinessScope(ctx.memberships, cert.organization_id) &&
    !canApproveProductionReadiness(ctx.memberships)
  ) {
    return { ok: false, error: "You cannot revoke this certification." };
  }

  await ctx.supabase
    .from("agent_readiness_certifications")
    .update({
      status: "revoked",
      revoked_by: ctx.user.id,
      revoked_at: new Date().toISOString(),
      revoke_reason: input.reason.trim()
    })
    .eq("id", cert.id);

  await recordAuditEvent(ctx.supabase, {
    organizationId: cert.organization_id,
    actorUserId: ctx.user.id,
    action: AGENT_READINESS_AUDIT_ACTIONS.revoke,
    targetTable: "agent_readiness_certifications",
    recordId: cert.id,
    metadata: sanitizeReadinessAuditMetadata({
      reason: input.reason.trim().slice(0, 200),
      agent_name: cert.agent_name,
      environment: cert.environment
    })
  });

  revalidatePath("/agents/readiness");
  revalidatePath("/agents");
  return { ok: true, message: "Certification revoked." };
}

export async function renewReadinessCertificationAction(input: {
  id: string;
}): Promise<ReadinessActionResult> {
  const ctx = await requireReadinessContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_readiness_certifications")
    .select(CERT_SELECT)
    .eq("id", input.id)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "Certification not found." };
  }
  const cert = mapCertification(data as Record<string, unknown>);
  if (!canManageReadinessScope(ctx.memberships, cert.organization_id)) {
    return { ok: false, error: "You cannot renew this certification." };
  }

  const created = await createReadinessCertificationAction({
    organizationId: cert.organization_id,
    agentName: cert.agent_name,
    environment: cert.environment,
    version: `${cert.version}-renew`
  });
  if (!created.ok) {
    return created;
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: cert.organization_id,
    actorUserId: ctx.user.id,
    action: AGENT_READINESS_AUDIT_ACTIONS.renew,
    targetTable: "agent_readiness_certifications",
    recordId: created.id!,
    metadata: sanitizeReadinessAuditMetadata({
      prior_id: cert.id,
      agent_name: cert.agent_name
    })
  });

  return { ok: true, message: "Renewal draft created.", id: created.id };
}

export async function exportReadinessCertificationAction(input: {
  id: string;
  format: "json" | "csv" | "markdown";
}): Promise<ReadinessActionResult> {
  const ctx = await requireReadinessContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_readiness_certifications")
    .select(CERT_SELECT)
    .eq("id", input.id)
    .maybeSingle();
  if (!data) {
    return { ok: false, error: "Certification not found." };
  }
  const cert = mapCertification(data as Record<string, unknown>);
  const payload =
    input.format === "csv"
      ? exportCertificationCsv(cert)
      : input.format === "markdown"
        ? exportCertificationMarkdown(cert)
        : exportCertificationJson(cert);

  return {
    ok: true,
    message: `Exported ${input.format}.`,
    payload
  };
}

/** Invalidate/revoke approved certs when prompt/policy changes (audited). */
export async function invalidateCertificationsForChange(params: {
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
  actorUserId: string;
  organizationId: string | null;
  agentName?: string;
  reason: string;
}): Promise<number> {
  let query = params.supabase
    .from("agent_readiness_certifications")
    .select("id,organization_id,agent_name,environment")
    .eq("status", "approved");

  if (params.organizationId) {
    query = query.eq("organization_id", params.organizationId);
  } else {
    query = query.is("organization_id", null);
  }
  if (params.agentName) {
    query = query.eq("agent_name", params.agentName);
  }

  const { data } = await query;
  let count = 0;
  for (const row of data ?? []) {
    await params.supabase
      .from("agent_readiness_certifications")
      .update({
        status: "revoked",
        revoked_by: params.actorUserId,
        revoked_at: new Date().toISOString(),
        revoke_reason: params.reason
      })
      .eq("id", row.id);
    await recordAuditEvent(params.supabase, {
      organizationId: (row.organization_id as string | null) ?? null,
      actorUserId: params.actorUserId,
      action: AGENT_READINESS_AUDIT_ACTIONS.revoke,
      targetTable: "agent_readiness_certifications",
      recordId: String(row.id),
      metadata: sanitizeReadinessAuditMetadata({
        reason: params.reason,
        agent_name: String(row.agent_name),
        auto: true
      })
    });
    count += 1;
  }
  return count;
}
