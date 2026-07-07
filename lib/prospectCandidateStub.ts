import type { ProspectGenerationInput, ProspectSchoolType } from "./prospectGeneration";

export type StubSchoolSeed = {
  name: string;
  website: string;
  city: string;
  state: string;
  schoolTypes: ProspectSchoolType[];
  regions: string[];
  rationale: string;
  confidenceScore: number;
};

export type MockProspectCandidateDraft = {
  name: string;
  website: string;
  district: string;
  location: string;
  rationale: string;
  confidence_score: number;
};

const REGION_STATE_CODES: Record<string, string[]> = {
  southeast: ["AL", "FL", "GA", "KY", "LA", "MS", "NC", "SC", "TN", "VA", "DC"],
  midwest: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  southwest: ["AZ", "NM", "OK", "TX"],
  northeast: ["CT", "DE", "MA", "MD", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"],
  west: ["AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"],
  texas: ["TX"],
  california: ["CA"],
  florida: ["FL"],
  "dc metro": ["DC", "MD", "VA"],
  national: []
};

const STATE_NAMES: Record<string, string> = {
  AL: "alabama",
  AZ: "arizona",
  CA: "california",
  DC: "district of columbia",
  DE: "delaware",
  FL: "florida",
  GA: "georgia",
  LA: "louisiana",
  MD: "maryland",
  MS: "mississippi",
  NC: "north carolina",
  OH: "ohio",
  PA: "pennsylvania",
  SC: "south carolina",
  TN: "tennessee",
  TX: "texas",
  VA: "virginia"
};

export const CURATED_STUB_SCHOOL_SEEDS: StubSchoolSeed[] = [
  {
    name: "Howard University",
    website: "https://www.howard.edu",
    city: "Washington",
    state: "DC",
    schoolTypes: ["hbcu", "cae", "workforce_cyber"],
    regions: ["southeast", "dc metro", "national"],
    rationale:
      "HBCU with NSA CAE-designated cybersecurity and information assurance programs.",
    confidenceScore: 0.91
  },
  {
    name: "Hampton University",
    website: "https://www.hamptonu.edu",
    city: "Hampton",
    state: "VA",
    schoolTypes: ["hbcu", "cae", "workforce_cyber"],
    regions: ["southeast", "dc metro", "virginia"],
    rationale:
      "HBCU with NSA CAE designation and Hampton Roads defense ecosystem ties.",
    confidenceScore: 0.9
  },
  {
    name: "North Carolina A&T State University",
    website: "https://www.ncat.edu",
    city: "Greensboro",
    state: "NC",
    schoolTypes: ["hbcu", "cae", "state_university", "workforce_cyber"],
    regions: ["southeast", "north carolina"],
    rationale:
      "Largest public HBCU with NSA CAE designation and engineering workforce pathways.",
    confidenceScore: 0.89
  },
  {
    name: "Florida A&M University",
    website: "https://www.famu.edu",
    city: "Tallahassee",
    state: "FL",
    schoolTypes: ["hbcu", "cae", "state_university"],
    regions: ["southeast", "florida"],
    rationale: "Public HBCU flagship with cyber and workforce development programs.",
    confidenceScore: 0.88
  },
  {
    name: "Morgan State University",
    website: "https://www.morgan.edu",
    city: "Baltimore",
    state: "MD",
    schoolTypes: ["hbcu", "cae", "workforce_cyber"],
    regions: ["southeast", "mid-atlantic", "dc metro", "maryland"],
    rationale: "HBCU in the Baltimore cyber workforce corridor with CAE designation.",
    confidenceScore: 0.87
  },
  {
    name: "Tennessee State University",
    website: "https://www.tnstate.edu",
    city: "Nashville",
    state: "TN",
    schoolTypes: ["hbcu", "cae", "workforce_cyber"],
    regions: ["southeast", "tennessee"],
    rationale: "HBCU with NSA CAE designation and Nashville regional workforce programs.",
    confidenceScore: 0.86
  },
  {
    name: "Norfolk State University",
    website: "https://www.nsu.edu",
    city: "Norfolk",
    state: "VA",
    schoolTypes: ["hbcu", "cae"],
    regions: ["southeast", "virginia"],
    rationale: "HBCU serving the Hampton Roads military and cyber ecosystem.",
    confidenceScore: 0.85
  },
  {
    name: "Texas Southern University",
    website: "https://www.tsu.edu",
    city: "Houston",
    state: "TX",
    schoolTypes: ["hbcu", "workforce_cyber"],
    regions: ["southeast", "southwest", "texas"],
    rationale: "HBCU with Houston metro workforce and technology programs.",
    confidenceScore: 0.82
  },
  {
    name: "Georgia Institute of Technology",
    website: "https://www.gatech.edu",
    city: "Atlanta",
    state: "GA",
    schoolTypes: ["cae", "state_university", "workforce_cyber"],
    regions: ["southeast", "georgia", "national"],
    rationale:
      "State research university with NSA CAE research designation and cyber workforce pipeline.",
    confidenceScore: 0.93
  },
  {
    name: "University of Maryland Baltimore County",
    website: "https://www.umbc.edu",
    city: "Baltimore",
    state: "MD",
    schoolTypes: ["cae", "state_university", "workforce_cyber"],
    regions: ["southeast", "mid-atlantic", "dc metro", "maryland"],
    rationale: "State university with cyber defense research center and CAE designation.",
    confidenceScore: 0.92
  },
  {
    name: "Virginia Tech",
    website: "https://www.vt.edu",
    city: "Blacksburg",
    state: "VA",
    schoolTypes: ["cae", "state_university"],
    regions: ["southeast", "virginia"],
    rationale: "State university with NSA CAE designation and national security programs.",
    confidenceScore: 0.91
  },
  {
    name: "University of Texas at San Antonio",
    website: "https://www.utsa.edu",
    city: "San Antonio",
    state: "TX",
    schoolTypes: ["cae", "state_university", "workforce_cyber"],
    regions: ["southwest", "texas"],
    rationale: "State university with a large NSA CAE-designated cybersecurity program.",
    confidenceScore: 0.9
  },
  {
    name: "Arizona State University",
    website: "https://www.asu.edu",
    city: "Tempe",
    state: "AZ",
    schoolTypes: ["cae", "state_university", "workforce_cyber"],
    regions: ["southwest", "arizona", "west"],
    rationale: "State university with workforce innovation and NSA CAE designation.",
    confidenceScore: 0.89
  },
  {
    name: "Ohio State University",
    website: "https://www.osu.edu",
    city: "Columbus",
    state: "OH",
    schoolTypes: ["cae", "state_university"],
    regions: ["midwest", "ohio"],
    rationale: "State flagship with cybersecurity research and workforce partnerships.",
    confidenceScore: 0.88
  },
  {
    name: "Penn State University",
    website: "https://www.psu.edu",
    city: "University Park",
    state: "PA",
    schoolTypes: ["cae", "state_university", "workforce_cyber"],
    regions: ["northeast", "pennsylvania"],
    rationale: "State university system with NSA CAE programs and workforce outreach.",
    confidenceScore: 0.87
  },
  {
    name: "University of Florida",
    website: "https://www.ufl.edu",
    city: "Gainesville",
    state: "FL",
    schoolTypes: ["cae", "state_university"],
    regions: ["southeast", "florida"],
    rationale: "State flagship with information assurance and cybersecurity coursework.",
    confidenceScore: 0.86
  },
  {
    name: "Northern Virginia Community College",
    website: "https://www.nvcc.edu",
    city: "Annandale",
    state: "VA",
    schoolTypes: ["community_college", "cae", "workforce_cyber"],
    regions: ["southeast", "dc metro", "virginia"],
    rationale: "Community college with NSA CAE 2-year designation near federal cyber employers.",
    confidenceScore: 0.84
  },
  {
    name: "Montgomery College",
    website: "https://www.montgomerycollege.edu",
    city: "Rockville",
    state: "MD",
    schoolTypes: ["community_college", "cae", "workforce_cyber"],
    regions: ["southeast", "dc metro", "maryland"],
    rationale: "Community college in the Maryland cyber corridor with workforce certificates.",
    confidenceScore: 0.83
  },
  {
    name: "Austin Community College",
    website: "https://www.austincc.edu",
    city: "Austin",
    state: "TX",
    schoolTypes: ["community_college", "cae", "workforce_cyber"],
    regions: ["southwest", "texas"],
    rationale: "Community college feeding Austin's technology workforce with cyber programs.",
    confidenceScore: 0.82
  },
  {
    name: "Valencia College",
    website: "https://www.valenciacollege.edu",
    city: "Orlando",
    state: "FL",
    schoolTypes: ["community_college", "workforce_cyber"],
    regions: ["southeast", "florida"],
    rationale: "Community college with Orlando metro workforce and technology certificates.",
    confidenceScore: 0.8
  },
  {
    name: "Wake Technical Community College",
    website: "https://www.waketech.edu",
    city: "Raleigh",
    state: "NC",
    schoolTypes: ["community_college", "cae", "workforce_cyber"],
    regions: ["southeast", "north carolina"],
    rationale: "Community college in the Research Triangle with NSA CAE 2-year designation.",
    confidenceScore: 0.81
  },
  {
    name: "Houston Community College",
    website: "https://www.hccs.edu",
    city: "Houston",
    state: "TX",
    schoolTypes: ["community_college", "workforce_cyber"],
    regions: ["southwest", "texas"],
    rationale: "Large Texas community college system with workforce and continuing education.",
    confidenceScore: 0.79
  },
  {
    name: "Delaware Technical Community College",
    website: "https://www.dtcc.edu",
    city: "Dover",
    state: "DE",
    schoolTypes: ["community_college", "cae", "workforce_cyber"],
    regions: ["northeast", "mid-atlantic", "delaware"],
    rationale: "Statewide community college with NSA CAE 2-year workforce programs.",
    confidenceScore: 0.78
  },
  {
    name: "Dakota State University",
    website: "https://www.dsu.edu",
    city: "Madison",
    state: "SD",
    schoolTypes: ["cae", "state_university", "workforce_cyber"],
    regions: ["midwest", "national"],
    rationale: "Cyber-focused public university with NSA CAE designation.",
    confidenceScore: 0.85
  },
  {
    name: "Sam Houston State University",
    website: "https://www.shsu.edu",
    city: "Huntsville",
    state: "TX",
    schoolTypes: ["cae", "state_university", "workforce_cyber"],
    regions: ["southwest", "texas"],
    rationale: "State university with Texas cyber security institute and workforce training.",
    confidenceScore: 0.84
  }
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function parseKeywordTerms(keywords: string): string[] {
  return keywords
    .split(/[,;]+/)
    .map((term) => normalizeText(term))
    .filter(Boolean);
}

export function matchesSchoolTypes(
  seed: StubSchoolSeed,
  requestedTypes: ProspectSchoolType[]
): boolean {
  return requestedTypes.some((type) => seed.schoolTypes.includes(type));
}

export function matchesKeywords(seed: StubSchoolSeed, keywords: string): boolean {
  const terms = parseKeywordTerms(keywords);

  if (terms.length === 0) {
    return true;
  }

  const haystack = normalizeText(`${seed.name} ${seed.rationale}`);

  return terms.every((term) => haystack.includes(term));
}

export function matchesGeography(seed: StubSchoolSeed, geography: string): boolean {
  const normalizedGeography = normalizeText(geography);

  if (
    normalizedGeography === "" ||
    normalizedGeography.includes("us") ||
    normalizedGeography.includes("united states") ||
    normalizedGeography.includes("national")
  ) {
    return true;
  }

  const city = normalizeText(seed.city);
  const stateCode = seed.state.toUpperCase();
  const stateName = STATE_NAMES[stateCode] ?? "";

  if (
    normalizedGeography.includes(city) ||
    normalizedGeography.includes(stateCode.toLowerCase()) ||
    (stateName && normalizedGeography.includes(stateName))
  ) {
    return true;
  }

  for (const [region, stateCodes] of Object.entries(REGION_STATE_CODES)) {
    if (!normalizedGeography.includes(region)) {
      continue;
    }

    if (stateCodes.length === 0 || stateCodes.includes(stateCode)) {
      return true;
    }

    if (seed.regions.includes(region)) {
      return true;
    }
  }

  return seed.regions.some((region) => normalizedGeography.includes(region));
}

export function generateMockProspectCandidates(
  input: ProspectGenerationInput,
  jobId: string,
  seeds: StubSchoolSeed[] = CURATED_STUB_SCHOOL_SEEDS
): MockProspectCandidateDraft[] {
  const matched = seeds
    .filter(
      (seed) =>
        matchesSchoolTypes(seed, input.schoolTypes) &&
        matchesGeography(seed, input.geography) &&
        matchesKeywords(seed, input.keywords)
    )
    .sort((left, right) => {
      const leftScore = hashString(`${jobId}:${left.name}`);
      const rightScore = hashString(`${jobId}:${right.name}`);
      return leftScore - rightScore || left.name.localeCompare(right.name);
    })
    .slice(0, input.maxResults)
    .map((seed) => ({
      name: seed.name,
      website: seed.website,
      district: `${seed.city}, ${seed.state}`,
      location: `${seed.city}, ${seed.state}`,
      rationale: seed.rationale,
      confidence_score: seed.confidenceScore
    }));

  return matched;
}
