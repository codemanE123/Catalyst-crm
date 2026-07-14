/**
 * Worker-side prospect enrichment execution (Phase 5.4).
 * Invoked by AgentWorker / cron — not from blocking page requests.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import type { AgentExecutorResult } from "@/lib/agents/types";
import { SupabaseAgentUsageStore } from "@/lib/agents/usageStore";
import {
  enrichProspectCandidate as invokeLlmEnrichment,
  getLlmEnrichmentStatus,
  resolveLlmProductionContextFromSupabase
} from "@/lib/llm";
import { buildProspectEnrichmentInput } from "@/lib/prospectEnrichmentInput";
import type { ProspectGenerationInput } from "@/lib/prospectGeneration";

function isBudgetDenial(code: string | null | undefined): boolean {
  return (
    code === "daily_budget_limit" ||
    code === "monthly_budget_limit" ||
    code === "daily_llm_limit"
  );
}

function isPolicyDenial(code: string | null | undefined): boolean {
  return (
    code === "feature_disabled" ||
    code === "provider_disabled" ||
    code === "model_not_approved" ||
    code === "certification_denied" ||
    code === "chain_depth_exceeded" ||
    code === "human_review_required_disabled" ||
    code === "policy" ||
    code === "hourly_execution_limit" ||
    code === "concurrency_limit"
  );
}

async function markEnrichmentStatus(
  supabase: SupabaseClient,
  params: {
    candidateId: string;
    organizationId: string;
    status:
      | "running"
      | "enriched"
      | "failed"
      | "blocked"
      | "policy_denied"
      | "budget_denied";
    patch?: Record<string, string | number | null>;
  }
): Promise<void> {
  await supabase
    .from("prospect_candidates")
    .update({
      enrichment_status: params.status,
      ...(params.patch ?? {})
    })
    .eq("id", params.candidateId)
    .eq("organization_id", params.organizationId)
    .eq("status", "pending_review");
}

export async function executeProspectCandidateEnrichment(params: {
  supabase: SupabaseClient;
  candidateId: string;
  organizationId: string;
  actorUserId: string;
  agentExecutionId?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<AgentExecutorResult> {
  const env = params.env ?? process.env;
  const llmStatus = getLlmEnrichmentStatus(env);

  if (!llmStatus.enabled) {
    await markEnrichmentStatus(params.supabase, {
      candidateId: params.candidateId,
      organizationId: params.organizationId,
      status: "failed"
    });
    return {
      ok: false,
      error_message: llmStatus.reason,
      error_code: "configuration"
    };
  }

  const { data: candidate, error: candidateError } = await params.supabase
    .from("prospect_candidates")
    .select(
      "id,organization_id,job_id,status,name,website,district,location,rationale,confidence_score,source_name,source_url,enrichment_status"
    )
    .eq("id", params.candidateId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (candidateError || !candidate) {
    return {
      ok: false,
      error_message: "Prospect candidate not found.",
      error_code: "permanent"
    };
  }

  if (candidate.status !== "pending_review") {
    return {
      ok: false,
      error_message: "Only pending review candidates can be enriched.",
      error_code: "permanent"
    };
  }

  const { data: job, error: jobError } = await params.supabase
    .from("prospect_generation_jobs")
    .select("id,input,status")
    .eq("id", candidate.job_id)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (jobError || !job || job.status !== "completed" || !job.input) {
    return {
      ok: false,
      error_message: "Only candidates from completed jobs can be enriched.",
      error_code: "permanent"
    };
  }

  await markEnrichmentStatus(params.supabase, {
    candidateId: params.candidateId,
    organizationId: params.organizationId,
    status: "running"
  });

  const usageStore = new SupabaseAgentUsageStore(params.supabase);
  const gate = await resolveLlmProductionContextFromSupabase({
    supabase: params.supabase,
    organizationId: params.organizationId,
    agentName: "ProspectEnrichmentAgent",
    actorUserId: params.actorUserId,
    targetId: params.candidateId,
    usageStore,
    env
  });

  if (!gate.ok) {
    const status = isBudgetDenial(gate.reason_code)
      ? "budget_denied"
      : isPolicyDenial(gate.reason_code)
        ? "policy_denied"
        : "blocked";

    await markEnrichmentStatus(params.supabase, {
      candidateId: params.candidateId,
      organizationId: params.organizationId,
      status
    });

    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.prospectCandidateEnrich,
      targetTable: "prospect_candidates",
      recordId: params.candidateId,
      metadata: {
        job_id: String(candidate.job_id),
        outcome: status,
        reason_code: gate.reason_code,
        agent_execution_id: params.agentExecutionId ?? null
      }
    });

    return {
      ok: false,
      error_message: gate.user_safe_message,
      error_code: gate.reason_code,
      metadata: {
        enrichment_status: status,
        reason_code: gate.reason_code
      }
    };
  }

  const enrichmentInput = buildProspectEnrichmentInput({
    candidate: {
      name: String(candidate.name),
      website: (candidate.website as string | null) ?? null,
      district: (candidate.district as string | null) ?? null,
      location: (candidate.location as string | null) ?? null,
      rationale: (candidate.rationale as string | null) ?? null,
      source_name: (candidate.source_name as string | null) ?? null,
      source_url: (candidate.source_url as string | null) ?? null
    },
    jobInput: job.input as ProspectGenerationInput
  });

  const enrichmentResult = await invokeLlmEnrichment(
    {
      input: enrichmentInput,
      context: {
        organization_id: params.organizationId,
        job_id: String(candidate.job_id),
        candidate_id: params.candidateId
      }
    },
    {
      env,
      usageStore,
      agentExecutionId: params.agentExecutionId ?? null,
      agentName: "ProspectEnrichmentAgent",
      productionContext: gate.context
    }
  );

  if (!enrichmentResult.ok) {
    if (enrichmentResult.status === "disabled") {
      await markEnrichmentStatus(params.supabase, {
        candidateId: params.candidateId,
        organizationId: params.organizationId,
        status: "failed"
      });
      return {
        ok: false,
        error_message: enrichmentResult.reason,
        error_code: "configuration"
      };
    }

    if (enrichmentResult.status === "blocked") {
      await markEnrichmentStatus(params.supabase, {
        candidateId: params.candidateId,
        organizationId: params.organizationId,
        status: "blocked"
      });
      return {
        ok: false,
        error_message: enrichmentResult.reason,
        error_code: "permanent"
      };
    }

    if (enrichmentResult.status === "validation_failed") {
      await markEnrichmentStatus(params.supabase, {
        candidateId: params.candidateId,
        organizationId: params.organizationId,
        status: "failed"
      });
      await recordAuditEvent(params.supabase, {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: AUDIT_ACTIONS.prospectCandidateEnrich,
        targetTable: "prospect_candidates",
        recordId: params.candidateId,
        metadata: {
          job_id: String(candidate.job_id),
          outcome: "failed",
          reason: enrichmentResult.reason,
          agent_execution_id: params.agentExecutionId ?? null
        }
      });
      return {
        ok: false,
        error_message: enrichmentResult.reason,
        error_code: "validation"
      };
    }

    // provider_error → retriable
    await markEnrichmentStatus(params.supabase, {
      candidateId: params.candidateId,
      organizationId: params.organizationId,
      status: "failed"
    });
    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.prospectCandidateEnrich,
      targetTable: "prospect_candidates",
      recordId: params.candidateId,
      metadata: {
        job_id: String(candidate.job_id),
        outcome: "failed",
        reason: enrichmentResult.reason,
        agent_execution_id: params.agentExecutionId ?? null,
        retryable: true
      }
    });
    return {
      ok: false,
      error_message: enrichmentResult.reason,
      error_code: "transient"
    };
  }

  const enrichedAt = new Date().toISOString();
  const { error: updateError } = await params.supabase
    .from("prospect_candidates")
    .update({
      enrichment_summary: enrichmentResult.data.public_summary,
      outreach_angle: enrichmentResult.data.outreach_angle,
      recommended_next_step: enrichmentResult.data.suggested_next_step,
      enrichment_status: "enriched",
      enriched_at: enrichedAt
    })
    .eq("id", params.candidateId)
    .eq("organization_id", params.organizationId)
    .eq("status", "pending_review");

  if (updateError) {
    return {
      ok: false,
      error_message: "Could not save prospect enrichment results.",
      error_code: "transient"
    };
  }

  await recordAuditEvent(params.supabase, {
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: AUDIT_ACTIONS.prospectCandidateEnrich,
    targetTable: "prospect_candidates",
    recordId: params.candidateId,
    metadata: {
      job_id: String(candidate.job_id),
      outcome: "enriched",
      provider: enrichmentResult.provider,
      model: enrichmentResult.model,
      prompt_version: enrichmentResult.prompt_version,
      prompt_version_id: enrichmentResult.prompt_version_id ?? null,
      policy_set_id: enrichmentResult.policy_set_id ?? null,
      policy_version: enrichmentResult.policy_version ?? null,
      rollout_id: enrichmentResult.rollout_id ?? null,
      experiment_variant: enrichmentResult.experiment_variant ?? null,
      estimated_cost_usd: enrichmentResult.estimated_cost_usd ?? null,
      enrichment_confidence: enrichmentResult.data.enrichment_confidence,
      agent_execution_id: params.agentExecutionId ?? null
    }
  });

  return {
    ok: true,
    metadata: {
      enrichment_status: "enriched",
      provider: enrichmentResult.provider,
      model: enrichmentResult.model,
      prompt_version_id: enrichmentResult.prompt_version_id ?? null,
      policy_set_id: enrichmentResult.policy_set_id ?? null
    }
  };
}

export function createProspectEnrichmentHandlerDependency(
  supabase: SupabaseClient
): Pick<
  import("@/lib/agents/handlers").AgentHandlerDependencies,
  "enrichProspectCandidate"
> {
  return {
    enrichProspectCandidate: async (input) =>
      executeProspectCandidateEnrichment({
        supabase,
        candidateId: input.candidateId,
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        agentExecutionId: input.agentExecutionId,
        env: input.env
      })
  };
}
