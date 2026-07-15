import type { ProspectGenerationInput, ProspectSchoolType } from "@/lib/prospectGeneration";
import { SafeFetchError, safeFetchText } from "@/lib/safeFetch";

import {
  isCollegeScorecardReady,
  resolveCollegeScorecardConfig,
  type CollegeScorecardConfig
} from "./config";
import { resolveStateCodesFromGeography } from "./geography";
import type {
  CollegeScorecardFetchResult,
  CollegeScorecardSchoolRecord,
  ProspectSourceCandidate
} from "./types";

export {
  getCollegeScorecardApiKey,
  isCollegeScorecardReady,
  mayUseCollegeScorecardStubFallback,
  resolveCollegeScorecardConfig
} from "./config";

export const COLLEGE_SCORECARD_SOURCE_NAME =
  "U.S. Department of Education College Scorecard";

export const COLLEGE_SCORECARD_DOCUMENTATION_URL =
  "https://collegescorecard.ed.gov/data/api/";

export const COLLEGE_SCORECARD_API_BASE_URL =
  "https://api.data.gov/ed/collegescorecard/v1/schools";

export const COLLEGE_SCORECARD_PROVIDER = "college_scorecard";

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

export type CollegeScorecardProviderErrorCode =
  | "not_configured"
  | "disabled"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "invalid_response"
  | "no_matches";

export type CollegeScorecardGenerationMeta = {
  request_count: number;
  state_count: number;
  page_count: number;
  error_code: CollegeScorecardProviderErrorCode | null;
  error_message: string | null;
};

export class CollegeScorecardProviderError extends Error {
  readonly code: CollegeScorecardProviderErrorCode;

  constructor(code: CollegeScorecardProviderErrorCode, message: string) {
    super(message);
    this.name = "CollegeScorecardProviderError";
    this.code = code;
  }
}

export function isCollegeScorecardConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return isCollegeScorecardReady(resolveCollegeScorecardConfig(env));
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
    enrollment != null
      ? `Public enrollment (latest.student.size): ${enrollment.toLocaleString("en-US")}.`
      : null,
    unitId ? `IPEDS/Scorecard ID: ${unitId}.` : null,
    `Source: ${COLLEGE_SCORECARD_SOURCE_NAME}.`,
    "No personal contact information was collected."
  ].filter(Boolean);

  return `${details.join(" ")} Citation query: ${requestUrl}`;
}

/**
 * Prefer API-side filters when they map cleanly to a single requested type.
 * Mixed type selections stay client-side filtered after broad state fetches.
 */
export function resolveScorecardApiFilters(
  schoolTypes: ProspectSchoolType[]
): Record<string, string> {
  if (schoolTypes.length !== 1) {
    return {};
  }

  switch (schoolTypes[0]) {
    case "hbcu":
      return { "school.minority_serving.historically_black": "1" };
    case "community_college":
      return { "school.degrees_awarded.predominant": "2" };
    case "state_university":
      return {
        "school.ownership": "1",
        "school.degrees_awarded.predominant": "3"
      };
    default:
      return {};
  }
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
  const enrollment = asNumber(getField(record, "latest.student.size"));

  return {
    organization_name: organizationName,
    website,
    city,
    state,
    school_type: deriveSchoolCategory(record),
    rationale: buildRationale(record, requestUrl),
    fit_score: deriveFitScore(record, input),
    source_name: COLLEGE_SCORECARD_SOURCE_NAME,
    source_urls: [COLLEGE_SCORECARD_DOCUMENTATION_URL, requestUrl],
    enrollment_size: enrollment,
    discovery_method: "college_scorecard",
    retrieved_at: new Date().toISOString()
  };
}

export function buildCollegeScorecardRequestUrl(params: {
  apiKey: string;
  stateCode: string;
  page: number;
  perPage: number;
  schoolNameKeyword?: string | null;
  apiFilters?: Record<string, string>;
}): string {
  const url = new URL(COLLEGE_SCORECARD_API_BASE_URL);
  url.searchParams.set("api_key", params.apiKey);
  url.searchParams.set("school.state", params.stateCode);
  url.searchParams.set("fields", SCORECARD_FIELDS.join(","));
  url.searchParams.set("per_page", String(params.perPage));
  url.searchParams.set("page", String(params.page));

  if (params.schoolNameKeyword) {
    url.searchParams.set("school.name", params.schoolNameKeyword);
  }

  for (const [key, value] of Object.entries(params.apiFilters ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

export function redactCollegeScorecardRequestUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  url.searchParams.set("api_key", "REDACTED");
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyFetchError(error: unknown): CollegeScorecardProviderError {
  if (error instanceof CollegeScorecardProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Provider request failed.";

  if (/status 429/i.test(message)) {
    return new CollegeScorecardProviderError(
      "rate_limited",
      "College Scorecard rate limit reached. Try again later."
    );
  }

  if (
    error instanceof SafeFetchError &&
    (/timeout|aborted|AbortError/i.test(message) || /TimeoutError/i.test(message))
  ) {
    return new CollegeScorecardProviderError(
      "timeout",
      "College Scorecard request timed out."
    );
  }

  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new CollegeScorecardProviderError(
      "timeout",
      "College Scorecard request timed out."
    );
  }

  if (error instanceof SafeFetchError) {
    return new CollegeScorecardProviderError(
      "provider_error",
      "Could not retrieve College Scorecard data."
    );
  }

  if (error instanceof SyntaxError) {
    return new CollegeScorecardProviderError(
      "invalid_response",
      "College Scorecard returned an invalid response."
    );
  }

  return new CollegeScorecardProviderError(
    "provider_error",
    "Could not retrieve College Scorecard data."
  );
}

function isRetriableProviderError(error: CollegeScorecardProviderError): boolean {
  return error.code === "rate_limited" || error.code === "timeout" || error.code === "provider_error";
}

export async function fetchCollegeScorecardSchoolsPage(params: {
  apiKey: string;
  stateCode: string;
  page: number;
  perPage: number;
  schoolNameKeyword?: string | null;
  apiFilters?: Record<string, string>;
  timeoutMs: number;
  maxRetries: number;
  fetchText?: FetchTextFn;
}): Promise<CollegeScorecardFetchResult> {
  const fetchText = params.fetchText ?? safeFetchText;
  const requestUrl = buildCollegeScorecardRequestUrl({
    apiKey: params.apiKey,
    stateCode: params.stateCode,
    page: params.page,
    perPage: params.perPage,
    schoolNameKeyword: params.schoolNameKeyword,
    apiFilters: params.apiFilters
  });
  const redacted = redactCollegeScorecardRequestUrl(requestUrl);

  let attempt = 0;
  let lastError: CollegeScorecardProviderError | null = null;

  while (attempt <= params.maxRetries) {
    try {
      const responseText = await fetchText(requestUrl, {
        timeoutMs: params.timeoutMs
      });
      const payload = JSON.parse(responseText) as {
        results?: CollegeScorecardSchoolRecord[];
        metadata?: { total?: number; page?: number; per_page?: number };
      };

      return {
        records: Array.isArray(payload.results) ? payload.results : [],
        request_url: redacted,
        page: params.page,
        total: asNumber(payload.metadata?.total ?? null)
      };
    } catch (error) {
      lastError = classifyFetchError(error);
      if (!isRetriableProviderError(lastError) || attempt >= params.maxRetries) {
        throw lastError;
      }
      const backoffMs = Math.min(4_000, 400 * 2 ** attempt);
      await sleep(backoffMs);
      attempt += 1;
    }
  }

  throw (
    lastError ??
    new CollegeScorecardProviderError(
      "provider_error",
      "Could not retrieve College Scorecard data."
    )
  );
}

/** @deprecated Prefer fetchCollegeScorecardSchoolsPage — kept for callers/tests. */
export async function fetchCollegeScorecardSchoolsForState(
  apiKey: string,
  stateCode: string,
  fetchText: FetchTextFn = safeFetchText
): Promise<CollegeScorecardFetchResult> {
  const config = resolveCollegeScorecardConfig();
  return fetchCollegeScorecardSchoolsPage({
    apiKey,
    stateCode,
    page: 0,
    perPage: config.perPage,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    fetchText
  });
}

function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function primarySchoolNameKeyword(keywords: string): string | null {
  const terms = parseKeywordTerms(keywords);
  // Prefer a multi-character term that looks like a school name filter for the API.
  const named = terms.find((term) => term.length >= 3 && !/^(cyber|security|it)$/.test(term));
  return named ?? null;
}

export async function generateCollegeScorecardCandidates(
  input: ProspectGenerationInput,
  jobId: string,
  options?: {
    apiKey?: string;
    fetchText?: FetchTextFn;
    config?: CollegeScorecardConfig;
    sleepFn?: (ms: number) => Promise<void>;
  }
): Promise<{
  candidates: ProspectSourceCandidate[];
  meta: CollegeScorecardGenerationMeta;
}> {
  const config = options?.config ?? resolveCollegeScorecardConfig();
  const apiKey = options?.apiKey ?? config.apiKey;
  const wait = options?.sleepFn ?? sleep;

  if (!config.enabled) {
    throw new CollegeScorecardProviderError(
      "disabled",
      "College Scorecard prospect source is disabled."
    );
  }

  if (!apiKey) {
    throw new CollegeScorecardProviderError(
      "not_configured",
      "College Scorecard API key is not configured."
    );
  }

  const stateCodes = resolveStateCodesFromGeography(input.geography);
  if (stateCodes.length === 0) {
    throw new CollegeScorecardProviderError(
      "no_matches",
      "No resolvable U.S. states were found for the requested geography."
    );
  }

  const fetchText = options?.fetchText ?? safeFetchText;
  const apiFilters = resolveScorecardApiFilters(input.schoolTypes);
  const schoolNameKeyword = primarySchoolNameKeyword(input.keywords);
  const candidatesByKey = new Map<string, ProspectSourceCandidate>();
  let requestCount = 0;
  let pageCount = 0;

  for (const stateCode of stateCodes) {
    for (let page = 0; page < config.maxPages; page += 1) {
      if (page > 0 || requestCount > 0) {
        await wait(config.minRequestIntervalMs);
      }

      const fetchResult = await fetchCollegeScorecardSchoolsPage({
        apiKey,
        stateCode,
        page,
        perPage: config.perPage,
        schoolNameKeyword,
        apiFilters,
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
        fetchText
      });

      requestCount += 1;
      pageCount += 1;

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

      // Stop paging this state when the API returns fewer than a full page.
      if (fetchResult.records.length < config.perPage) {
        break;
      }

      // Stop early once we have more than enough matches for maxResults.
      if (candidatesByKey.size >= input.maxResults * 3) {
        break;
      }
    }

    if (candidatesByKey.size >= input.maxResults * 3) {
      break;
    }
  }

  const candidates = Array.from(candidatesByKey.values())
    .sort((left, right) => {
      const leftScore = hashString(`${jobId}:${left.organization_name}`);
      const rightScore = hashString(`${jobId}:${right.organization_name}`);
      return (
        leftScore - rightScore ||
        left.organization_name.localeCompare(right.organization_name)
      );
    })
    .slice(0, input.maxResults);

  return {
    candidates,
    meta: {
      request_count: requestCount,
      state_count: stateCodes.length,
      page_count: pageCount,
      error_code: candidates.length === 0 ? "no_matches" : null,
      error_message:
        candidates.length === 0
          ? "College Scorecard returned no institutions matching the job criteria."
          : null
    }
  };
}
