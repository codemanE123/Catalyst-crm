import { revalidatePath } from "next/cache";
import type { User } from "@supabase/supabase-js";

import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import { MUTATION_ROLES, requireRole } from "@/lib/authz";
import type { ProspectCandidate } from "@/lib/prospectGeneration";
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

type CandidateReviewRow = ProspectCandidate & {
  promoted_school_id: string | null;
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
): Promise<CandidateReviewRow | null> {
  const { data, error } = await supabase
    .from("prospect_candidates")
    .select(
      "id,organization_id,job_id,status,name,website,district,location,rationale,confidence_score,promoted_school_id,created_at,updated_at"
    )
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CandidateReviewRow;
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
