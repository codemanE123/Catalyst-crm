import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentExecutorResult } from "@/lib/agents/types";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import { fetchLatestMeetingPrepBrief } from "@/lib/meetingPrep/execute";
import type { MeetingPrepBrief } from "@/lib/meetingPrep/types";

import {
  buildProposalContextFromCandidate,
  buildProposalContextFromSchool
} from "./context";
import { generateProposalDraft } from "./generateProposal";
import type {
  ProposalDraft,
  ProposalGenerationTargetType
} from "./types";

type DraftInsertRow = {
  organization_id: string;
  target_type: ProposalGenerationTargetType;
  target_id: string;
  prospect_candidate_id: string | null;
  school_id: string | null;
  agent_execution_id: string | null;
  proposal_title: string;
  executive_summary: string;
  proposed_program: string;
  target_audience: string;
  implementation_plan: string[];
  timeline: string;
  success_metrics: string[];
  recommended_pricing_range: string;
  next_steps: string[];
  confidence_score: number;
  review_status: "pending_review";
};

function mapDraftRow(row: Record<string, unknown>): ProposalDraft {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    target_type: row.target_type as ProposalGenerationTargetType,
    target_id: String(row.target_id),
    prospect_candidate_id:
      row.prospect_candidate_id === null ? null : String(row.prospect_candidate_id),
    school_id: row.school_id === null ? null : String(row.school_id),
    proposal_title: String(row.proposal_title),
    executive_summary: String(row.executive_summary),
    proposed_program: String(row.proposed_program),
    target_audience: String(row.target_audience),
    implementation_plan: Array.isArray(row.implementation_plan)
      ? row.implementation_plan.map((item) => String(item))
      : [],
    timeline: String(row.timeline),
    success_metrics: Array.isArray(row.success_metrics)
      ? row.success_metrics.map((item) => String(item))
      : [],
    recommended_pricing_range: String(row.recommended_pricing_range),
    next_steps: Array.isArray(row.next_steps)
      ? row.next_steps.map((item) => String(item))
      : [],
    confidence_score: Number(row.confidence_score),
    review_status: row.review_status as ProposalDraft["review_status"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

async function replacePendingDraft(
  supabase: SupabaseClient,
  row: DraftInsertRow
): Promise<{ ok: true; draft: ProposalDraft } | { ok: false; error: string }> {
  const { error: deleteError } = await supabase
    .from("proposal_drafts")
    .delete()
    .eq("organization_id", row.organization_id)
    .eq("target_type", row.target_type)
    .eq("target_id", row.target_id)
    .eq("review_status", "pending_review");

  if (deleteError) {
    return { ok: false, error: "Unable to replace prior proposal draft." };
  }

  const { data, error: insertError } = await supabase
    .from("proposal_drafts")
    .insert(row)
    .select("*")
    .single();

  if (insertError || !data) {
    return { ok: false, error: "Unable to save proposal draft." };
  }

  return { ok: true, draft: mapDraftRow(data) };
}

export async function fetchLatestProposalDraft(
  supabase: SupabaseClient,
  organizationId: string,
  targetType: ProposalGenerationTargetType,
  targetId: string
): Promise<ProposalDraft | null> {
  const { data, error } = await supabase
    .from("proposal_drafts")
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

  return mapDraftRow(data);
}

export async function fetchLatestProposalDraftsForCandidates(
  supabase: SupabaseClient,
  organizationId: string,
  candidateIds: string[]
): Promise<Record<string, ProposalDraft>> {
  const draftsByCandidateId: Record<string, ProposalDraft> = {};

  if (candidateIds.length === 0) {
    return draftsByCandidateId;
  }

  const { data, error } = await supabase
    .from("proposal_drafts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("target_type", "prospect_candidate")
    .in("target_id", candidateIds)
    .eq("review_status", "pending_review")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch proposal drafts:", error.message);
    return draftsByCandidateId;
  }

  for (const row of data ?? []) {
    const draft = mapDraftRow(row);
    if (!draftsByCandidateId[draft.target_id]) {
      draftsByCandidateId[draft.target_id] = draft;
    }
  }

  return draftsByCandidateId;
}

async function loadMeetingPrepBrief(
  supabase: SupabaseClient,
  organizationId: string,
  targetType: ProposalGenerationTargetType,
  targetId: string
): Promise<MeetingPrepBrief | null> {
  return fetchLatestMeetingPrepBrief(supabase, organizationId, targetType, targetId);
}

export async function executeProposalGeneration(params: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  targetType: ProposalGenerationTargetType;
  targetId: string;
  agentExecutionId?: string | null;
}): Promise<
  AgentExecutorResult & {
    draft?: ProposalDraft;
  }
> {
  await recordAuditEvent(params.supabase, {
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: AUDIT_ACTIONS.proposalDraftRun,
    targetTable: "proposal_drafts",
    recordId: params.targetId,
    metadata: {
      target_type: params.targetType,
      agent_execution_id: params.agentExecutionId ?? null
    }
  });

  try {
    const meetingPrepBrief = await loadMeetingPrepBrief(
      params.supabase,
      params.organizationId,
      params.targetType,
      params.targetId
    );

    if (params.targetType === "school") {
      const { data: school, error } = await params.supabase
        .from("schools")
        .select(
          "id,organization_id,name,website,district,location,state,status,cyber_programs,workforce_development_office,career_services_office"
        )
        .eq("id", params.targetId)
        .eq("organization_id", params.organizationId)
        .maybeSingle();

      if (error || !school) {
        await recordAuditEvent(params.supabase, {
          organizationId: params.organizationId,
          actorUserId: params.actorUserId,
          action: AUDIT_ACTIONS.proposalDraftFail,
          targetTable: "proposal_drafts",
          recordId: params.targetId,
          metadata: { target_type: params.targetType, error: "School not found." }
        });
        return { ok: false, error_message: "School not found." };
      }

      const context = buildProposalContextFromSchool({
        name: school.name,
        website: school.website,
        location: school.location,
        district: school.district,
        state: school.state,
        status: school.status,
        cyber_programs: school.cyber_programs,
        workforce_development_office: school.workforce_development_office,
        career_services_office: school.career_services_office,
        meeting_prep_brief: meetingPrepBrief
      });

      const draftContent = generateProposalDraft(context);
      const saved = await replacePendingDraft(params.supabase, {
        organization_id: params.organizationId,
        target_type: params.targetType,
        target_id: params.targetId,
        prospect_candidate_id: null,
        school_id: params.targetId,
        agent_execution_id: params.agentExecutionId ?? null,
        proposal_title: draftContent.proposal_title,
        executive_summary: draftContent.executive_summary,
        proposed_program: draftContent.proposed_program,
        target_audience: draftContent.target_audience,
        implementation_plan: draftContent.implementation_plan,
        timeline: draftContent.timeline,
        success_metrics: draftContent.success_metrics,
        recommended_pricing_range: draftContent.recommended_pricing_range,
        next_steps: draftContent.next_steps,
        confidence_score: draftContent.confidence_score,
        review_status: "pending_review"
      });

      if (!saved.ok) {
        await recordAuditEvent(params.supabase, {
          organizationId: params.organizationId,
          actorUserId: params.actorUserId,
          action: AUDIT_ACTIONS.proposalDraftFail,
          targetTable: "proposal_drafts",
          recordId: params.targetId,
          metadata: { target_type: params.targetType, error: saved.error }
        });
        return { ok: false, error_message: saved.error };
      }

      await recordAuditEvent(params.supabase, {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: AUDIT_ACTIONS.proposalDraftComplete,
        targetTable: "proposal_drafts",
        recordId: saved.draft.id,
        metadata: {
          target_type: params.targetType,
          confidence_score: saved.draft.confidence_score
        }
      });

      return {
        ok: true,
        draft: saved.draft,
        metadata: {
          target_type: params.targetType,
          confidence_score: saved.draft.confidence_score
        }
      };
    }

    const { data: candidate, error } = await params.supabase
      .from("prospect_candidates")
      .select(
        "id,organization_id,status,name,website,district,location,rationale,confidence_score,enrichment_summary,outreach_angle,recommended_next_step,promoted_school_id"
      )
      .eq("id", params.targetId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();

    if (error || !candidate) {
      await recordAuditEvent(params.supabase, {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: AUDIT_ACTIONS.proposalDraftFail,
        targetTable: "proposal_drafts",
        recordId: params.targetId,
        metadata: {
          target_type: params.targetType,
          error: "Prospect candidate not found."
        }
      });
      return { ok: false, error_message: "Prospect candidate not found." };
    }

    let meetingPrepForCandidate = meetingPrepBrief;

    if (!meetingPrepForCandidate && candidate.promoted_school_id) {
      meetingPrepForCandidate = await loadMeetingPrepBrief(
        params.supabase,
        params.organizationId,
        "school",
        candidate.promoted_school_id
      );
    }

    const context = buildProposalContextFromCandidate({
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
      meeting_prep_brief: meetingPrepForCandidate
    });

    const draftContent = generateProposalDraft(context);
    const saved = await replacePendingDraft(params.supabase, {
      organization_id: params.organizationId,
      target_type: params.targetType,
      target_id: params.targetId,
      prospect_candidate_id: params.targetId,
      school_id: candidate.promoted_school_id,
      agent_execution_id: params.agentExecutionId ?? null,
      proposal_title: draftContent.proposal_title,
      executive_summary: draftContent.executive_summary,
      proposed_program: draftContent.proposed_program,
      target_audience: draftContent.target_audience,
      implementation_plan: draftContent.implementation_plan,
      timeline: draftContent.timeline,
      success_metrics: draftContent.success_metrics,
      recommended_pricing_range: draftContent.recommended_pricing_range,
      next_steps: draftContent.next_steps,
      confidence_score: draftContent.confidence_score,
      review_status: "pending_review"
    });

    if (!saved.ok) {
      await recordAuditEvent(params.supabase, {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: AUDIT_ACTIONS.proposalDraftFail,
        targetTable: "proposal_drafts",
        recordId: params.targetId,
        metadata: { target_type: params.targetType, error: saved.error }
      });
      return { ok: false, error_message: saved.error };
    }

    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.proposalDraftComplete,
      targetTable: "proposal_drafts",
      recordId: saved.draft.id,
      metadata: {
        target_type: params.targetType,
        confidence_score: saved.draft.confidence_score
      }
    });

    return {
      ok: true,
      draft: saved.draft,
      metadata: {
        target_type: params.targetType,
        confidence_score: saved.draft.confidence_score
      }
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Proposal generation failed unexpectedly.";

    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.proposalDraftFail,
      targetTable: "proposal_drafts",
      recordId: params.targetId,
      metadata: {
        target_type: params.targetType,
        error: message
      }
    });

    return { ok: false, error_message: message };
  }
}
