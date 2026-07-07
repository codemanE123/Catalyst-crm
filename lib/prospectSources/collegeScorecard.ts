import type { ProspectGenerationInput, ProspectSchoolType } from "@/lib/prospectGeneration";
import { SafeFetchError, safeFetchText } from "@/lib/safeFetch";

import { resolveStateCodesFromGeography } from "./geography";
import type {
  CollegeScorecardFetchResult,
  CollegeScorecardSchoolRecord,
  ProspectSourceCandidate
} from "./types";

export const COLLEGE_SCORECARD_SOURCE_NAME =
  "U.S. Department of Education College Scorecard";

export const COLLEGE_SCORECARD_DOCUMENTATION_URL =
  "https://collegescorecard.ed.gov/data/api/";

export const COLLEGE_SCORECARD_API_BASE_URL =
  "https://api.data.gov/ed/collegescorecard/v1/schools";

const SCORECARD_FIELDS = [
  "id",
  "school.name",
  "school.city",
  "school.state",
  "school.school_url",
  "school.ownership",
  "school.degrees_awarded.predominant",
  "school.minority_serving.historically_black",
  "latest.student.size",
  "latest.programs.cip_4_digit",
  "latest.programs.title"
] as const;

const CYBER_CIP_PREFIXES = ["11.01", "11.02", "11.03", "11.04", "11.07", "11.09", "11.10"];

type FetchTextFn = (
  url: string,
  options?: { timeoutMs?: number }
) => Promise<string>;

export function getCollegeScorecardApiKey(): string | null {
  const dedicatedKey = process.env.COLLEGE_SCORECARD_API_KEY?.trim();
  const dataGovKey = process.env.DATA_GOV_API_KEY?.trim();

  return dedicatedKey || dataGovKey || null;
}

export function isCollegeScorecardConfigured(): boolean {
  return getCollegeScorecardApiKey() !== null;
}

function asString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function asNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWebsite(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function parseKeywordTerms(keywords: string): string[] {
  return keywords
    .split(/[,;]+/)
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

function getField(
  record: CollegeScorecardSchoolRecord,
  field: string
): string | number | null {
  return record[field] ?? null;
}

function getProgramValues(
  record: CollegeScorecardSchoolRecord,
  field: "latest.programs.cip_4_digit" | "latest.programs.title"
): string[] {
  const value = record[field];

  if (value === null || value === undefined) {
    return [];
  }

  return String(value)
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function hasCyberProgram(record: CollegeScorecardSchoolRecord): boolean {
  const cipCodes = getProgramValues(record, "latest.programs.cip_4_digit");

  return cipCodes.some((code) =>
    CYBER_CIP_PREFIXES.some((prefix) => code.startsWith(prefix))
  );
}

function hasKeywordMatch(
  record: CollegeScorecardSchoolRecord,
  keywords: string
): boolean {
  const terms = parseKeywordTerms(keywords);

  if (terms.length === 0) {
    return true;
  }

  const haystack = [
    asString(getField(record, "school.name")),
    ...getProgramValues(record, "latest.programs.title")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return terms.every((term) => haystack.includes(term));
}

function ownershipLabel(ownership: number | null): string | null {
  if (ownership === 1) {
    return "Public";
  }

  if (ownership === 2) {
    return "Private nonprofit";
  }

  if (ownership === 3) {
    return "Private for-profit";
  }

  return null;
}

function predominantDegreeLabel(predominant: number | null): string | null {
  if (predominant === 1) {
    return "Certificate-granting";
  }

  if (predominant === 2) {
    return "Associate-granting";
  }

  if (predominant === 3) {
    return "Bachelor's-granting";
  }

  if (predominant === 4) {
    return "Graduate-granting";
  }

  return null;
}

function deriveSchoolCategory(record: CollegeScorecardSchoolRecord): string | null {
  const ownership = asNumber(getField(record, "school.ownership"));
  const predominant = asNumber(getField(record, "school.degrees_awarded.predominant"));
  const isHbcu = asNumber(getField(record, "school.minority_serving.historically_black")) === 1;
  const categories: string[] = [];

  if (isHbcu) {
    categories.push("HBCU");
  }

  if (predominant === 2) {
    categories.push("Community college");
  } else if (ownership === 1 && (predominant === 3 || predominant === 4)) {
    categories.push("State university");
  } else if (ownership === 1) {
    categories.push("Public institution");
  } else if (ownership === 2 || ownership === 3) {
    categories.push("Private institution");
  }

  const ownershipText = ownershipLabel(ownership);
  const degreeText = predominantDegreeLabel(predominant);

  if (ownershipText && !categories.includes(ownershipText)) {
    categories.push(ownershipText);
  }

  if (degreeText) {
    categories.push(degreeText);
  }

  if (hasCyberProgram(record)) {
    categories.push("Cybersecurity-related programs");
  }

  return categories.length > 0 ? categories.join("; ") : null;
}

function matchesRequestedSchoolType(
  record: CollegeScorecardSchoolRecord,
  schoolType: ProspectSchoolType
): boolean {
  const ownership = asNumber(getField(record, "school.ownership"));
  const predominant = asNumber(getField(record, "school.degrees_awarded.predominant"));
  const isHbcu = asNumber(getField(record, "school.minority_serving.historically_black")) === 1;

  switch (schoolType) {
    case "hbcu":
      return isHbcu;
    case "community_college":
      return predominant === 2;
    case "state_university":
      return ownership === 1 && (predominant === 3 || predominant === 4);
    case "cae":
      return hasCyberProgram(record);
    case "workforce_cyber":
      return hasCyberProgram(record) || predominant === 1 || predominant === 2;
    default:
      return false;
  }
}

function matchesSchoolTypes(
  record: CollegeScorecardSchoolRecord,
  schoolTypes: ProspectSchoolType[]
): boolean {
  return schoolTypes.some((schoolType) =>
    matchesRequestedSchoolType(record, schoolType)
  );
}

function deriveFitScore(
  record: CollegeScorecardSchoolRecord,
  input: ProspectGenerationInput
): number {
  let score = 0.7;

  if (normalizeWebsite(asString(getField(record, "school.school_url")))) {
    score += 0.08;
  }

  if (
    input.schoolTypes.includes("hbcu") &&
    asNumber(getField(record, "school.minority_serving.historically_black")) === 1
  ) {
    score += 0.07;
  }

  if (
    (input.schoolTypes.includes("cae") ||
      input.schoolTypes.includes("workforce_cyber")) &&
    hasCyberProgram(record)
  ) {
    score += 0.08;
  }

  const enrollment = asNumber(getField(record, "latest.student.size"));

  if (enrollment && enrollment >= 5000) {
    score += 0.05;
  }

  return Math.min(Number(score.toFixed(3)), 0.95);
}

function buildRationale(
  record: CollegeScorecardSchoolRecord,
  requestUrl: string
): string {
  const unitId = asString(getField(record, "id"));
  const category = deriveSchoolCategory(record);
  const enrollment = asNumber(getField(record, "latest.student.size"));
  const details = [
    category ? `Category: ${category}.` : null,
    enrollment ? `Enrollment: ${enrollment.toLocaleString("en-US")}.` : null,
    unitId ? `IPEDS/Scorecard ID: ${unitId}.` : null,
    `Source: ${COLLEGE_SCORECARD_SOURCE_NAME}.`
  ].filter(Boolean);

  return `${details.join(" ")} Data retrieved from ${requestUrl}`;
}

export function mapCollegeScorecardRecordToCandidate(
  record: CollegeScorecardSchoolRecord,
  input: ProspectGenerationInput,
  requestUrl: string
): ProspectSourceCandidate | null {
  const organizationName = asString(getField(record, "school.name"));
  const state = asString(getField(record, "school.state"));

  if (!organizationName || !state) {
    return null;
  }

  if (!matchesSchoolTypes(record, input.schoolTypes)) {
    return null;
  }

  if (!hasKeywordMatch(record, input.keywords)) {
    return null;
  }

  const city = asString(getField(record, "school.city"));
  const website = normalizeWebsite(asString(getField(record, "school.school_url")));

  return {
    organization_name: organizationName,
    website,
    city,
    state,
    school_type: deriveSchoolCategory(record),
    rationale: buildRationale(record, requestUrl),
    fit_score: deriveFitScore(record, input),
    source_name: COLLEGE_SCORECARD_SOURCE_NAME,
    source_urls: [COLLEGE_SCORECARD_DOCUMENTATION_URL, requestUrl]
  };
}

export function buildCollegeScorecardRequestUrl(
  apiKey: string,
  stateCode: string
): string {
  const url = new URL(COLLEGE_SCORECARD_API_BASE_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("school.state", stateCode);
  url.searchParams.set("fields", SCORECARD_FIELDS.join(","));
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", "0");

  return url.toString();
}

export function redactCollegeScorecardRequestUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  url.searchParams.set("api_key", "REDACTED");
  return url.toString();
}

export async function fetchCollegeScorecardSchoolsForState(
  apiKey: string,
  stateCode: string,
  fetchText: FetchTextFn = safeFetchText
): Promise<CollegeScorecardFetchResult> {
  const requestUrl = buildCollegeScorecardRequestUrl(apiKey, stateCode);
  const responseText = await fetchText(requestUrl, { timeoutMs: 12_000 });
  const payload = JSON.parse(responseText) as {
    results?: CollegeScorecardSchoolRecord[];
  };

  return {
    records: payload.results ?? [],
    request_url: redactCollegeScorecardRequestUrl(requestUrl)
  };
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export async function generateCollegeScorecardCandidates(
  input: ProspectGenerationInput,
  jobId: string,
  options?: {
    apiKey?: string;
    fetchText?: FetchTextFn;
  }
): Promise<ProspectSourceCandidate[]> {
  const apiKey = options?.apiKey ?? getCollegeScorecardApiKey();

  if (!apiKey) {
    throw new Error("College Scorecard API key is not configured.");
  }

  const stateCodes = resolveStateCodesFromGeography(input.geography);
  const fetchText = options?.fetchText ?? safeFetchText;
  const candidatesByKey = new Map<string, ProspectSourceCandidate>();

  for (const stateCode of stateCodes) {
    let fetchResult: CollegeScorecardFetchResult;

    try {
      fetchResult = await fetchCollegeScorecardSchoolsForState(
        apiKey,
        stateCode,
        fetchText
      );
    } catch (error) {
      if (error instanceof SafeFetchError) {
        throw new Error("Could not retrieve College Scorecard data.");
      }

      throw error;
    }

    for (const record of fetchResult.records) {
      const candidate = mapCollegeScorecardRecordToCandidate(
        record,
        input,
        fetchResult.request_url
      );

      if (!candidate) {
        continue;
      }

      const dedupeKey = `${candidate.organization_name.toLowerCase()}|${candidate.state}`;
      candidatesByKey.set(dedupeKey, candidate);
    }
  }

  return Array.from(candidatesByKey.values())
    .sort((left, right) => {
      const leftScore = hashString(`${jobId}:${left.organization_name}`);
      const rightScore = hashString(`${jobId}:${right.organization_name}`);
      return leftScore - rightScore || left.organization_name.localeCompare(right.organization_name);
    })
    .slice(0, input.maxResults);
}
