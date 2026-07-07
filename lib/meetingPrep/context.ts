import {
  meetingPrepPublicContextSchema,
  type MeetingPrepPublicContext
} from "./types";

function parseCityState(
  location: string | null,
  district: string | null,
  state: string | null
): { city: string | null; state: string | null } {
  if (state?.trim()) {
    const { city } = parseCityState(location, district, null);
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

export function buildMeetingPrepContextFromCandidate(params: {
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
  contact_role_titles: string[];
  outreach_summaries: MeetingPrepPublicContext["outreach_summaries"];
  follow_up_summaries: MeetingPrepPublicContext["follow_up_summaries"];
  interview_summaries: MeetingPrepPublicContext["interview_summaries"];
}): MeetingPrepPublicContext {
  const { city, state } = parseCityState(params.location, params.district, null);

  return meetingPrepPublicContextSchema.parse({
    organization_name: params.name,
    website: params.website,
    city,
    state,
    status: params.status,
    fit_score: params.confidence_score,
    confidence_score: params.confidence_score,
    enrichment_summary: params.enrichment_summary,
    outreach_angle: params.outreach_angle,
    recommended_next_step: params.recommended_next_step,
    contact_role_titles: params.contact_role_titles,
    outreach_summaries: params.outreach_summaries,
    follow_up_summaries: params.follow_up_summaries,
    interview_summaries: params.interview_summaries,
    cyber_programs: params.rationale,
    workforce_signals: params.enrichment_summary
  });
}

export function buildMeetingPrepContextFromSchool(params: {
  name: string;
  website: string | null;
  location: string | null;
  district: string | null;
  state: string | null;
  status: string;
  cyber_programs: string | null;
  workforce_development_office: string | null;
  career_services_office: string | null;
  contact_role_titles: string[];
  outreach_summaries: MeetingPrepPublicContext["outreach_summaries"];
  follow_up_summaries: MeetingPrepPublicContext["follow_up_summaries"];
  interview_summaries: MeetingPrepPublicContext["interview_summaries"];
}): MeetingPrepPublicContext {
  const { city, state } = parseCityState(params.location, params.district, params.state);

  return meetingPrepPublicContextSchema.parse({
    organization_name: params.name,
    website: params.website,
    city,
    state,
    status: params.status,
    fit_score: null,
    confidence_score: null,
    enrichment_summary: null,
    outreach_angle: null,
    recommended_next_step: null,
    contact_role_titles: params.contact_role_titles,
    outreach_summaries: params.outreach_summaries,
    follow_up_summaries: params.follow_up_summaries,
    interview_summaries: params.interview_summaries,
    cyber_programs: params.cyber_programs,
    workforce_signals: [params.workforce_development_office, params.career_services_office]
      .filter(Boolean)
      .join("; ") || null
  });
}
