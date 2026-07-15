import type { ProspectGenerationInput, ProspectSchoolType } from "@/lib/prospectGeneration";
import { PROSPECT_SCHOOL_TYPE_LABELS } from "@/lib/prospectGeneration";
import { resolveStateCodesFromGeography } from "@/lib/prospectSources/geography";

const STATE_LABELS: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DC: "District of Columbia",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming"
};

function primarySchoolTypePhrase(types: ProspectSchoolType[]): string {
  if (types.length === 0) {
    return "university";
  }
  if (types.length === 1) {
    return PROSPECT_SCHOOL_TYPE_LABELS[types[0]!] ?? "university";
  }
  if (types.includes("hbcu")) {
    return "HBCU";
  }
  if (types.includes("community_college")) {
    return "community college";
  }
  if (types.includes("cae") || types.includes("workforce_cyber")) {
    return "cybersecurity university";
  }
  return "university";
}

function keywordPhrase(keywords: string): string {
  const terms = keywords
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .slice(0, 3);
  return terms.join(" ");
}

/**
 * Deterministic, bounded search queries (max 2) from job criteria.
 * Always includes site:.edu when education suffixes are the default target.
 */
export function buildPublicWebSearchQueries(
  input: ProspectGenerationInput,
  options?: { maxQueries?: number }
): string[] {
  const maxQueries = Math.min(2, Math.max(1, options?.maxQueries ?? 2));
  const states = resolveStateCodesFromGeography(input.geography);
  const stateLabel =
    states.length === 1
      ? STATE_LABELS[states[0]!] ?? states[0]!
      : input.geography.trim() || "United States";
  const typePhrase = primarySchoolTypePhrase(input.schoolTypes);
  const keywords = keywordPhrase(input.keywords);

  const queries: string[] = [];

  const primary = [typePhrase, stateLabel, keywords, "site:.edu"]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  queries.push(primary);

  if (maxQueries > 1) {
    const secondaryFocus =
      input.schoolTypes.includes("cae") ||
      input.schoolTypes.includes("workforce_cyber")
        ? "cybersecurity center academic excellence"
        : input.schoolTypes.includes("hbcu")
          ? "historically black college university"
          : "academic programs partnerships";
    const secondary = [secondaryFocus, stateLabel, "site:.edu"]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (secondary !== primary) {
      queries.push(secondary);
    }
  }

  return queries.slice(0, maxQueries);
}
