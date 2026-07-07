import type { ProspectCandidateEnrichmentStatus } from "@/lib/prospectGeneration";

export const PROSPECT_ENRICHMENT_REVIEW_WARNING =
  "AI-generated output is assistive only. Review every field for accuracy before approving this candidate into the CRM.";

export const PROSPECT_ENRICHMENT_QUEUE_WARNING =
  "Optional AI enrichment produces draft summaries from public institution data. Human approval is always required before a candidate becomes a CRM school.";

export const PROSPECT_CANDIDATE_ENRICHMENT_STATUS_LABELS: Record<
  ProspectCandidateEnrichmentStatus,
  string
> = {
  not_enriched: "Not enriched",
  enriched: "Enriched",
  failed: "Failed",
  blocked: "Blocked"
};

export type ProspectEnrichmentReviewState =
  | "not_enriched"
  | "enrichment_disabled"
  | "enriching"
  | "enriched"
  | "failed";

export const PROSPECT_ENRICHMENT_REVIEW_STATE_LABELS: Record<
  ProspectEnrichmentReviewState,
  string
> = {
  not_enriched: "Not enriched",
  enrichment_disabled: "Enrichment disabled",
  enriching: "Enriching",
  enriched: "Enriched",
  failed: "Failed"
};

export const prospectEnrichmentReviewStateStyles: Record<
  ProspectEnrichmentReviewState,
  string
> = {
  not_enriched: "bg-slate-100 text-slate-800 ring-slate-200",
  enrichment_disabled: "bg-amber-100 text-amber-900 ring-amber-200",
  enriching: "bg-sky-100 text-sky-900 ring-sky-200",
  enriched: "bg-violet-100 text-violet-900 ring-violet-200",
  failed: "bg-red-100 text-red-900 ring-red-200"
};

export function resolveProspectEnrichmentReviewState(params: {
  enrichmentStatus: ProspectCandidateEnrichmentStatus;
  llmEnrichmentEnabled: boolean;
  isEnriching: boolean;
}): ProspectEnrichmentReviewState {
  if (params.isEnriching) {
    return "enriching";
  }

  if (params.enrichmentStatus === "enriched") {
    return "enriched";
  }

  if (
    params.enrichmentStatus === "failed" ||
    params.enrichmentStatus === "blocked"
  ) {
    return "failed";
  }

  if (!params.llmEnrichmentEnabled) {
    return "enrichment_disabled";
  }

  return "not_enriched";
}

export function formatProspectEnrichedAt(value: string | null): string {
  if (!value?.trim()) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

export function hasProspectEnrichmentContent(candidate: {
  enrichment_summary: string | null;
  outreach_angle: string | null;
  recommended_next_step: string | null;
}): boolean {
  return Boolean(
    candidate.enrichment_summary?.trim() ||
      candidate.outreach_angle?.trim() ||
      candidate.recommended_next_step?.trim()
  );
}
