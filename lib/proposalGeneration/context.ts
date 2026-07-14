import type { MeetingPrepBrief } from "@/lib/meetingPrep/types";

import {
  proposalGenerationPublicContextSchema,
  type ProposalGenerationPublicContext
} from "./types";

function parseCityState(
  location: string | null,
  district: string | null,
  state: string | null
): { city: string | null; state: string | null } {
  if (state?.trim()) {
    const value = location?.trim() || district?.trim();
    const city =
      value && value.includes(",")
        ? value
            .split(",")
            .map((part) => part.trim())
            .slice(0, -1)
            .join(", ") || null
        : null;

    return { city, state: state.trim() };
  }

  const value = location?.trim() || district?.trim();

  if (!value) {
    return { city: null, state: null };
  }

  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);

  if (parts.length < 2) {
    return { city: null, state: parts[0] ?? null };
  }

  const statePart = parts[parts.length - 1];

  return {
    city: parts.slice(0, -1).join(", ") || null,
    state: statePart.length === 2 ? statePart.toUpperCase() : statePart
  };
}

function meetingPrepSummaryFromBrief(
  brief: MeetingPrepBrief | null
): ProposalGenerationPublicContext["meeting_prep_summary"] {
  if (!brief) {
    return null;
  }

  return {
    meeting_objective: brief.meeting_objective,
    recommended_offering: brief.recommended_securecell_offering,
    next_step_recommendation: brief.next_step_recommendation,
    key_context: brief.key_context,
    likely_priorities: brief.likely_priorities
  };
}

export function buildProposalContextFromCandidate(params: {
  name: string;
  website: string | null;
  location: string | null;
  district: string | null;
  status: string;
  confidence_score: number | null;
  rationale: string | null;
  enrichment_summary: string | null;
  outreach_angle: string | null;
  recommended_next_step: string | null;
  meeting_prep_brief: MeetingPrepBrief | null;
}): ProposalGenerationPublicContext {
  const { city, state } = parseCityState(params.location, params.district, null);

  return proposalGenerationPublicContextSchema.parse({
    organization_name: params.name,
    website: params.website,
    city,
    state,
    status: params.status,
    fit_score: params.confidence_score,
    enrichment_summary: params.enrichment_summary,
    outreach_angle: params.outreach_angle,
    recommended_next_step: params.recommended_next_step,
    public_institutional_context: [params.rationale, params.enrichment_summary]
      .filter(Boolean)
      .join(" ")
      .trim() || null,
    meeting_prep_summary: meetingPrepSummaryFromBrief(params.meeting_prep_brief)
  });
}

export function buildProposalContextFromSchool(params: {
  name: string;
  website: string | null;
  location: string | null;
  district: string | null;
  state: string | null;
  status: string;
  cyber_programs: string | null;
  workforce_development_office: string | null;
  career_services_office: string | null;
  meeting_prep_brief: MeetingPrepBrief | null;
}): ProposalGenerationPublicContext {
  const { city, state } = parseCityState(params.location, params.district, params.state);

  return proposalGenerationPublicContextSchema.parse({
    organization_name: params.name,
    website: params.website,
    city,
    state,
    status: params.status,
    fit_score: null,
    enrichment_summary: null,
    outreach_angle: null,
    recommended_next_step: null,
    public_institutional_context:
      [params.cyber_programs, params.workforce_development_office, params.career_services_office]
        .filter(Boolean)
        .join("; ")
        .trim() || null,
    meeting_prep_summary: meetingPrepSummaryFromBrief(params.meeting_prep_brief)
  });
}
