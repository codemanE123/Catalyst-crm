import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentExecutorResult } from "@/lib/agents/types";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/auditLog";
import type { ProspectGenerationInput } from "@/lib/prospectGeneration";

import {
  buildContactDiscoveryContextFromCandidate,
  buildContactDiscoveryContextFromSchoolPublicProfile
} from "./context";
import { recommendContactRoles } from "./recommendRoles";
import type {
  ContactDiscoveryPublicContext,
  ContactDiscoveryTargetType,
  ProspectContactRecommendation
} from "./types";

type CandidateRow = {
  id: string;
  organization_id: string;
  job_id: string;
  name: string;
  website: string | null;
  district: string | null;
  location: string | null;
  rationale: string | null;
  enrichment_summary: string | null;
  outreach_angle: string | null;
};

type SchoolRow = {
  id: string;
  organization_id: string;
  name: string;
  website: string | null;
  district: string | null;
  location: string | null;
  state: string | null;
  hbcu: boolean | null;
  community_college: boolean | null;
  cyber_programs: string | null;
  ai_programs: string | null;
  workforce_development_office: string | null;
  career_services_office: string | null;
};

type RecommendationInsertRow = {
  organization_id: string;
  target_type: ContactDiscoveryTargetType;
  target_id: string;
  prospect_candidate_id: string | null;
  school_id: string | null;
  agent_execution_id: string | null;
  recommended_title: string;
  department: string;
  priority: number;
  rationale: string;
  suggested_outreach_angle: string;
  confidence_score: number;
  review_status: "pending_review";
};

function mapRecommendationRow(row: Record<string, unknown>): ProspectContactRecommendation {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    target_type: row.target_type as ContactDiscoveryTargetType,
    target_id: String(row.target_id),
    prospect_candidate_id:
      row.prospect_candidate_id === null ? null : String(row.prospect_candidate_id),
    school_id: row.school_id === null ? null : String(row.school_id),
    recommended_title: String(row.recommended_title),
    department: String(row.department),
    priority: Number(row.priority),
    rationale: String(row.rationale),
    suggested_outreach_angle: String(row.suggested_outreach_angle),
    confidence_score: Number(row.confidence_score),
    review_status: row.review_status as ProspectContactRecommendation["review_status"],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at)
  };
}

export async function fetchContactRecommendationsForTarget(
  supabase: SupabaseClient,
  organizationId: string,
  targetType: ContactDiscoveryTargetType,
  targetId: string
): Promise<ProspectContactRecommendation[]> {
  const { data, error } = await supabase
    .from("prospect_contact_recommendations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("review_status", "pending_review")
    .order("priority", { ascending: true })
    .order("confidence_score", { ascending: false });

  if (error) {
    console.error("Failed to fetch contact recommendations:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRecommendationRow(row));
}

export async function fetchContactRecommendationsForCandidates(
  supabase: SupabaseClient,
  organizationId: string,
  candidateIds: string[]
): Promise<Map<string, ProspectContactRecommendation[]>> {
  const grouped = new Map<string, ProspectContactRecommendation[]>();

  if (candidateIds.length === 0) {
    return grouped;
  }

  const { data, error } = await supabase
    .from("prospect_contact_recommendations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("target_type", "prospect_candidate")
    .in("target_id", candidateIds)
    .eq("review_status", "pending_review")
    .order("priority", { ascending: true })
    .order("confidence_score", { ascending: false });

  if (error) {
    console.error("Failed to fetch candidate contact recommendations:", error.message);
    return grouped;
  }

  for (const row of data ?? []) {
    const recommendation = mapRecommendationRow(row);
    const existing = grouped.get(recommendation.target_id) ?? [];
    existing.push(recommendation);
    grouped.set(recommendation.target_id, existing);
  }

  return grouped;
}

async function loadCandidateContext(
  supabase: SupabaseClient,
  organizationId: string,
  candidateId: string
): Promise<
  | {
      ok: true;
      candidate: CandidateRow;
      context: ContactDiscoveryPublicContext;
    }
  | { ok: false; error: string }
> {
  const { data: candidate, error } = await supabase
    .from("prospect_candidates")
    .select(
      "id,organization_id,job_id,name,website,district,location,rationale,enrichment_summary,outreach_angle"
    )
    .eq("id", candidateId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: "Unable to load prospect candidate." };
  }

  if (!candidate) {
    return { ok: false, error: "Prospect candidate not found." };
  }

  const { data: job } = await supabase
    .from("prospect_generation_jobs")
    .select("input")
    .eq("id", candidate.job_id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const context = buildContactDiscoveryContextFromCandidate({
    candidate,
    jobInput: (job?.input as ProspectGenerationInput | undefined) ?? null
  });

  return { ok: true, candidate, context };
}

async function loadSchoolContext(
  supabase: SupabaseClient,
  organizationId: string,
  schoolId: string
): Promise<
  | {
      ok: true;
      school: SchoolRow;
      context: ContactDiscoveryPublicContext;
    }
  | { ok: false; error: string }
> {
  const { data: school, error } = await supabase
    .from("schools")
    .select(
      "id,organization_id,name,website,district,location,state,hbcu,community_college,cyber_programs,ai_programs,workforce_development_office,career_services_office"
    )
    .eq("id", schoolId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: "Unable to load school." };
  }

  if (!school) {
    return { ok: false, error: "School not found." };
  }

  const context = buildContactDiscoveryContextFromSchoolPublicProfile(school);

  return { ok: true, school, context };
}

async function replacePendingRecommendations(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    targetType: ContactDiscoveryTargetType;
    targetId: string;
    rows: RecommendationInsertRow[];
  }
): Promise<{ ok: true; recommendations: ProspectContactRecommendation[] } | { ok: false; error: string }> {
  const { error: deleteError } = await supabase
    .from("prospect_contact_recommendations")
    .delete()
    .eq("organization_id", params.organizationId)
    .eq("target_type", params.targetType)
    .eq("target_id", params.targetId)
    .eq("review_status", "pending_review");

  if (deleteError) {
    return { ok: false, error: "Unable to replace prior contact recommendations." };
  }

  if (params.rows.length === 0) {
    return { ok: true, recommendations: [] };
  }

  const { data, error: insertError } = await supabase
    .from("prospect_contact_recommendations")
    .insert(params.rows)
    .select("*");

  if (insertError) {
    return { ok: false, error: "Unable to save contact recommendations." };
  }

  return {
    ok: true,
    recommendations: (data ?? []).map((row) => mapRecommendationRow(row))
  };
}

export async function executeContactDiscovery(params: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  targetType: ContactDiscoveryTargetType;
  targetId: string;
  agentExecutionId?: string | null;
}): Promise<
  AgentExecutorResult & {
    recommendations?: ProspectContactRecommendation[];
  }
> {
  await recordAuditEvent(params.supabase, {
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: AUDIT_ACTIONS.contactDiscoveryRun,
    targetTable: "prospect_contact_recommendations",
    recordId: params.targetId,
    metadata: {
      target_type: params.targetType,
      agent_execution_id: params.agentExecutionId ?? null
    }
  });

  const loaded =
    params.targetType === "prospect_candidate"
      ? await loadCandidateContext(
          params.supabase,
          params.organizationId,
          params.targetId
        )
      : await loadSchoolContext(
          params.supabase,
          params.organizationId,
          params.targetId
        );

  if (!loaded.ok) {
    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.contactDiscoveryFail,
      targetTable: "prospect_contact_recommendations",
      recordId: params.targetId,
      metadata: {
        target_type: params.targetType,
        error: loaded.error
      }
    });

    return { ok: false, error_message: loaded.error };
  }

  try {
    const output = recommendContactRoles(loaded.context);
    const prospectCandidateId =
      params.targetType === "prospect_candidate" ? params.targetId : null;
    const schoolId = params.targetType === "school" ? params.targetId : null;

    const rows: RecommendationInsertRow[] = output.recommendations.map(
      (recommendation) => ({
        organization_id: params.organizationId,
        target_type: params.targetType,
        target_id: params.targetId,
        prospect_candidate_id: prospectCandidateId,
        school_id: schoolId,
        agent_execution_id: params.agentExecutionId ?? null,
        recommended_title: recommendation.recommended_title,
        department: recommendation.department,
        priority: recommendation.priority,
        rationale: recommendation.rationale,
        suggested_outreach_angle: recommendation.suggested_outreach_angle,
        confidence_score: recommendation.confidence_score,
        review_status: "pending_review"
      })
    );

    const saved = await replacePendingRecommendations(params.supabase, {
      organizationId: params.organizationId,
      targetType: params.targetType,
      targetId: params.targetId,
      rows
    });

    if (!saved.ok) {
      await recordAuditEvent(params.supabase, {
        organizationId: params.organizationId,
        actorUserId: params.actorUserId,
        action: AUDIT_ACTIONS.contactDiscoveryFail,
        targetTable: "prospect_contact_recommendations",
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
      action: AUDIT_ACTIONS.contactDiscoveryComplete,
      targetTable: "prospect_contact_recommendations",
      recordId: params.targetId,
      metadata: {
        target_type: params.targetType,
        recommendation_count: saved.recommendations.length
      }
    });

    return {
      ok: true,
      recommendations: saved.recommendations,
      metadata: {
        recommendation_count: saved.recommendations.length,
        target_type: params.targetType
      }
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Contact discovery failed unexpectedly.";

    await recordAuditEvent(params.supabase, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: AUDIT_ACTIONS.contactDiscoveryFail,
      targetTable: "prospect_contact_recommendations",
      recordId: params.targetId,
      metadata: {
        target_type: params.targetType,
        error: message
      }
    });

    return { ok: false, error_message: message };
  }
}
