"use server";

import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import { MUTATION_ROLES, requireRole, getSchoolOrganizationId } from "@/lib/authz";
import { createAgentHandlerDependencies } from "@/lib/actions/agentHandlerDependencies";
import { recordLlmUsageEvent } from "@/lib/agents/usage";
import { SupabaseAgentUsageStore } from "@/lib/agents/usageStore";
import { createGatedAgentOrchestratorFromSupabase } from "@/lib/agents/worker";
import {
  getLlmEnrichmentStatus,
  resolveLlmProductionContextFromSupabase
} from "@/lib/llm";
import {
  generateProspectOutreachDraftWithLlm,
  getProspectOutreachDraftStatus
} from "@/lib/llm/outreachDraft";
import type { ProspectGenerationInput } from "@/lib/prospectGeneration";
import type { ProspectCandidate } from "@/lib/prospectGeneration";
import { buildProspectOutreachDraftInput } from "@/lib/prospectOutreachDraftInput";
import {
  buildProspectOutreachDraftNextStep,
  parseOutreachDraftSubject,
  PROSPECT_OUTREACH_DRAFT_TEMPLATE_CHANNEL,
  PROSPECT_OUTREACH_DRAFT_TEMPLATE_OUTCOME,
  todayIsoDate,
  validateProspectOutreachDraftText
} from "@/lib/prospectOutreachDraftSave";
import { revalidateSchoolViews } from "@/lib/revalidateSchoolViews";
import { getRecordOwnershipFields, type RecordOwnershipFields } from "@/lib/supabase";
import {
  getServerSupabaseClient,
  isDevelopmentEnvironment,
  requireUser,
  SUPABASE_CONFIGURATION_ERROR
} from "@/lib/supabaseServer";

type ProspectReviewContext =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>;
      user: User;
      ownership: RecordOwnershipFields;
    }
  | { ok: false; error: string };

export type ProspectCandidateActionResult =
  | {
      ok: true;
      schoolId?: string;
    }
  | { ok: false; error: string };

export type ProspectCandidateEnrichResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      error: string;
      disabled?: boolean;
    };

export type ProspectOutreachDraftResult =
  | {
      ok: true;
      draft: string;
    }
  | {
      ok: false;
      error: string;
      disabled?: boolean;
    };

export type ProspectOutreachDraftSaveResult =
  | {
      ok: true;
      outreachId: string;
      schoolId: string;
      message: string;
    }
  | {
      ok: false;
      error: string;
    };

const OUTREACH_DRAFT_ELIGIBLE_STATUSES = new Set<ProspectCandidate["status"]>([
  "pending_review",
  "approved"
]);

type CandidateReviewRow = ProspectCandidate & {
  promoted_school_id: string | null;
};

type CandidateEnrichmentRow = CandidateReviewRow & {
  enrichment_summary: string | null;
  outreach_angle: string | null;
  recommended_next_step: string | null;
  enrichment_status: ProspectCandidate["enrichment_status"];
  enriched_at: string | null;
};

async function requireProspectReviewContext(): Promise<ProspectReviewContext> {
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
    return { ok: false, error: "Sign in to review prospects." };
  }

  const ownership = await getRecordOwnershipFields();

  if (!ownership) {
    return {
      ok: false,
      error: "You do not have permission to review prospects."
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
      error: "You do not have permission to review prospects."
    };
  }

  return { ok: true, supabase, user, ownership };
}

function candidateIdFromFormData(formData: FormData): string | null {
  const candidateId = String(formData.get("candidate_id") ?? "").trim();
  return candidateId || null;
}

function jobIdFromFormData(formData: FormData): string | null {
  const jobId = String(formData.get("job_id") ?? "").trim();
  return jobId || null;
}

function resolveOwnerLabel(user: User): string {
  return user.email?.trim() || "Sales team";
}

function parseStateFromLocation(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const state = parts[parts.length - 1];

  if (state.length === 2) {
    return state.toUpperCase();
  }

  return state;
}

function buildSchoolDistrict(candidate: CandidateReviewRow): string {
  return candidate.district?.trim() || "Unknown";
}

function buildSchoolLocation(candidate: CandidateReviewRow): string {
  return candidate.location?.trim() || candidate.district?.trim() || "Unknown";
}

async function loadCandidateForReview(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  candidateId: string,
  organizationId: string
): Promise<CandidateEnrichmentRow | null> {
  const { data, error } = await supabase
    .from("prospect_candidates")
    .select(
      "id,organization_id,job_id,status,name,website,district,location,rationale,confidence_score,source_name,source_url,promoted_school_id,enrichment_summary,outreach_angle,recommended_next_step,enrichment_status,enriched_at,created_at,updated_at"
    )
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CandidateEnrichmentRow;
}

async function loadJobInputForCandidate(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  jobId: string,
  organizationId: string
): Promise<ProspectGenerationInput | null> {
  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .select("input,status")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data || data.status !== "completed") {
    return null;
  }

  return data.input as ProspectGenerationInput;
}

async function ensureJobIsCompleted(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  jobId: string,
  organizationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("prospect_generation_jobs")
    .select("status")
    .eq("id", jobId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return data.status === "completed";
}

async function findDuplicateSchoolId(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabaseClient>>>,
  organizationId: string,
  name: string,
  district: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("schools")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", name)
    .eq("district", district)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
}

function revalidateProspectReviewViews(jobId: string, schoolId?: string) {
  revalidatePath("/prospects/generate");
  revalidatePath(`/prospects/jobs/${jobId}/review`);
  revalidateSchoolViews(schoolId);
}

export async function approveProspectCandidate(
  formData: FormData
): Promise<ProspectCandidateActionResult> {
  const candidateId = candidateIdFromFormData(formData);
  const jobId = jobIdFromFormData(formData);

  if (!candidateId) {
    return { ok: false, error: "Select a valid prospect candidate." };
  }

  if (!jobId) {
    return { ok: false, error: "Select a valid prospect generation job." };
  }

  const context = await requireProspectReviewContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const candidate = await loadCandidateForReview(
    supabase,
    candidateId,
    ownership.organization_id
  );

  if (!candidate || candidate.job_id !== jobId) {
    return {
      ok: false,
      error: "Prospect candidate not found in your organization."
    };
  }

  const jobCompleted = await ensureJobIsCompleted(
    supabase,
    jobId,
    ownership.organization_id
  );

  if (!jobCompleted) {
    return {
      ok: false,
      error: "Only candidates from completed jobs can be approved."
    };
  }

  if (candidate.status === "approved" && candidate.promoted_school_id) {
    revalidateProspectReviewViews(jobId, candidate.promoted_school_id);
    return { ok: true, schoolId: candidate.promoted_school_id };
  }

  if (candidate.status !== "pending_review") {
    return {
      ok: false,
      error: "This prospect candidate has already been reviewed."
    };
  }

  const district = buildSchoolDistrict(candidate);
  const location = buildSchoolLocation(candidate);
  const existingSchoolId = await findDuplicateSchoolId(
    supabase,
    ownership.organization_id,
    candidate.name,
    district
  );

  if (existingSchoolId) {
    return {
      ok: false,
      error: "A school with this name already exists in your organization."
    };
  }

  const { data: insertedSchool, error: insertError } = await supabase
    .from("schools")
    .insert({
      name: candidate.name,
      website: candidate.website ?? null,
      status: "Prospect",
      owner: resolveOwnerLabel(user),
      next_step: "Initial outreach",
      notes: candidate.rationale ?? null,
      district,
      location,
      state:
        parseStateFromLocation(candidate.location) ??
        parseStateFromLocation(candidate.district),
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by,
      assigned_to: ownership.assigned_to
    })
    .select("id")
    .single();

  if (insertError || !insertedSchool) {
    if (insertError?.code === "23505") {
      return {
        ok: false,
        error: "A school with this name already exists in your organization."
      };
    }

    return { ok: false, error: "Could not approve the prospect candidate." };
  }

  const { error: updateError } = await supabase
    .from("prospect_candidates")
    .update({
      status: "approved",
      promoted_school_id: insertedSchool.id
    })
    .eq("id", candidate.id)
    .eq("organization_id", ownership.organization_id)
    .eq("status", "pending_review");

  if (updateError) {
    return { ok: false, error: "Could not approve the prospect candidate." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectCandidateApprove,
    targetTable: "prospect_candidates",
    recordId: candidate.id,
    metadata: {
      job_id: jobId,
      school_id: insertedSchool.id,
      name: candidate.name
    }
  });

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.schoolCreate,
    targetTable: "schools",
    recordId: insertedSchool.id,
    metadata: {
      name: candidate.name,
      status: "Prospect",
      owner: resolveOwnerLabel(user),
      source: "prospect_candidate_approve",
      candidate_id: candidate.id
    }
  });

  revalidateProspectReviewViews(jobId, insertedSchool.id);

  return { ok: true, schoolId: insertedSchool.id };
}

export async function rejectProspectCandidate(
  formData: FormData
): Promise<ProspectCandidateActionResult> {
  const candidateId = candidateIdFromFormData(formData);
  const jobId = jobIdFromFormData(formData);

  if (!candidateId) {
    return { ok: false, error: "Select a valid prospect candidate." };
  }

  if (!jobId) {
    return { ok: false, error: "Select a valid prospect generation job." };
  }

  const context = await requireProspectReviewContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const candidate = await loadCandidateForReview(
    supabase,
    candidateId,
    ownership.organization_id
  );

  if (!candidate || candidate.job_id !== jobId) {
    return {
      ok: false,
      error: "Prospect candidate not found in your organization."
    };
  }

  const jobCompleted = await ensureJobIsCompleted(
    supabase,
    jobId,
    ownership.organization_id
  );

  if (!jobCompleted) {
    return {
      ok: false,
      error: "Only candidates from completed jobs can be rejected."
    };
  }

  if (candidate.status === "rejected") {
    revalidateProspectReviewViews(jobId);
    return { ok: true };
  }

  if (candidate.status !== "pending_review") {
    return {
      ok: false,
      error: "This prospect candidate has already been reviewed."
    };
  }

  const { error: updateError } = await supabase
    .from("prospect_candidates")
    .update({ status: "rejected" })
    .eq("id", candidate.id)
    .eq("organization_id", ownership.organization_id)
    .eq("status", "pending_review");

  if (updateError) {
    return { ok: false, error: "Could not reject the prospect candidate." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectCandidateReject,
    targetTable: "prospect_candidates",
    recordId: candidate.id,
    metadata: {
      job_id: jobId,
      name: candidate.name
    }
  });

  revalidateProspectReviewViews(jobId);

  return { ok: true };
}

export async function enrichProspectCandidate(
  candidateId: string
): Promise<ProspectCandidateEnrichResult> {
  const trimmedCandidateId = candidateId.trim();

  if (!trimmedCandidateId) {
    return { ok: false, error: "Select a valid prospect candidate." };
  }

  const llmStatus = getLlmEnrichmentStatus();

  if (!llmStatus.enabled) {
    return {
      ok: false,
      error: llmStatus.reason,
      disabled: true
    };
  }

  const context = await requireProspectReviewContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const candidate = await loadCandidateForReview(
    supabase,
    trimmedCandidateId,
    ownership.organization_id
  );

  if (!candidate) {
    return {
      ok: false,
      error: "Prospect candidate not found in your organization."
    };
  }

  if (candidate.status !== "pending_review") {
    return {
      ok: false,
      error: "Only pending review candidates can be enriched."
    };
  }

  if (
    candidate.enrichment_status === "queued" ||
    candidate.enrichment_status === "running"
  ) {
    return {
      ok: false,
      error: "Enrichment is already in progress for this candidate."
    };
  }

  const jobInput = await loadJobInputForCandidate(
    supabase,
    candidate.job_id,
    ownership.organization_id
  );

  if (!jobInput) {
    return {
      ok: false,
      error: "Only candidates from completed jobs can be enriched."
    };
  }

  const handlerDependencies = await createAgentHandlerDependencies(supabase);
  const usageStore = new SupabaseAgentUsageStore(supabase);
  const orchestrator = createGatedAgentOrchestratorFromSupabase(supabase, {
    handlerDependencies,
    usageStore
  });

  const queued = await orchestrator.queueAgent({
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    agentName: "ProspectEnrichmentAgent",
    targetType: "prospect_candidate",
    targetId: candidate.id
  });

  if (!queued.ok) {
    const reasonCode = queued.reason_code ?? null;
    const denialStatus =
      reasonCode === "daily_budget_limit" ||
      reasonCode === "monthly_budget_limit" ||
      reasonCode === "daily_llm_limit"
        ? "budget_denied"
        : reasonCode === "feature_disabled" ||
            reasonCode === "hourly_execution_limit" ||
            reasonCode === "concurrency_limit" ||
            reasonCode === "chain_depth_exceeded" ||
            reasonCode === "certification_denied" ||
            reasonCode === "invalid_configuration"
          ? "policy_denied"
          : null;

    if (denialStatus) {
      await supabase
        .from("prospect_candidates")
        .update({ enrichment_status: denialStatus })
        .eq("id", candidate.id)
        .eq("organization_id", ownership.organization_id)
        .eq("status", "pending_review");

      await recordAuditEvent(supabase, {
        organizationId: ownership.organization_id,
        actorUserId: user.id,
        action: AUDIT_ACTIONS.prospectCandidateEnrich,
        targetTable: "prospect_candidates",
        recordId: candidate.id,
        metadata: {
          job_id: candidate.job_id,
          outcome: denialStatus,
          reason_code: reasonCode
        }
      });

      revalidateProspectReviewViews(candidate.job_id);
    }

    return {
      ok: false,
      error: queued.error,
      disabled:
        reasonCode === "feature_disabled" ||
        reasonCode === "certification_denied"
    };
  }

  const { error: updateError } = await supabase
    .from("prospect_candidates")
    .update({ enrichment_status: "queued" })
    .eq("id", candidate.id)
    .eq("organization_id", ownership.organization_id)
    .eq("status", "pending_review");

  if (updateError) {
    return {
      ok: false,
      error: "Could not mark candidate enrichment as queued."
    };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectCandidateEnrich,
    targetTable: "prospect_candidates",
    recordId: candidate.id,
    metadata: {
      job_id: candidate.job_id,
      outcome: "queued",
      agent_execution_id: queued.execution.id
    }
  });

  revalidateProspectReviewViews(candidate.job_id);

  return {
    ok: true,
    message: `Enrichment queued for ${candidate.name}. The background worker will process it shortly.`
  };
}

export async function generateProspectOutreachDraft(
  candidateId: string
): Promise<ProspectOutreachDraftResult> {
  const trimmedCandidateId = candidateId.trim();

  if (!trimmedCandidateId) {
    return { ok: false, error: "Select a valid prospect candidate." };
  }

  const draftStatus = getProspectOutreachDraftStatus();

  if (!draftStatus.enabled) {
    return {
      ok: false,
      error: draftStatus.reason,
      disabled: true
    };
  }

  const context = await requireProspectReviewContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const candidate = await loadCandidateForReview(
    supabase,
    trimmedCandidateId,
    ownership.organization_id
  );

  if (!candidate) {
    return {
      ok: false,
      error: "Prospect candidate not found in your organization."
    };
  }

  if (!OUTREACH_DRAFT_ELIGIBLE_STATUSES.has(candidate.status)) {
    return {
      ok: false,
      error: "Outreach drafts are only available for pending or approved candidates."
    };
  }

  const jobInput = await loadJobInputForCandidate(
    supabase,
    candidate.job_id,
    ownership.organization_id
  );

  if (!jobInput) {
    return {
      ok: false,
      error: "Only candidates from completed jobs can generate outreach drafts."
    };
  }

  const draftInput = buildProspectOutreachDraftInput({
    candidate,
    jobInput
  });

  const usageStore = new SupabaseAgentUsageStore(supabase);
  const gate = await resolveLlmProductionContextFromSupabase({
    supabase,
    organizationId: ownership.organization_id,
    agentName: "OutreachDraftAgent",
    actorUserId: user.id,
    targetId: candidate.id,
    usageStore
  });

  if (!gate.ok) {
    await recordAuditEvent(supabase, {
      organizationId: ownership.organization_id,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.prospectCandidateOutreachDraft,
      targetTable: "prospect_candidates",
      recordId: candidate.id,
      metadata: {
        job_id: candidate.job_id,
        outcome: "denied",
        reason_code: gate.reason_code
      }
    });

    await recordLlmUsageEvent(usageStore, {
      organizationId: ownership.organization_id,
      agentName: "OutreachDraftAgent",
      targetType: "prospect_candidate",
      targetId: candidate.id,
      provider: "openai",
      status: "denied",
      denialReasonCode: gate.reason_code
    });

    return {
      ok: false,
      error: gate.user_safe_message,
      disabled:
        gate.reason_code === "feature_disabled" ||
        gate.reason_code === "provider_disabled" ||
        gate.reason_code === "certification_denied"
    };
  }

  const draftResult = await generateProspectOutreachDraftWithLlm(
    {
      input: draftInput,
      context: {
        organization_id: ownership.organization_id,
        job_id: candidate.job_id,
        candidate_id: candidate.id
      }
    },
    {
      usageStore,
      agentName: "OutreachDraftAgent",
      productionContext: gate.context
    }
  );

  if (!draftResult.ok) {
    if (draftResult.status === "disabled") {
      return {
        ok: false,
        error: draftResult.reason,
        disabled: true
      };
    }

    await recordAuditEvent(supabase, {
      organizationId: ownership.organization_id,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.prospectCandidateOutreachDraft,
      targetTable: "prospect_candidates",
      recordId: candidate.id,
      metadata: {
        job_id: candidate.job_id,
        outcome: draftResult.status,
        reason: draftResult.reason
      }
    });

    return {
      ok: false,
      error: draftResult.reason
    };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectCandidateOutreachDraft,
    targetTable: "prospect_candidates",
    recordId: candidate.id,
    metadata: {
      job_id: candidate.job_id,
      outcome: "draft_ready",
      provider: draftResult.provider,
      model: draftResult.model,
      prompt_version: draftResult.prompt_version,
      prompt_version_id: draftResult.prompt_version_id ?? null,
      policy_set_id: draftResult.policy_set_id ?? null,
      policy_version: draftResult.policy_version ?? null,
      rollout_id: draftResult.rollout_id ?? null,
      experiment_variant: draftResult.experiment_variant ?? null,
      estimated_cost_usd: draftResult.estimated_cost_usd ?? null,
      draft_length: draftResult.data.draft_text.length
    }
  });

  return {
    ok: true,
    draft: draftResult.data.draft_text
  };
}

export async function saveProspectOutreachDraft(
  candidateId: string,
  draftText: string
): Promise<ProspectOutreachDraftSaveResult> {
  const trimmedCandidateId = candidateId.trim();
  const validatedDraft = validateProspectOutreachDraftText(draftText);

  if (!validatedDraft.ok) {
    return { ok: false, error: validatedDraft.error };
  }

  if (!trimmedCandidateId) {
    return { ok: false, error: "Select a valid prospect candidate." };
  }

  const context = await requireProspectReviewContext();

  if (!context.ok) {
    return { ok: false, error: context.error };
  }

  const { supabase, user, ownership } = context;
  const candidate = await loadCandidateForReview(
    supabase,
    trimmedCandidateId,
    ownership.organization_id
  );

  if (!candidate) {
    return {
      ok: false,
      error: "Prospect candidate not found in your organization."
    };
  }

  if (candidate.status !== "approved" || !candidate.promoted_school_id) {
    return {
      ok: false,
      error: "Save to CRM is only available for approved candidates with a promoted school."
    };
  }

  const schoolOrganizationId = await getSchoolOrganizationId(
    supabase,
    candidate.promoted_school_id
  );

  if (!schoolOrganizationId || schoolOrganizationId !== ownership.organization_id) {
    return {
      ok: false,
      error: "The promoted school was not found in your organization."
    };
  }

  const subject = parseOutreachDraftSubject(
    validatedDraft.draft,
    `Outreach draft - ${candidate.name}`
  );
  const nextStep = buildProspectOutreachDraftNextStep(
    candidate.recommended_next_step
  );

  const { data: insertedOutreach, error: insertError } = await supabase
    .from("outreach")
    .insert({
      school_id: candidate.promoted_school_id,
      channel: PROSPECT_OUTREACH_DRAFT_TEMPLATE_CHANNEL,
      subject,
      message: validatedDraft.draft,
      outcome: PROSPECT_OUTREACH_DRAFT_TEMPLATE_OUTCOME,
      outreach_date: todayIsoDate(),
      next_step: nextStep,
      owner: user.email ?? null,
      organization_id: ownership.organization_id,
      created_by: ownership.created_by,
      updated_by: ownership.updated_by,
      assigned_to: ownership.assigned_to
    })
    .select("id")
    .single();

  if (insertError || !insertedOutreach) {
    return { ok: false, error: "Could not save the outreach draft." };
  }

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.prospectCandidateOutreachDraftSave,
    targetTable: "prospect_candidates",
    recordId: candidate.id,
    metadata: {
      job_id: candidate.job_id,
      school_id: candidate.promoted_school_id,
      outreach_id: insertedOutreach.id,
      draft_length: validatedDraft.draft.length
    }
  });

  await recordAuditEvent(supabase, {
    organizationId: ownership.organization_id,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.outreachCreate,
    targetTable: "outreach",
    recordId: insertedOutreach.id,
    metadata: {
      school_id: candidate.promoted_school_id,
      channel: PROSPECT_OUTREACH_DRAFT_TEMPLATE_CHANNEL,
      outreach_date: todayIsoDate(),
      source: "prospect_candidate_outreach_draft_save",
      candidate_id: candidate.id
    }
  });

  revalidateProspectReviewViews(candidate.job_id, candidate.promoted_school_id);

  return {
    ok: true,
    outreachId: insertedOutreach.id,
    schoolId: candidate.promoted_school_id,
    message: "Outreach draft saved to CRM outreach history. Review it on the school record before sending."
  };
}
