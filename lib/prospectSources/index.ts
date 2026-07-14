import { generateMockProspectCandidates } from "@/lib/prospectCandidateStub";
import type { ProspectGenerationInput } from "@/lib/prospectGeneration";

import {
  COLLEGE_SCORECARD_SOURCE_NAME,
  CollegeScorecardProviderError,
  generateCollegeScorecardCandidates,
  isCollegeScorecardConfigured
} from "./collegeScorecard";
import {
  mayUseCollegeScorecardStubFallback,
  resolveCollegeScorecardConfig
} from "./config";
import {
  toProspectCandidateDraft,
  type ProspectGenerationRunResult,
  type ProspectSourceCandidate
} from "./types";

function buildStubResult(
  input: ProspectGenerationInput,
  jobId: string,
  fallbackReason: string,
  warnings: string[] = []
): ProspectGenerationRunResult {
  const drafts = generateMockProspectCandidates(input, jobId);

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
      provider_request_count: 0
    }
  };
}

function buildConfigurationResult(params: {
  reason: string;
  configurationStatus:
    | "disabled"
    | "missing_api_key"
    | "error"
    | "no_matches";
  providerErrorCode?: string | null;
  warnings?: string[];
  requestCount?: number;
}): ProspectGenerationRunResult {
  return {
    drafts: [],
    summary: {
      candidate_count: 0,
      source: "unconfigured",
      source_name: COLLEGE_SCORECARD_SOURCE_NAME,
      fallback_reason: params.reason,
      warnings: params.warnings ?? [params.reason],
      configuration_status: params.configurationStatus,
      provider_error_code: params.providerErrorCode ?? null,
      provider_request_count: params.requestCount ?? 0
    }
  };
}

function buildCollegeScorecardResult(
  candidates: ProspectSourceCandidate[],
  requestCount: number
): ProspectGenerationRunResult {
  const drafts = candidates.map((candidate) => toProspectCandidateDraft(candidate));

  return {
    drafts,
    summary: {
      candidate_count: drafts.length,
      source: "college_scorecard",
      source_name:
        candidates[0]?.source_name ?? COLLEGE_SCORECARD_SOURCE_NAME,
      configuration_status: "ready",
      provider_error_code: null,
      provider_request_count: requestCount
    }
  };
}

/**
 * Single prospect discovery entrypoint for queued jobs.
 * Production/staging never silently fall back to mock candidates.
 */
export async function generateProspectCandidatesForJob(
  input: ProspectGenerationInput,
  jobId: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    fetchText?: (
      url: string,
      opts?: { timeoutMs?: number }
    ) => Promise<string>;
  }
): Promise<ProspectGenerationRunResult> {
  const env = options?.env ?? process.env;
  const config = resolveCollegeScorecardConfig(env);
  const allowStub = mayUseCollegeScorecardStubFallback(env);

  if (!config.enabled) {
    if (allowStub) {
      return buildStubResult(
        input,
        jobId,
        "COLLEGE_SCORECARD_ENABLED is false; used development stub generator.",
        ["College Scorecard is disabled. Stub used only in development."]
      );
    }

    return buildConfigurationResult({
      reason:
        "College Scorecard is disabled. Set COLLEGE_SCORECARD_ENABLED=true and configure COLLEGE_SCORECARD_API_KEY.",
      configurationStatus: "disabled",
      providerErrorCode: "disabled"
    });
  }

  if (!isCollegeScorecardConfigured(env)) {
    if (allowStub) {
      return buildStubResult(
        input,
        jobId,
        "COLLEGE_SCORECARD_API_KEY is not configured; used development stub generator."
      );
    }

    return buildConfigurationResult({
      reason:
        "College Scorecard is not configured. Set COLLEGE_SCORECARD_API_KEY (or DATA_GOV_API_KEY).",
      configurationStatus: "missing_api_key",
      providerErrorCode: "not_configured"
    });
  }

  try {
    const { candidates, meta } = await generateCollegeScorecardCandidates(
      input,
      jobId,
      {
        apiKey: config.apiKey ?? undefined,
        config,
        fetchText: options?.fetchText
      }
    );

    if (candidates.length === 0) {
      if (allowStub) {
        return buildStubResult(
          input,
          jobId,
          "College Scorecard returned no institutions matching the job criteria; used development stub generator.",
          [
            "No College Scorecard matches for the selected geography, school types, and keywords."
          ]
        );
      }

      return buildConfigurationResult({
        reason:
          meta.error_message ??
          "College Scorecard returned no institutions matching the job criteria.",
        configurationStatus: "no_matches",
        providerErrorCode: "no_matches",
        requestCount: meta.request_count,
        warnings: [
          "No College Scorecard matches for the selected geography, school types, and keywords."
        ]
      });
    }

    return buildCollegeScorecardResult(candidates, meta.request_count);
  } catch (error) {
    const code =
      error instanceof CollegeScorecardProviderError
        ? error.code
        : "provider_error";
    const message =
      error instanceof Error
        ? error.message
        : "College Scorecard source adapter failed.";

    // Never include secrets or raw provider payloads in surfaced errors.
    const safeMessage = message.replace(/api_key=[^&\s]+/gi, "api_key=REDACTED");

    if (allowStub) {
      return buildStubResult(
        input,
        jobId,
        `${safeMessage} Used development stub generator.`,
        [safeMessage]
      );
    }

    return buildConfigurationResult({
      reason: safeMessage,
      configurationStatus: "error",
      providerErrorCode: code,
      warnings: [safeMessage]
    });
  }
}
