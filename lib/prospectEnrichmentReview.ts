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
  queued: "Queued",
  running: "Running",
  enriched: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  policy_denied: "Policy denied",
  budget_denied: "Budget denied"
};

export type ProspectEnrichmentReviewState =
  | "not_enriched"
  | "enrichment_disabled"
  | "queued"
  | "running"
  | "enriched"
  | "failed"
  | "policy_denied"
  | "budget_denied";

export const PROSPECT_ENRICHMENT_REVIEW_STATE_LABELS: Record<
  ProspectEnrichmentReviewState,
  string
> = {
  not_enriched: "Not enriched",
  enrichment_disabled: "Enrichment disabled",
  queued: "Queued",
  running: "Running",
  enriched: "Completed",
  failed: "Failed",
  policy_denied: "Policy denied",
  budget_denied: "Budget denied"
};

export const prospectEnrichmentReviewStateStyles: Record<
  ProspectEnrichmentReviewState,
  string
> = {
  not_enriched: "bg-slate-100 text-slate-800 ring-slate-200",
  enrichment_disabled: "bg-amber-100 text-amber-900 ring-amber-200",
  queued: "bg-sky-100 text-sky-900 ring-sky-200",
  running: "bg-indigo-100 text-indigo-900 ring-indigo-200",
  enriched: "bg-violet-100 text-violet-900 ring-violet-200",
  failed: "bg-red-100 text-red-900 ring-red-200",
  policy_denied: "bg-orange-100 text-orange-900 ring-orange-200",
  budget_denied: "bg-rose-100 text-rose-900 ring-rose-200"
};

export function resolveProspectEnrichmentReviewState(params: {
  enrichmentStatus: ProspectCandidateEnrichmentStatus;
  llmEnrichmentEnabled: boolean;
  isEnriching: boolean;
}): ProspectEnrichmentReviewState {
  if (params.enrichmentStatus === "enriched") {
    return "enriched";
  }

  if (params.enrichmentStatus === "queued") {
    return "queued";
  }

  if (params.enrichmentStatus === "running" || params.isEnriching) {
    return "running";
  }

  if (params.enrichmentStatus === "policy_denied") {
    return "policy_denied";
  }

  if (params.enrichmentStatus === "budget_denied") {
    return "budget_denied";
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

export function isProspectEnrichmentInProgress(
  status: ProspectCandidateEnrichmentStatus
): boolean {
  return status === "queued" || status === "running";
}
