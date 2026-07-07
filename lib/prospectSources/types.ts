import type { ProspectGenerationInput } from "@/lib/prospectGeneration";

export const PROSPECT_SOURCE_NAMES = [
  "college_scorecard",
  "stub_generator"
] as const;

export type ProspectSourceName = (typeof PROSPECT_SOURCE_NAMES)[number];

export type ProspectSourceCandidate = {
  organization_name: string;
  website: string | null;
  city: string | null;
  state: string | null;
  school_type: string | null;
  rationale: string;
  fit_score: number | null;
  source_name: string;
  source_urls: string[];
};

export type ProspectCandidateDraft = {
  name: string;
  website: string | null;
  district: string;
  location: string;
  rationale: string;
  confidence_score: number | null;
  source_name: string;
  source_url: string | null;
};

export type ProspectGenerationSummary = {
  candidate_count: number;
  source: ProspectSourceName;
  source_name?: string;
  fallback_reason?: string;
  warnings?: string[];
};

export type ProspectGenerationRunResult = {
  drafts: ProspectCandidateDraft[];
  summary: ProspectGenerationSummary;
};

export type CollegeScorecardSchoolRecord = Record<string, string | number | null>;

export type CollegeScorecardFetchResult = {
  records: CollegeScorecardSchoolRecord[];
  request_url: string;
};

export type ProspectSourceGenerateInput = {
  jobInput: ProspectGenerationInput;
  jobId: string;
};

export function toProspectCandidateDraft(
  candidate: ProspectSourceCandidate
): ProspectCandidateDraft {
  const location =
    candidate.city && candidate.state
      ? `${candidate.city}, ${candidate.state}`
      : candidate.state ?? "Unknown";

  return {
    name: candidate.organization_name,
    website: candidate.website,
    district: location,
    location,
    rationale: candidate.rationale,
    confidence_score: candidate.fit_score,
    source_name: candidate.source_name,
    source_url: candidate.source_urls[0] ?? null
  };
}
