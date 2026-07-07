import { generateMockProspectCandidates } from "@/lib/prospectCandidateStub";
import type { ProspectGenerationInput } from "@/lib/prospectGeneration";

import {
  generateCollegeScorecardCandidates,
  isCollegeScorecardConfigured
} from "./collegeScorecard";
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
      warnings
    }
  };
}

function buildCollegeScorecardResult(
  candidates: ProspectSourceCandidate[]
): ProspectGenerationRunResult {
  const drafts = candidates.map((candidate) => toProspectCandidateDraft(candidate));

  return {
    drafts,
    summary: {
      candidate_count: drafts.length,
      source: "college_scorecard",
      source_name: candidates[0]?.source_name ?? "U.S. Department of Education College Scorecard"
    }
  };
}

export async function generateProspectCandidatesForJob(
  input: ProspectGenerationInput,
  jobId: string
): Promise<ProspectGenerationRunResult> {
  if (!isCollegeScorecardConfigured()) {
    return buildStubResult(
      input,
      jobId,
      "COLLEGE_SCORECARD_API_KEY is not configured; used stub generator fallback."
    );
  }

  try {
    const candidates = await generateCollegeScorecardCandidates(input, jobId);

    if (candidates.length === 0) {
      return buildStubResult(
        input,
        jobId,
        "College Scorecard returned no institutions matching the job criteria; used stub generator fallback.",
        ["No College Scorecard matches for the selected geography, school types, and keywords."]
      );
    }

    return buildCollegeScorecardResult(candidates);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "College Scorecard source adapter failed.";

    return buildStubResult(input, jobId, `${message} Used stub generator fallback.`, [
      message
    ]);
  }
}
