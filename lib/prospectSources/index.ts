import { generateMockProspectCandidates } from "@/lib/prospectCandidateStub";
import type { ProspectGenerationInput } from "@/lib/prospectGeneration";

import {
  COLLEGE_SCORECARD_SOURCE_NAME,
  generateCollegeScorecardCandidates,
  isCollegeScorecardConfigured
} from "./collegeScorecard";
import {
  mayUseCollegeScorecardStubFallback,
  resolveCollegeScorecardConfig
} from "./config";
import {
  extractRegistrableDomainHint,
  normalizeOrganizationName
} from "./domainAllowlist";
import {
  generatePublicWebCandidates,
  PUBLIC_WEB_SOURCE_NAME
} from "./publicWeb";
import {
  getPublicWebConfigurationStatus,
  isPublicWebDiscoveryReady,
  resolvePublicWebDiscoveryConfig
} from "./publicWebConfig";
import {
  toProspectCandidateDraft,
  type ProspectCandidateDraft,
  type ProspectGenerationRunResult,
  type ProspectSourceCandidate
} from "./types";

function buildStubResult(
  input: ProspectGenerationInput,
  jobId: string,
  fallbackReason: string,
  warnings: string[] = []
): ProspectGenerationRunResult {
  const drafts = generateMockProspectCandidates(input, jobId).map((draft) => ({
    ...draft,
    discovery_method: "stub_generator",
    retrieved_at: new Date().toISOString()
  }));

  return {
    drafts,
    summary: {
      candidate_count: drafts.length,
      source: "stub_generator",
      source_name: "Catalyst stub generator",
      fallback_reason: fallbackReason,
      warnings,
      configuration_status: "stub_dev_only",
      provider_error_code: null,
      provider_request_count: 0,
      discovery_methods: ["stub_generator"]
    }
  };
}

function buildConfigurationResult(params: {
  reason: string;
  configurationStatus:
    | "disabled"
    | "missing_api_key"
    | "error"
    | "no_matches"
    | "provider_not_configured";
  providerErrorCode?: string | null;
  warnings?: string[];
  requestCount?: number;
  source?: ProspectGenerationRunResult["summary"]["source"];
}): ProspectGenerationRunResult {
  return {
    drafts: [],
    summary: {
      candidate_count: 0,
      source: params.source ?? "unconfigured",
      source_name: COLLEGE_SCORECARD_SOURCE_NAME,
      fallback_reason: params.reason,
      warnings: params.warnings ?? [params.reason],
      configuration_status: params.configurationStatus,
      provider_error_code: params.providerErrorCode ?? null,
      provider_request_count: params.requestCount ?? 0
    }
  };
}

function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) {
    return null;
  }
  try {
    const host = new URL(website).hostname;
    return extractRegistrableDomainHint(host);
  } catch {
    return null;
  }
}

function mergeCandidates(
  primary: ProspectSourceCandidate[],
  secondary: ProspectSourceCandidate[],
  maxResults: number
): {
  merged: ProspectSourceCandidate[];
  duplicateCount: number;
} {
  const seenDomains = new Set<string>();
  const seenNames = new Set<string>();
  const merged: ProspectSourceCandidate[] = [];
  let duplicateCount = 0;

  for (const candidate of [...primary, ...secondary]) {
    if (merged.length >= maxResults) {
      break;
    }
    const domain = domainFromWebsite(candidate.website);
    const nameKey = normalizeOrganizationName(candidate.organization_name);
    if (
      (domain && seenDomains.has(domain)) ||
      (nameKey && seenNames.has(nameKey))
    ) {
      duplicateCount += 1;
      continue;
    }
    if (domain) {
      seenDomains.add(domain);
    }
    if (nameKey) {
      seenNames.add(nameKey);
    }
    merged.push(candidate);
  }

  return { merged, duplicateCount };
}

/**
 * Single prospect discovery entrypoint for queued worker jobs.
 * Order: College Scorecard → public web (when more results needed) → stub (dev only).
 * Production/staging never silently fall back to mock candidates.
 */
export async function generateProspectCandidatesForJob(
  input: ProspectGenerationInput,
  jobId: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    fetchText?: (
      url: string,
      opts?: { timeoutMs?: number; maxBytes?: number; headers?: HeadersInit }
    ) => Promise<string>;
  }
): Promise<ProspectGenerationRunResult> {
  const env = options?.env ?? process.env;
  const scorecardConfig = resolveCollegeScorecardConfig(env);
  const publicWebConfig = resolvePublicWebDiscoveryConfig(env);
  const allowStub = mayUseCollegeScorecardStubFallback(env);
  const warnings: string[] = [];
  let requestCount = 0;

  let scorecardCandidates: ProspectSourceCandidate[] = [];
  let scorecardError: string | null = null;
  let scorecardStatus:
    | "ready"
    | "disabled"
    | "missing_api_key"
    | "error"
    | "no_matches"
    | null = null;

  if (scorecardConfig.enabled && isCollegeScorecardConfigured(env)) {
    try {
      const { candidates, meta } = await generateCollegeScorecardCandidates(
        input,
        jobId,
        {
          apiKey: scorecardConfig.apiKey ?? undefined,
          config: scorecardConfig,
          fetchText: options?.fetchText
        }
      );
      requestCount += meta.request_count;
      scorecardCandidates = candidates.map((candidate) => ({
        ...candidate,
        discovery_method: candidate.discovery_method ?? "college_scorecard",
        retrieved_at: candidate.retrieved_at ?? new Date().toISOString()
      }));
      scorecardStatus =
        candidates.length === 0 ? "no_matches" : "ready";
      if (candidates.length === 0) {
        warnings.push(
          meta.error_message ??
            "College Scorecard returned no institutions matching the job criteria."
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.replace(/api_key=[^&\s]+/gi, "api_key=REDACTED")
          : "College Scorecard source adapter failed.";
      scorecardError = message;
      scorecardStatus = "error";
      warnings.push(message);
    }
  } else if (!scorecardConfig.enabled) {
    scorecardStatus = "disabled";
    warnings.push("College Scorecard is disabled.");
  } else {
    scorecardStatus = "missing_api_key";
    warnings.push("College Scorecard API key is not configured.");
  }

  const needMore = scorecardCandidates.length < input.maxResults;
  let publicWebCandidates: ProspectSourceCandidate[] = [];
  let publicWebDuplicate = 0;
  let publicWebSkipped = 0;
  let publicWebStatus = getPublicWebConfigurationStatus(publicWebConfig);

  if (needMore && isPublicWebDiscoveryReady(publicWebConfig)) {
    const existingDomains = new Set<string>();
    const existingNames = new Set<string>();
    for (const candidate of scorecardCandidates) {
      const domain = domainFromWebsite(candidate.website);
      if (domain) {
        existingDomains.add(domain);
      }
      existingNames.add(normalizeOrganizationName(candidate.organization_name));
    }

    const { candidates, meta } = await generatePublicWebCandidates(
      input,
      jobId,
      {
        env,
        config: publicWebConfig,
        fetchText: options?.fetchText,
        remainingSlots: input.maxResults - scorecardCandidates.length,
        existingDomains,
        existingNames
      }
    );
    requestCount += meta.request_count;
    publicWebCandidates = candidates;
    publicWebDuplicate = meta.duplicate_count;
    publicWebSkipped = meta.skipped.length;
    publicWebStatus = meta.configuration_status;
    if (meta.error_message) {
      warnings.push(meta.error_message);
    }
  } else if (needMore && publicWebConfig.enabled && !isPublicWebDiscoveryReady(publicWebConfig)) {
    warnings.push(
      `Public web discovery not ready (${publicWebStatus}).`
    );
  }

  const { merged, duplicateCount } = mergeCandidates(
    scorecardCandidates,
    publicWebCandidates,
    input.maxResults
  );

  if (merged.length > 0) {
    const drafts: ProspectCandidateDraft[] = merged.map(toProspectCandidateDraft);
    const usedScorecard = scorecardCandidates.length > 0;
    const usedWeb = publicWebCandidates.length > 0;
    const source = usedScorecard && usedWeb
      ? "college_scorecard_and_public_web"
      : usedWeb
        ? "public_web"
        : "college_scorecard";

    return {
      drafts,
      summary: {
        candidate_count: drafts.length,
        source,
        source_name:
          source === "public_web"
            ? PUBLIC_WEB_SOURCE_NAME
            : source === "college_scorecard_and_public_web"
              ? `${COLLEGE_SCORECARD_SOURCE_NAME} + ${PUBLIC_WEB_SOURCE_NAME}`
              : COLLEGE_SCORECARD_SOURCE_NAME,
        warnings: warnings.length > 0 ? warnings : undefined,
        configuration_status: "ready",
        provider_error_code: null,
        provider_request_count: requestCount,
        scorecard_candidate_count: scorecardCandidates.length,
        public_web_candidate_count: publicWebCandidates.length,
        duplicate_count: duplicateCount + publicWebDuplicate,
        skipped_count: publicWebSkipped,
        discovery_methods: [
          ...(usedScorecard ? ["college_scorecard"] : []),
          ...(usedWeb ? ["public_web"] : [])
        ]
      }
    };
  }

  // No candidates from live sources — stub only in local development.
  if (allowStub) {
    const reason =
      scorecardError ??
      warnings[0] ??
      "No live prospect sources returned candidates; used development stub generator.";
    return buildStubResult(input, jobId, reason, warnings);
  }

  const scorecardReady =
    scorecardConfig.enabled && isCollegeScorecardConfigured(env);
  const webReady = isPublicWebDiscoveryReady(publicWebConfig);
  const webStatus = getPublicWebConfigurationStatus(publicWebConfig);

  if (!scorecardReady && !webReady) {
    if (scorecardStatus === "disabled" && webStatus === "disabled") {
      return buildConfigurationResult({
        reason:
          "College Scorecard is disabled. Set COLLEGE_SCORECARD_ENABLED=true and configure COLLEGE_SCORECARD_API_KEY.",
        configurationStatus: "disabled",
        providerErrorCode: "disabled",
        warnings,
        requestCount
      });
    }

    if (scorecardStatus === "missing_api_key" && webStatus === "disabled") {
      return buildConfigurationResult({
        reason:
          "College Scorecard is not configured. Set COLLEGE_SCORECARD_API_KEY (or DATA_GOV_API_KEY).",
        configurationStatus: "missing_api_key",
        providerErrorCode: "not_configured",
        warnings,
        requestCount
      });
    }

    return buildConfigurationResult({
      reason:
        "No prospect discovery providers are configured. Set COLLEGE_SCORECARD_API_KEY and/or enable PUBLIC_WEB_DISCOVERY_ENABLED with WEB_SEARCH_API_KEY and WEB_SEARCH_ENGINE_ID.",
      configurationStatus: "provider_not_configured",
      providerErrorCode: "provider_not_configured",
      warnings,
      requestCount,
      source: "unconfigured"
    });
  }

  if (scorecardStatus === "error" && !webReady) {
    return buildConfigurationResult({
      reason: scorecardError ?? "Could not retrieve College Scorecard data.",
      configurationStatus: "error",
      providerErrorCode: "provider_error",
      warnings,
      requestCount
    });
  }

  return buildConfigurationResult({
    reason:
      warnings[0] ??
      "No institutions matched the selected geography, school types, and keywords.",
    configurationStatus: "no_matches",
    providerErrorCode: "no_matches",
    warnings,
    requestCount,
    source: scorecardReady ? "college_scorecard" : "public_web"
  });
}

export {
  isPublicWebDiscoveryReady,
  resolvePublicWebDiscoveryConfig,
  getPublicWebConfigurationStatus
} from "./publicWebConfig";
