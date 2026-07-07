import { extractWebsiteDomain } from "@/lib/llm";
import type { ProspectEnrichmentInput } from "@/lib/llm/types";
import {
  PROSPECT_SCHOOL_TYPE_LABELS,
  type ProspectCandidate,
  type ProspectGenerationInput
} from "@/lib/prospectGeneration";

const DEFAULT_PUBLIC_SOURCE_URL = "https://collegescorecard.ed.gov/data/api/";

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

export function buildProspectEnrichmentInput(params: {
  candidate: Pick<
    ProspectCandidate,
    | "name"
    | "website"
    | "location"
    | "district"
    | "rationale"
    | "source_name"
    | "source_url"
  >;
  jobInput: ProspectGenerationInput;
}): ProspectEnrichmentInput {
  const { city, state } = parseCityState(
    params.candidate.location,
    params.candidate.district
  );
  const programHighlights: string[] = [];

  if (params.candidate.rationale?.trim()) {
    programHighlights.push(params.candidate.rationale.trim().slice(0, 200));
  }

  if (params.jobInput.keywords?.trim()) {
    programHighlights.push(params.jobInput.keywords.trim().slice(0, 200));
  }

  const sourceUrl = params.candidate.source_url?.trim() || DEFAULT_PUBLIC_SOURCE_URL;
  const sourceName =
    params.candidate.source_name?.trim() || "Public institution data";

  return {
    institution: {
      name: params.candidate.name,
      city,
      state,
      website_domain: extractWebsiteDomain(params.candidate.website),
      categories: params.jobInput.schoolTypes.map(
        (schoolType) => PROSPECT_SCHOOL_TYPE_LABELS[schoolType]
      ),
      enrollment_band: null,
      program_highlights: programHighlights
    },
    icp: {
      geography: params.jobInput.geography,
      school_types: params.jobInput.schoolTypes,
      keywords: params.jobInput.keywords ?? ""
    },
    sources: [
      {
        name: sourceName,
        url: sourceUrl
      }
    ]
  };
}
