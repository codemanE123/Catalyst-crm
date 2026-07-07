import type { ProspectCandidate } from "@/lib/prospectGeneration";
import { PROSPECT_SCHOOL_TYPE_LABELS, type ProspectGenerationInput } from "@/lib/prospectGeneration";

import {
  contactDiscoveryPublicContextSchema,
  type ContactDiscoveryPublicContext
} from "./types";

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

function keywordsFromText(...values: Array<string | null | undefined>): string[] {
  const tokens = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);

  return [...new Set(tokens)].slice(0, 10);
}

export function buildContactDiscoveryContextFromCandidate(params: {
  candidate: Pick<
    ProspectCandidate,
    "name" | "website" | "location" | "district" | "rationale" | "enrichment_summary" | "outreach_angle"
  >;
  jobInput?: ProspectGenerationInput | null;
}): ContactDiscoveryPublicContext {
  const { city, state } = parseCityState(
    params.candidate.location,
    params.candidate.district
  );
  const schoolTypeLabels = params.jobInput
    ? params.jobInput.schoolTypes.map((type) => PROSPECT_SCHOOL_TYPE_LABELS[type])
    : [];

  const programKeywords = keywordsFromText(
    params.candidate.rationale,
    params.candidate.enrichment_summary,
    params.jobInput?.keywords
  );

  return contactDiscoveryPublicContextSchema.parse({
    organization_name: params.candidate.name,
    website: params.candidate.website,
    city,
    state,
    school_type_labels: schoolTypeLabels,
    program_keywords: programKeywords
  });
}

export function buildContactDiscoveryContextFromSchoolPublicProfile(params: {
  name: string;
  website: string | null;
  location: string | null;
  district: string | null;
  state?: string | null;
  hbcu?: boolean | null;
  community_college?: boolean | null;
  cyber_programs?: string | null;
  ai_programs?: string | null;
  workforce_development_office?: string | null;
  career_services_office?: string | null;
}): ContactDiscoveryPublicContext {
  const { city, state } = parseCityState(params.location, params.district);
  const schoolTypeLabels: string[] = ["University / college partnership"];

  if (params.hbcu) {
    schoolTypeLabels.push("Historically Black College or University");
  }

  if (params.community_college) {
    schoolTypeLabels.push("Community college");
  }

  return contactDiscoveryPublicContextSchema.parse({
    organization_name: params.name,
    website: params.website,
    city,
    state: params.state?.trim() || state,
    school_type_labels: schoolTypeLabels,
    program_keywords: keywordsFromText(
      params.cyber_programs,
      params.ai_programs,
      params.workforce_development_office,
      params.career_services_office,
      params.district,
      params.location
    )
  });
}
