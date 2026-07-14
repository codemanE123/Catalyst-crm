"use client";

import {
  formatProspectEnrichedAt,
  hasProspectEnrichmentContent,
  PROSPECT_CANDIDATE_ENRICHMENT_STATUS_LABELS,
  PROSPECT_ENRICHMENT_REVIEW_STATE_LABELS,
  PROSPECT_ENRICHMENT_REVIEW_WARNING,
  prospectEnrichmentReviewStateStyles,
  resolveProspectEnrichmentReviewState
} from "@/lib/prospectEnrichmentReview";
import type { ProspectCandidate } from "@/lib/prospectGeneration";

export default function ProspectEnrichmentReviewPanel({
  candidate,
  llmEnrichmentEnabled,
  llmEnrichmentDisabledReason,
  isEnriching
}: {
  candidate: Pick<
    ProspectCandidate,
    | "enrichment_status"
    | "enrichment_summary"
    | "outreach_angle"
    | "recommended_next_step"
    | "enriched_at"
  >;
  llmEnrichmentEnabled: boolean;
  llmEnrichmentDisabledReason: string;
  isEnriching: boolean;
}) {
  const reviewState = resolveProspectEnrichmentReviewState({
    enrichmentStatus: candidate.enrichment_status,
    llmEnrichmentEnabled,
    isEnriching
  });
  const showEnrichmentFields =
    reviewState === "enriched" && hasProspectEnrichmentContent(candidate);

  return (
    <div className="max-w-md space-y-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${prospectEnrichmentReviewStateStyles[reviewState]}`}
        >
          {PROSPECT_ENRICHMENT_REVIEW_STATE_LABELS[reviewState]}
        </span>
        <span className="text-xs text-slate-500">
          Record: {PROSPECT_CANDIDATE_ENRICHMENT_STATUS_LABELS[candidate.enrichment_status]}
        </span>
      </div>

      {reviewState === "queued" ? (
        <p className="text-xs text-sky-800" role="status">
          Enrichment is queued. The background worker will claim this job shortly.
        </p>
      ) : null}

      {reviewState === "running" ? (
        <p className="text-xs text-indigo-800" role="status">
          Enrichment is running. Structured AI output will appear when the worker finishes.
        </p>
      ) : null}

      {reviewState === "not_enriched" ? (
        <p className="text-xs text-slate-600">
          No AI enrichment yet. Use Enrich to queue a draft summary, outreach angle, and
          recommended next step from public data.
        </p>
      ) : null}

      {reviewState === "enrichment_disabled" ? (
        <p className="text-xs text-amber-800">{llmEnrichmentDisabledReason}</p>
      ) : null}

      {reviewState === "policy_denied" ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-950">
          <p className="font-medium">Enrichment was denied by agent policy or readiness.</p>
          <p className="mt-1">
            This is not retried automatically. Resolve policy or certification, then try Enrich
            again. Human approval is still required before CRM promotion.
          </p>
        </div>
      ) : null}

      {reviewState === "budget_denied" ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-950">
          <p className="font-medium">Enrichment was denied by AI budget or call limits.</p>
          <p className="mt-1">
            This is not retried automatically. Wait for limits to reset or adjust budgets, then try
            Enrich again.
          </p>
        </div>
      ) : null}

      {reviewState === "failed" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-950">
          <p className="font-medium">Enrichment did not complete.</p>
          <p className="mt-1">
            Transient provider failures may be retried by the worker. Permanent validation failures
            will not. You can try Enrich again or approve/reject without AI output. Human approval
            is still required.
          </p>
        </div>
      ) : null}

      {showEnrichmentFields ? (
        <dl className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950">
          <div>
            <dt className="font-semibold uppercase tracking-wide text-violet-800">
              Summary
            </dt>
            <dd className="mt-1 leading-5">
              {candidate.enrichment_summary ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-violet-800">
              Outreach angle
            </dt>
            <dd className="mt-1 leading-5">{candidate.outreach_angle ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-violet-800">
              Recommended next step
            </dt>
            <dd className="mt-1 leading-5">
              {candidate.recommended_next_step ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-violet-800">
              Enriched at
            </dt>
            <dd className="mt-1">{formatProspectEnrichedAt(candidate.enriched_at)}</dd>
          </div>
        </dl>
      ) : null}

      {reviewState === "enriched" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
          {PROSPECT_ENRICHMENT_REVIEW_WARNING}
        </p>
      ) : null}
    </div>
  );
}
