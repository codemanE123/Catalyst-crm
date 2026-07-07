const REGION_STATE_CODES: Record<string, string[]> = {
  southeast: ["AL", "FL", "GA", "KY", "LA", "MS", "NC", "SC", "TN", "VA", "DC"],
  midwest: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  southwest: ["AZ", "NM", "OK", "TX"],
  northeast: ["CT", "DE", "MA", "MD", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"],
  west: ["AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"],
  texas: ["TX"],
  california: ["CA"],
  florida: ["FL"],
  "dc metro": ["DC", "MD", "VA"]
};

const STATE_NAMES: Record<string, string> = {
  AL: "alabama",
  AZ: "arizona",
  CA: "california",
  CO: "colorado",
  CT: "connecticut",
  DC: "district of columbia",
  DE: "delaware",
  FL: "florida",
  GA: "georgia",
  IL: "illinois",
  IN: "indiana",
  KY: "kentucky",
  LA: "louisiana",
  MA: "massachusetts",
  MD: "maryland",
  MI: "michigan",
  MN: "minnesota",
  MS: "mississippi",
  MO: "missouri",
  NC: "north carolina",
  NJ: "new jersey",
  NY: "new york",
  OH: "ohio",
  OK: "oklahoma",
  PA: "pennsylvania",
  SC: "south carolina",
  TN: "tennessee",
  TX: "texas",
  VA: "virginia",
  WA: "washington"
};

const ALL_STATE_CODES = Array.from(
  new Set(Object.values(REGION_STATE_CODES).flat())
).sort();

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveStateCodesFromGeography(geography: string): string[] {
  const normalizedGeography = normalizeText(geography);

  if (
    normalizedGeography === "" ||
    normalizedGeography.includes("united states") ||
    normalizedGeography.includes("national") ||
    normalizedGeography === "us" ||
    normalizedGeography.includes("usa")
  ) {
    return ALL_STATE_CODES;
  }

  const directMatches = new Set<string>();

  for (const stateCode of ALL_STATE_CODES) {
    const stateName = STATE_NAMES[stateCode];

    if (normalizedGeography.includes(stateCode.toLowerCase())) {
      directMatches.add(stateCode);
    }

    if (stateName && normalizedGeography.includes(stateName)) {
      directMatches.add(stateCode);
    }
  }

  for (const [region, stateCodes] of Object.entries(REGION_STATE_CODES)) {
    if (normalizedGeography.includes(region)) {
      for (const stateCode of stateCodes) {
        directMatches.add(stateCode);
      }
    }
  }

  if (directMatches.size > 0) {
    return Array.from(directMatches).sort();
  }

  return ALL_STATE_CODES;
}
