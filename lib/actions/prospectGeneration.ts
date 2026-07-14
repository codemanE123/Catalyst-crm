"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import { assertRealProviderPilotAccess } from "@/lib/agents/pilot";
import { recordLlmUsageEvent } from "@/lib/agents/usage";
import { SupabaseAgentUsageStore } from "@/lib/agents/usageStore";
import {
  parseProspectGenerationInput,
  type ProspectGenerationInput,
  type ProspectGenerationJob
} from "@/lib/prospectGeneration";
import { generateProspectCandidatesForJob } from "@/lib/prospectSources";
import { COLLEGE_SCORECARD_PROVIDER } from "@/lib/prospectSources/collegeScorecard";
import { getRecordOwnershipFields, type RecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

type ProspectJobContext =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
      user: User;
      ownership: RecordOwnershipFields;
    }
  | { ok: false; error: string };

export type CreateProspectGenerationJobResult =
  | {
      ok: true;
      job: ProspectGenerationJob;
    }
  | { ok: false; error: string };

export type ProcessProspectGenerationJobResult =
  | {
      ok: true;
      job: ProspectGenerationJob;
      candidateCount: number;
    }
  | { ok: false; error: string };

function jobIdFromFormData(formData: FormData): string | null {
  const jobId = String(formData.get("job_id") ?? "").trim();
  return jobId || null;
}

async function loadQueuedJob(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  jobId: string,
  organizationId: string
): Promise<ProspectGenerationJob | null> {
  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .select(
      "id,organization_id,created_by,job_type,status,input,summary,error_code,error_message,started_at,completed_at,created_at,updated_at"
    )
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ProspectGenerationJob;
}

async function markJobFailed(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  jobId: string,
  organizationId: string,
  errorMessage: string
) {
  const completedAt = new Date().toISOString();

  await supabase
    .from("prospect_generation_jobs")
    .update({
      status: "failed",
      error_code: "PROSPECT_GENERATION_FAILED",
      error_message: errorMessage,
      completed_at: completedAt
    })
    .eq("id", jobId)
    .eq("organization_id", organizationId);
}

async function markJobRunning(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  jobId: string,
  organizationId: string
): Promise<boolean> {
  const startedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .update({
      status: "running",
      started_at: startedAt,
      error_code: null,
      error_message: null
    })
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  return !error && Boolean(data);
}

async function requireProspectJobContext(): Promise<ProspectJobContext> {
  const supabase = await getServerSupabaseClient();

  if (!supabase) {
    return {
      ok: false,
      error: isDevelopmentEnvironment()
        ? "Supabase is not configured."
        : SUPABASE_CONFIGURATION_ERROR
    };
  }

  const user = await requireUser();

  if (!user) {
    return { ok: false, error: "Sign in to generate prospects." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return {
      ok: false,
      error: "You do not have permission to generate prospects."
    };
  }

  const membership = await requireRole(
    user,
    MUTATION_ROLES,
    ownership.organization_id
  );

  if (!membership) {
    return {
      ok: false,
      error: "You do not have permission to generate prospects."
    };
  }

  return { ok: true, supabase, user, ownership };
}

export async function createProspectGenerationJob(
  formData: FormData
): Promise<CreateProspectGenerationJobResult> {
  const parsed = parseProspectGenerationInput(formData);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const context = await requireProspectJobContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const input: ProspectGenerationInput = parsed.input;

  const pilot = await assertRealProviderPilotAccess({
    supabase,
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    agentName: "ProspectGenerationAgent",
    candidateBatchSize: input.maxResults
  });

  if (!pilot.ok) {
    return { ok: false, error: pilot.error };
  }

  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .insert({
      organization_id: ownership.organization_id,
      created_by: user.id,
      job_type: "discover_prospects",
      status: "queued",
      input
    })
    .select(
      "id,organization_id,created_by,job_type,status,input,summary,error_code,error_message,started_at,completed_at,created_at,updated_at"
    )
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create prospect generation job." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectJobCreate,
    targetTable: "prospect_generation_jobs",
    recordId: data.id,
    metadata: {
      status: "queued",
      geography: input.geography,
      max_results: input.maxResults,
      school_type_count: input.schoolTypes.length
    }
  });

  revalidatePath("/prospects/generate");

  return {
    ok: true,
    job: data as ProspectGenerationJob
  };
}

export async function processProspectGenerationJob(
  formData: FormData
): Promise<ProcessProspectGenerationJobResult> {
  const jobId = jobIdFromFormData(formData);

  if (!jobId) {
    return { ok: false, error: "Select a valid prospect generation job." };
  }

  const context = await requireProspectJobContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const job = await loadQueuedJob(supabase, jobId, ownership.organization_id);

  if (!job) {
    return {
      ok: false,
      error: "Prospect generation job not found in your organization."
    };
  }

  if (job.status !== "queued") {
    return {
      ok: false,
      error: "Only queued jobs can generate candidates."
    };
  }

  const pilot = await assertRealProviderPilotAccess({
    supabase,
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    agentName: "ProspectGenerationAgent",
    candidateBatchSize: job.input.maxResults
  });

  if (!pilot.ok) {
    return { ok: false, error: pilot.error };
  }

  const started = await markJobRunning(supabase, jobId, ownership.organization_id);

  if (!started) {
    return {
      ok: false,
      error: "This job is already being processed."
    };
  }

  const generation = await generateProspectCandidatesForJob(job.input, jobId);

  const usageStore = new SupabaseAgentUsageStore(supabase);
  const usageStatus =
    generation.summary.source === "college_scorecard"
      ? "success"
      : generation.summary.configuration_status === "disabled" ||
          generation.summary.configuration_status === "missing_api_key"
        ? "denied"
        : generation.summary.source === "stub_generator"
          ? "success"
          : "failed";

  try {
    await recordLlmUsageEvent(usageStore, {
      organizationId: ownership.organization_id,
      agentName: "ProspectGenerationAgent",
      targetType: "prospect_generation_job",
      targetId: jobId,
      provider: COLLEGE_SCORECARD_PROVIDER,
      status: usageStatus,
      denialReasonCode: generation.summary.provider_error_code ?? null,
      inputTokens: generation.summary.provider_request_count ?? 0,
      outputTokens: generation.summary.candidate_count
    });
  } catch {
    // Usage recording must not fail the discovery job.
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectJobRun,
    targetTable: "prospect_generation_jobs",
    recordId: jobId,
    metadata: {
      source: generation.summary.source,
      source_name: generation.summary.source_name ?? null,
      fallback_reason: generation.summary.fallback_reason ?? null,
      configuration_status: generation.summary.configuration_status ?? null,
      provider_error_code: generation.summary.provider_error_code ?? null,
      provider_request_count: generation.summary.provider_request_count ?? 0,
      candidate_count: generation.summary.candidate_count
    }
  });

  const drafts = generation.drafts;

  if (drafts.length > 0) {
    const { error: insertError } = await supabase.from("prospect_candidates").insert(
      drafts.map((draft) => ({
        organization_id: ownership.organization_id,
        job_id: jobId,
        status: "pending_review",
        name: draft.name,
        website: draft.website,
        district: draft.district,
        location: draft.location,
        rationale: draft.rationale,
        confidence_score: draft.confidence_score,
        source_name: draft.source_name,
        source_url: draft.source_url
      }))
    );

    if (insertError) {
      const errorMessage = "Could not save generated prospect candidates.";
      await markJobFailed(
        supabase,
        jobId,
        ownership.organization_id,
        errorMessage
      );

      await recordAuditEvent(supabase, {
        organizationId: ownership.organization_id,
        actorUserId: user.id,
        action: AUDIT_ACTIONS.prospectJobFail,
        targetTable: "prospect_generation_jobs",
        recordId: jobId,
        metadata: {
          source: generation.summary.source,
          error_code: "PROSPECT_GENERATION_FAILED"
        }
      });

      revalidatePath("/prospects/generate");

      return { ok: false, error: errorMessage };
    }
  }

  const completedAt = new Date().toISOString();
  const summary = generation.summary;

  const { data: completedJob, error: completeError } = await supabase
    .from("prospect_generation_jobs")
    .update({
      status: "completed",
      summary,
      completed_at: completedAt,
      error_code: null,
      error_message: null
    })
    .eq("id", jobId)
    .eq("organization_id", ownership.organization_id)
    .eq("status", "running")
    .select(
      "id,organization_id,created_by,job_type,status,input,summary,error_code,error_message,started_at,completed_at,created_at,updated_at"
    )
    .single();

  if (completeError || !completedJob) {
    const errorMessage = "Could not complete the prospect generation job.";
    await markJobFailed(supabase, jobId, ownership.organization_id, errorMessage);

    await recordAuditEvent(supabase, {
      organizationId: ownership.organization_id,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.prospectJobFail,
      targetTable: "prospect_generation_jobs",
      recordId: jobId,
      metadata: {
        source: generation.summary.source,
        error_code: "PROSPECT_GENERATION_FAILED"
      }
    });

    revalidatePath("/prospects/generate");

    return { ok: false, error: errorMessage };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectJobComplete,
    targetTable: "prospect_generation_jobs",
    recordId: jobId,
    metadata: {
      source: generation.summary.source,
      candidate_count: drafts.length,
      fallback_reason: generation.summary.fallback_reason ?? null
    }
  });

  revalidatePath("/prospects/generate");
  revalidatePath(`/prospects/jobs/${jobId}/review`);

  return {
    ok: true,
    job: completedJob as ProspectGenerationJob,
    candidateCount: drafts.length
  };
}
