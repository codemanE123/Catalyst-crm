"use server";

import { revalidatePath } from "next/cache";

import {
  canManagePromptScope,
  canViewPromptRegistry,
  getMembershipsForUser,
  isSuperAdmin
} from "@/lib/authz";
import { recordAuditEvent } from "@/lib/auditLog";
import {
  PROMPT_AUDIT_ACTIONS,
  sanitizePromptAuditMetadata
} from "@/lib/agents/prompts";
import {
  listPromptVersionsFromSupabase,
  listRolloutsFromSupabase,
  mapRollout,
  ROLLOUT_SELECT
} from "@/lib/agents/prompts/supabase";
import {
  compareRolloutVariants,
  isAllowedRolloutPercentage,
  type AgentRollout,
  type VariantQualitySample
} from "@/lib/agents/rollouts";
import { activatePromptVersionAction } from "@/lib/actions/agentPrompts";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

export type RolloutActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string };

async function requireRolloutContext() {
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
    return { ok: false as const, error: "Sign in to manage rollouts." };
  }

  const memberships = await getMembershipsForUser(supabase, user.id);
  if (!canViewPromptRegistry(memberships)) {
    return {
      ok: false as const,
      error: "You do not have permission to view rollouts."
    };
  }

  return { ok: true as const, supabase, user, memberships };
}

async function loadVariantSamples(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  rollout: AgentRollout
): Promise<VariantQualitySample[]> {
  const { data: executions } = await supabase
    .from("agent_executions")
    .select("id,metadata,duration_ms")
    .contains("metadata", { rollout_id: rollout.id })
    .limit(200);

  if (!executions?.length) {
    return [];
  }

  const ids = executions.map((row) => row.id);
  const { data: evals } = await supabase
    .from("agent_evaluations")
    .select("agent_execution_id,score,outcome,metadata")
    .in("agent_execution_id", ids);

  const { data: usage } = await supabase
    .from("agent_usage_events")
    .select("agent_execution_id,estimated_cost_usd")
    .in("agent_execution_id", ids);

  const evalByExec = new Map(
    (evals ?? []).map((row) => [row.agent_execution_id as string, row])
  );
  const costByExec = new Map<string, number>();
  for (const row of usage ?? []) {
    const id = row.agent_execution_id as string;
    const cost = Number(row.estimated_cost_usd ?? 0);
    costByExec.set(id, (costByExec.get(id) ?? 0) + (Number.isFinite(cost) ? cost : 0));
  }

  return executions.map((execution) => {
    const meta = (execution.metadata ?? {}) as Record<string, unknown>;
    const evaluation = evalByExec.get(execution.id);
    const evalMeta = (evaluation?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const outcome = (evaluation?.outcome as string | null) ?? null;
    const confidence =
      typeof evalMeta.agent_confidence === "number"
        ? evalMeta.agent_confidence
        : null;

    return {
      experiment_variant:
        meta.experiment_variant === "treatment" ? "treatment" : "control",
      overall_score:
        evaluation?.score != null ? Number(evaluation.score) : null,
      outcome,
      estimated_cost_usd: costByExec.get(execution.id) ?? null,
      latency_ms:
        typeof execution.duration_ms === "number"
          ? execution.duration_ms
          : null,
      safety_flags: Array.isArray(evalMeta.low_quality_flags)
        ? evalMeta.low_quality_flags.length
        : 0,
      citation_present: Boolean(evalMeta.citation_present),
      high_confidence_rejection:
        outcome === "rejected" && confidence != null && confidence >= 0.8
    };
  });
}

export async function loadRolloutsPage() {
  const ctx = await requireRolloutContext();
  if (!ctx.ok) {
    return ctx;
  }

  const [rollouts, versions] = await Promise.all([
    listRolloutsFromSupabase(ctx.supabase),
    listPromptVersionsFromSupabase(ctx.supabase)
  ]);

  const versionById = new Map(versions.map((row) => [row.id, row]));
  const comparisons = await Promise.all(
    rollouts.map(async (rollout) => {
      const samples = await loadVariantSamples(ctx.supabase, rollout);
      return {
        rolloutId: rollout.id,
        metrics: compareRolloutVariants(samples)
      };
    })
  );

  const comparisonById = Object.fromEntries(
    comparisons.map((row) => [row.rolloutId, row.metrics])
  );

  return {
    ok: true as const,
    rollouts,
    versionById: Object.fromEntries(versionById),
    comparisonById,
    canManageGlobal: isSuperAdmin(ctx.memberships),
    isSalesReadOnly: !ctx.memberships.some(
      (m) => m.role === "admin" || m.role === "super_admin"
    ),
    versions
  };
}

export async function createRolloutAction(input: {
  organizationId: string | null;
  agentName: string;
  promptKey: string;
  controlPromptVersionId: string;
  treatmentPromptVersionId: string;
  rolloutType: AgentRollout["rollout_type"];
  rolloutPercentage: number;
  allowlist?: string[];
}): Promise<RolloutActionResult> {
  const ctx = await requireRolloutContext();
  if (!ctx.ok) {
    return ctx;
  }

  if (!canManagePromptScope(ctx.memberships, input.organizationId)) {
    return { ok: false, error: "You cannot create rollouts in this scope." };
  }

  if (
    input.rolloutType === "percentage" &&
    !isAllowedRolloutPercentage(input.rolloutPercentage)
  ) {
    return {
      ok: false,
      error: "Percentage must be one of 0, 10, 25, 50, or 100."
    };
  }

  const metadata: AgentRollout["metadata"] = {};
  if (input.rolloutType === "organization_allowlist" && input.allowlist) {
    metadata.organization_allowlist = input.allowlist;
  }
  if (input.rolloutType === "user_allowlist" && input.allowlist) {
    metadata.user_allowlist = input.allowlist;
  }

  const { data, error } = await ctx.supabase
    .from("agent_rollouts")
    .insert({
      organization_id: input.organizationId,
      agent_name: input.agentName,
      prompt_key: input.promptKey,
      control_prompt_version_id: input.controlPromptVersionId,
      treatment_prompt_version_id: input.treatmentPromptVersionId,
      rollout_type: input.rolloutType,
      rollout_percentage: input.rolloutPercentage,
      status: "draft",
      created_by: ctx.user.id,
      metadata
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create rollout." };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: input.organizationId,
    actorUserId: ctx.user.id,
    action: PROMPT_AUDIT_ACTIONS.rolloutCreate,
    targetTable: "agent_rollouts",
    recordId: data.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: input.promptKey,
      rollout_type: input.rolloutType,
      rollout_percentage: input.rolloutPercentage
    })
  });

  revalidatePath("/agents/rollouts");
  return { ok: true, message: "Rollout created.", id: data.id };
}

async function transitionRollout(
  id: string,
  next: AgentRollout["status"],
  auditAction: string
): Promise<RolloutActionResult> {
  const ctx = await requireRolloutContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_rollouts")
    .select(ROLLOUT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Rollout not found." };
  }

  const rollout = mapRollout(data as Record<string, unknown>);
  if (!canManagePromptScope(ctx.memberships, rollout.organization_id)) {
    return { ok: false, error: "You cannot manage this rollout." };
  }

  if (next === "active") {
    const { resolveAgentReadinessConfig } = await import(
      "@/lib/agents/readiness"
    );
    const { findValidCertification, resolveReadinessEnvironment } =
      await import("@/lib/agents/readiness/supabase");
    const { assertRolloutAllowedByCertification } = await import(
      "@/lib/agents/readiness"
    );
    const readiness = resolveAgentReadinessConfig();
    const environment = resolveReadinessEnvironment();
    if (
      readiness.enabled &&
      environment === "production" &&
      readiness.productionRequired
    ) {
      const certification = await findValidCertification({
        supabase: ctx.supabase,
        organizationId: rollout.organization_id,
        agentName: rollout.agent_name,
        environment: "production"
      });
      const gate = assertRolloutAllowedByCertification({
        certification,
        policySetId: null,
        controlPromptVersionId: rollout.control_prompt_version_id,
        treatmentPromptVersionId: rollout.treatment_prompt_version_id,
        rolloutPercentage: rollout.rollout_percentage
      });
      if (!gate.ok) {
        return gate;
      }
    }
  }

  const patch: Record<string, string | null> = { status: next };
  if (next === "active" && !rollout.started_at) {
    patch.started_at = new Date().toISOString();
  }
  if (next === "cancelled" || next === "completed") {
    patch.ended_at = new Date().toISOString();
  }

  const { error } = await ctx.supabase
    .from("agent_rollouts")
    .update(patch)
    .eq("id", id);

  if (error) {
    return { ok: false, error: `Could not set rollout to ${next}.` };
  }

  await recordAuditEvent(ctx.supabase, {
    organizationId: rollout.organization_id,
    actorUserId: ctx.user.id,
    action: auditAction,
    targetTable: "agent_rollouts",
    recordId: rollout.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: rollout.prompt_key,
      from_status: rollout.status,
      to_status: next
    })
  });

  revalidatePath("/agents/rollouts");
  return { ok: true, message: `Rollout ${next}.` };
}

export async function startRolloutAction(id: string) {
  return transitionRollout(id, "active", PROMPT_AUDIT_ACTIONS.rolloutStart);
}

export async function pauseRolloutAction(id: string) {
  return transitionRollout(id, "paused", PROMPT_AUDIT_ACTIONS.rolloutPause);
}

export async function resumeRolloutAction(id: string) {
  return transitionRollout(id, "active", PROMPT_AUDIT_ACTIONS.rolloutResume);
}

export async function cancelRolloutAction(id: string) {
  return transitionRollout(id, "cancelled", PROMPT_AUDIT_ACTIONS.rolloutCancel);
}

export async function promoteTreatmentAction(id: string): Promise<RolloutActionResult> {
  const ctx = await requireRolloutContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_rollouts")
    .select(ROLLOUT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Rollout not found." };
  }

  const rollout = mapRollout(data as Record<string, unknown>);
  if (!canManagePromptScope(ctx.memberships, rollout.organization_id)) {
    return { ok: false, error: "You cannot promote this rollout." };
  }

  const activated = await activatePromptVersionAction({
    id: rollout.treatment_prompt_version_id
  });
  if (!activated.ok) {
    return activated;
  }

  await ctx.supabase
    .from("agent_rollouts")
    .update({
      status: "completed",
      ended_at: new Date().toISOString()
    })
    .eq("id", id);

  await recordAuditEvent(ctx.supabase, {
    organizationId: rollout.organization_id,
    actorUserId: ctx.user.id,
    action: PROMPT_AUDIT_ACTIONS.rolloutPromote,
    targetTable: "agent_rollouts",
    recordId: rollout.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: rollout.prompt_key,
      treatment_prompt_version_id: rollout.treatment_prompt_version_id
    })
  });

  revalidatePath("/agents/rollouts");
  revalidatePath("/agents/prompts");
  return { ok: true, message: "Treatment promoted to active. Not automatic." };
}

export async function rollbackRolloutToControlAction(
  id: string
): Promise<RolloutActionResult> {
  const ctx = await requireRolloutContext();
  if (!ctx.ok) {
    return ctx;
  }

  const { data } = await ctx.supabase
    .from("agent_rollouts")
    .select(ROLLOUT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return { ok: false, error: "Rollout not found." };
  }

  const rollout = mapRollout(data as Record<string, unknown>);
  if (!canManagePromptScope(ctx.memberships, rollout.organization_id)) {
    return { ok: false, error: "You cannot roll back this rollout." };
  }

  const activated = await activatePromptVersionAction({
    id: rollout.control_prompt_version_id
  });
  if (!activated.ok) {
    return activated;
  }

  await ctx.supabase
    .from("agent_rollouts")
    .update({
      status: "completed",
      ended_at: new Date().toISOString()
    })
    .eq("id", id);

  await recordAuditEvent(ctx.supabase, {
    organizationId: rollout.organization_id,
    actorUserId: ctx.user.id,
    action: PROMPT_AUDIT_ACTIONS.rolloutRollback,
    targetTable: "agent_rollouts",
    recordId: rollout.id,
    metadata: sanitizePromptAuditMetadata({
      prompt_key: rollout.prompt_key,
      control_prompt_version_id: rollout.control_prompt_version_id
    })
  });

  revalidatePath("/agents/rollouts");
  revalidatePath("/agents/prompts");
  return { ok: true, message: "Rolled back to control version." };
}
