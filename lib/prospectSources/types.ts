import type { ProspectGenerationInput } from "@/lib/prospectGeneration";

export const PROSPECT_SOURCE_NAMES = [
  "college_scorecard",
  "public_web",
  "college_scorecard_and_public_web",
  "stub_generator",
  "unconfigured"
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
  /** Public institution enrollment from Scorecard when available. */
  enrollment_size?: number | null;
  discovery_method?: string | null;
  retrieved_at?: string | null;
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
  discovery_method: string | null;
  retrieved_at: string | null;
};

export type ProspectGenerationSummary = {
  candidate_count: number;
  source: ProspectSourceName;
  source_name?: string;
  fallback_reason?: string;
  warnings?: string[];
  configuration_status?:
    | "ready"
    | "disabled"
    | "missing_api_key"
    | "error"
    | "no_matches"
    | "stub_dev_only"
    | "provider_not_configured"
    | "policy_denied";
  provider_error_code?: string | null;
  provider_request_count?: number;
  scorecard_candidate_count?: number;
  public_web_candidate_count?: number;
  duplicate_count?: number;
  skipped_count?: number;
  discovery_methods?: string[];
};

export type ProspectGenerationRunResult = {
  drafts: ProspectCandidateDraft[];
  summary: ProspectGenerationSummary;
};

export type CollegeScorecardSchoolRecord = Record<string, string | number | null>;

export type CollegeScorecardFetchResult = {
  records: CollegeScorecardSchoolRecord[];
  request_url: string;
  page?: number;
  total?: number | null;
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
    source_url: candidate.source_urls[0] ?? null,
    discovery_method: candidate.discovery_method ?? null,
    retrieved_at: candidate.retrieved_at ?? null
  };
}
