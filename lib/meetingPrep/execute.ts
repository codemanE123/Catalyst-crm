import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentExecutorResult } from "@/lib/agents/types";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import {
  getMembershipForUser,
  getMembershipsForUser,
  shouldRedactRestrictedFields
} from "@/lib/authz";

import {
  buildMeetingPrepContextFromCandidate,
  buildMeetingPrepContextFromSchool
} from "./context";
import { generateMeetingPrepBrief } from "./generateBrief";
import type {
  MeetingPrepBrief,
  MeetingPrepPublicContext,
  MeetingPrepTargetType
} from "./types";

type BriefInsertRow = {
  organization_id: string;
  target_type: MeetingPrepTargetType;
  target_id: string;
  prospect_candidate_id: string | null;
  school_id: string | null;
  agent_execution_id: string | null;
  meeting_objective: string;
  key_context: string[];
  likely_priorities: string[];
  suggested_questions: string[];
  recommended_securecell_offering: string;
  objections_to_prepare_for: string[];
  next_step_recommendation: string;
  confidence_score: number;
  review_status: "pending_review";
};

function mapBriefRow(row: Record<string, unknown>): MeetingPrepBrief {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    target_type: row.target_type as MeetingPrepTargetType,
    target_id: String(row.target_id),
    prospect_candidate_id:
      row.prospect_candidate_id === null ? null : String(row.prospect_candidate_id),
    school_id: row.school_id === null ? null : String(row.school_id),
    meeting_objective: String(row.meeting_objective),
    key_context: Array.isArray(row.key_context)
      ? row.key_context.map((item) => String(item))
      : [],
    likely_priorities: Array.isArray(row.likely_priorities)
      ? row.likely_priorities.map((item) => String(item))
      : [],
    suggested_questions: Array.isArray(row.suggested_questions)
      ? row.suggested_questions.map((item) => String(item))
      : [],
    recommended_securecell_offering: String(row.recommended_securecell_offering),
    objections_to_prepare_for: Array.isArray(row.objections_to_prepare_for)
      ? row.objections_to_prepare_for.map((item) => String(item))
      : [],
    next_step_recommendation: String(row.next_step_recommendation),
    confidence_score: Number(row.confidence_score),
    review_status: row.review_status as MeetingPrepBrief["review_status"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

async function actorShouldRedactRestrictedFields(
  supabase: SupabaseClient,
  organizationId: string,
  actorUserId: string
): Promise<boolean> {
  const [memberships, membership] = await Promise.all([
    getMembershipsForUser(supabase, actorUserId),
    getMembershipForUser(supabase, actorUserId, organizationId)
  ]);

  return shouldRedactRestrictedFields(membership, memberships);
}

async function loadContactRoleTitles(
  supabase: SupabaseClient,
  organizationId: string,
  params: {
    schoolId?: string | null;
    targetType: MeetingPrepTargetType;
    targetId: string;
  }
): Promise<string[]> {
  const titles = new Set<string>();

  if (params.schoolId) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("role")
      .eq("school_id", params.schoolId)
      .eq("organization_id", organizationId);

    for (const contact of contacts ?? []) {
      const role = contact.role?.trim();
      if (role) {
        titles.add(role);
      }
    }
  }

  const { data: recommendations } = await supabase
    .from("prospect_contact_recommendations")
    .select("recommended_title")
    .eq("organization_id", organizationId)
    .eq("target_type", params.targetType)
    .eq("target_id", params.targetId)
    .eq("review_status", "pending_review");

  for (const recommendation of recommendations ?? []) {
    const title = recommendation.recommended_title?.trim();
    if (title) {
      titles.add(title);
    }
  }

  return [...titles].slice(0, 12);
}

async function loadSchoolMeetingPrepContext(
  supabase: SupabaseClient,
  organizationId: string,
  schoolId: string,
  actorUserId: string
): Promise<
  | { ok: true; context: MeetingPrepPublicContext }
  | { ok: false; error: string }
> {
  const redactRestricted = await actorShouldRedactRestrictedFields(
    supabase,
    organizationId,
    actorUserId
  );

  const { data: school, error } = await supabase
    .from("schools")
    .select(
      "id,organization_id,name,website,district,location,state,status,cyber_programs,workforce_development_office,career_services_office"
    )
    .eq("id", schoolId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !school) {
    return { ok: false, error: "School not found." };
  }

  const interviewSelect =
    "sentiment,notes,pain_points,buyer,pilot_interest,next_step,objections,budget";

  const [outreachResponse, followUpResponse, interviewResponse, contactRoleTitles] =
    await Promise.all([
      supabase
        .from("outreach")
        .select("channel,subject,outcome,outreach_date")
        .eq("school_id", schoolId)
        .eq("organization_id", organizationId)
        .order("outreach_date", { ascending: false })
        .limit(8),
      supabase
        .from("follow_ups")
        .select(redactRestricted ? "title,status,due_date" : "title,status,due_date")
        .eq("school_id", schoolId)
        .eq("organization_id", organizationId)
        .order("due_date", { ascending: true })
        .limit(8),
      supabase
        .from("interviews")
        .select(interviewSelect)
        .eq("school_id", schoolId)
        .eq("organization_id", organizationId)
        .order("interview_date", { ascending: false })
        .limit(6),
      loadContactRoleTitles(supabase, organizationId, {
        schoolId,
        targetType: "school",
        targetId: schoolId
      })
    ]);

  const context = buildMeetingPrepContextFromSchool({
    name: school.name,
    website: school.website,
    location: school.location,
    district: school.district,
    state: school.state,
    status: school.status,
    cyber_programs: school.cyber_programs,
    workforce_development_office: school.workforce_development_office,
    career_services_office: school.career_services_office,
    contact_role_titles: contactRoleTitles,
    outreach_summaries: (outreachResponse.data ?? []).map((row) => ({
      channel: row.channel,
      subject: row.subject,
      outcome: row.outcome,
      outreach_date: row.outreach_date
    })),
    follow_up_summaries: (followUpResponse.data ?? []).map((row) => ({
      title: row.title,
      status: row.status,
      due_date: row.due_date
    })),
    interview_summaries: (interviewResponse.data ?? []).map((row) => ({
      sentiment: row.sentiment,
      pain_points: row.pain_points,
      buyer: row.buyer,
      pilot_interest: row.pilot_interest,
      next_step: row.next_step,
      objections: redactRestricted ? null : row.objections,
      budget: redactRestricted ? null : row.budget
    }))
  });

  return { ok: true, context };
}

async function loadCandidateMeetingPrepContext(
  supabase: SupabaseClient,
  organizationId: string,
  candidateId: string,
  actorUserId: string
): Promise<
  | { ok: true; context: MeetingPrepPublicContext }
  | { ok: false; error: string }
> {
  const { data: candidate, error } = await supabase
    .from("prospect_candidates")
    .select(
      "id,organization_id,status,name,website,district,location,rationale,confidence_score,enrichment_summary,outreach_angle,recommended_next_step,promoted_school_id"
    )
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !candidate) {
    return { ok: false, error: "Prospect candidate not found." };
  }

  let outreachSummaries: MeetingPrepPublicContext["outreach_summaries"] = [];
  let followUpSummaries: MeetingPrepPublicContext["follow_up_summaries"] = [];
  let interviewSummaries: MeetingPrepPublicContext["interview_summaries"] = [];
  let contactRoleTitles = await loadContactRoleTitles(supabase, organizationId, {
    targetType: "prospect_candidate",
    targetId: candidateId,
    schoolId: candidate.promoted_school_id
  });

  if (candidate.promoted_school_id) {
    const schoolContext = await loadSchoolMeetingPrepContext(
      supabase,
      organizationId,
      candidate.promoted_school_id,
      actorUserId
    );

    if (schoolContext.ok) {
      outreachSummaries = schoolContext.context.outreach_summaries;
      followUpSummaries = schoolContext.context.follow_up_summaries;
      interviewSummaries = schoolContext.context.interview_summaries;
      contactRoleTitles = [
        ...new Set([
          ...contactRoleTitles,
          ...schoolContext.context.contact_role_titles
        ])
      ].slice(0, 12);
    }
  }

  const context = buildMeetingPrepContextFromCandidate({
    name: candidate.name,
    website: candidate.website,
    location: candidate.location,
    district: candidate.district,
    status: candidate.status,
    confidence_score: candidate.confidence_score,
    rationale: candidate.rationale,
    enrichment_summary: candidate.enrichment_summary,
    outreach_angle: candidate.outreach_angle,
    recommended_next_step: candidate.recommended_next_step,
    contact_role_titles: contactRoleTitles,
    outreach_summaries: outreachSummaries,
    follow_up_summaries: followUpSummaries,
    interview_summaries: interviewSummaries
  });

  return { ok: true, context };
}

async function replacePendingBrief(
  supabase: SupabaseClient,
  row: BriefInsertRow
): Promise<{ ok: true; brief: MeetingPrepBrief } | { ok: false; error: string }> {
  const { error: deleteError } = await supabase
    .from("meeting_prep_briefs")
    .delete()
    .eq("organization_id", row.organization_id)
    .eq("target_type", row.target_type)
    .eq("target_id", row.target_id)
    .eq("review_status", "pending_review");

  if (deleteError) {
    return { ok: false, error: "Unable to replace prior meeting prep brief." };
  }

  const { data, error: insertError } = await supabase
    .from("meeting_prep_briefs")
    .insert(row)
    .select("*")
    .single();

  if (insertError || !data) {
    return { ok: false, error: "Unable to save meeting prep brief." };
  }

  return { ok: true, brief: mapBriefRow(data) };
}

export async function fetchLatestMeetingPrepBrief(
  supabase: SupabaseClient,
  organizationId: string,
  targetType: MeetingPrepTargetType,
  targetId: string
): Promise<MeetingPrepBrief | null> {
  const { data, error } = await supabase
    .from("meeting_prep_briefs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("review_status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapBriefRow(data);
}

export async function fetchLatestMeetingPrepBriefsForCandidates(
  supabase: SupabaseClient,
  organizationId: string,
  candidateIds: string[]
): Promise<Record<string, MeetingPrepBrief>> {
  const briefsByCandidateId: Record<string, MeetingPrepBrief> = {};

  if (candidateIds.length === 0) {
    return briefsByCandidateId;
  }

  const { data, error } = await supabase
    .from("meeting_prep_briefs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("target_type", "prospect_candidate")
    .in("target_id", candidateIds)
    .eq("review_status", "pending_review")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch meeting prep briefs:", error.message);
    return briefsByCandidateId;
  }

  for (const row of data ?? []) {
    const brief = mapBriefRow(row);
    if (!briefsByCandidateId[brief.target_id]) {
      briefsByCandidateId[brief.target_id] = brief;
    }
  }

  return briefsByCandidateId;
}

export async function executeMeetingPrep(params: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  targetType: MeetingPrepTargetType;
  targetId: string;
  agentExecutionId?: string | null;
}): Promise<
  AgentExecutorResult & {
    brief?: MeetingPrepBrief;
  }
> {
  await recordAuditEvent(params.supabase, {
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: AUDIT_ACTIONS.meetingPrepRun,
    targetTable: "meeting_prep_briefs",
    recordId: params.targetId,
    metadata: {
      target_type: params.targetType,
      agent_execution_id: params.agentExecutionId ?? null
    }
  });

  const loaded =
    params.targetType === "school"
      ? await loadSchoolMeetingPrepContext(
          params.supabase,
          params.organizationId,
          params.targetId,
          params.actorUserId
        )
      : await loadCandidateMeetingPrepContext(
          params.supabase,
          params.organizationId,
          params.targetId,
          params.actorUserId
        );

  if (!loaded.ok) {
    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.meetingPrepFail,
      targetTable: "meeting_prep_briefs",
      recordId: params.targetId,
      metadata: {
        target_type: params.targetType,
        error: loaded.error
      }
    });

    return { ok: false, error_message: loaded.error };
  }

  try {
    const briefContent = generateMeetingPrepBrief(loaded.context);
    const prospectCandidateId =
      params.targetType === "prospect_candidate" ? params.targetId : null;
    const schoolId = params.targetType === "school" ? params.targetId : null;

    const saved = await replacePendingBrief(params.supabase, {
      organization_id: params.organizationId,
      target_type: params.targetType,
      target_id: params.targetId,
      prospect_candidate_id: prospectCandidateId,
      school_id: schoolId,
      agent_execution_id: params.agentExecutionId ?? null,
      meeting_objective: briefContent.meeting_objective,
      key_context: briefContent.key_context,
      likely_priorities: briefContent.likely_priorities,
      suggested_questions: briefContent.suggested_questions,
      recommended_securecell_offering: briefContent.recommended_securecell_offering,
      objections_to_prepare_for: briefContent.objections_to_prepare_for,
      next_step_recommendation: briefContent.next_step_recommendation,
      confidence_score: briefContent.confidence_score,
      review_status: "pending_review"
    });

    if (!saved.ok) {
      await recordAuditEvent(params.supabase, {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: AUDIT_ACTIONS.meetingPrepFail,
        targetTable: "meeting_prep_briefs",
        recordId: params.targetId,
        metadata: {
          target_type: params.targetType,
          error: saved.error
        }
      });

      return { ok: false, error_message: saved.error };
    }

    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.meetingPrepComplete,
      targetTable: "meeting_prep_briefs",
      recordId: saved.brief.id,
      metadata: {
        target_type: params.targetType,
        confidence_score: saved.brief.confidence_score
      }
    });

    return {
      ok: true,
      brief: saved.brief,
      metadata: {
        target_type: params.targetType,
        confidence_score: saved.brief.confidence_score
      }
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Meeting prep failed unexpectedly.";

    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.meetingPrepFail,
      targetTable: "meeting_prep_briefs",
      recordId: params.targetId,
      metadata: {
        target_type: params.targetType,
        error: message
      }
    });

    return { ok: false, error_message: message };
  }
}
