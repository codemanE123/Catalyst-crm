import {
  formatProspectSchoolTypes,
  PROSPECT_SCHOOL_TYPE_LABELS,
  type ProspectCandidate,
  type ProspectGenerationInput,
  type ProspectSchoolType
} from "@/lib/prospectGeneration";
import type { ProspectOutreachDraftInput } from "@/lib/llm/outreachDraftTypes";

function parseCityState(
  location: string | null,
  district: string | null
): { city: string | null; state: string | null } {
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

function schoolTypeLabels(schoolTypes: ProspectSchoolType[]): string[] {
  return schoolTypes.map((schoolType) => PROSPECT_SCHOOL_TYPE_LABELS[schoolType]);
}

export function buildProspectOutreachDraftInput(params: {
  candidate: Pick<
    ProspectCandidate,
    | "name"
    | "website"
    | "location"
    | "district"
    | "confidence_score"
    | "source_name"
    | "source_url"
    | "enrichment_summary"
    | "outreach_angle"
    | "recommended_next_step"
  >;
  jobInput: ProspectGenerationInput;
}): ProspectOutreachDraftInput {
  const { city, state } = parseCityState(
    params.candidate.location,
    params.candidate.district
  );
  const fitScore = params.candidate.confidence_score;

  return {
    organization_name: params.candidate.name,
    website: params.candidate.website,
    city,
    state,
    school_types: schoolTypeLabels(params.jobInput.schoolTypes),
    fit_score: fitScore,
    confidence_score: fitScore,
    source_name: params.candidate.source_name,
    source_url: params.candidate.source_url,
    enrichment_summary: params.candidate.enrichment_summary,
    outreach_angle: params.candidate.outreach_angle,
    recommended_next_step: params.candidate.recommended_next_step
  };
}

export function summarizeProspectOutreachDraftSchoolTypes(
  jobInput: ProspectGenerationInput
): string {
  return formatProspectSchoolTypes(jobInput.schoolTypes);
}
