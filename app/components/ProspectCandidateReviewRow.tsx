"use client";

import ProspectEnrichmentReviewPanel from "@/app/components/ProspectEnrichmentReviewPanel";
import ProspectOutreachDraftPanel from "@/app/components/ProspectOutreachDraftPanel";
import type {
  ProspectCandidateActionResult,
  ProspectCandidateEnrichResult,
  ProspectOutreachDraftResult
} from "@/lib/actions/prospectCandidates";
import {
  PROSPECT_CANDIDATE_STATUS_LABELS,
  type ProspectCandidate,
  type ProspectCandidateStatus
} from "@/lib/prospectGeneration";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const statusStyles: Record<ProspectCandidateStatus, string> = {
  pending_review: "bg-slate-100 text-slate-800 ring-slate-200",
  approved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  rejected: "bg-red-100 text-red-800 ring-red-200"
};

function formatConfidence(score: number | null) {
  if (score === null) {
    return "—";
  }

  return `${Math.round(score * 100)}%`;
}

export default function ProspectCandidateReviewRow({
  candidate,
  jobId,
  canReview,
  actionsEnabled,
  llmEnrichmentEnabled,
  llmEnrichmentDisabledReason,
  outreachDraftEnabled,
  outreachDraftDisabledReason,
  approveAction,
  rejectAction,
  enrichAction,
  generateDraftAction
}: {
  candidate: ProspectCandidate;
  jobId: string;
  canReview: boolean;
  actionsEnabled: boolean;
  llmEnrichmentEnabled: boolean;
  llmEnrichmentDisabledReason: string;
  outreachDraftEnabled: boolean;
  outreachDraftDisabledReason: string;
  approveAction: (formData: FormData) => Promise<ProspectCandidateActionResult>;
  rejectAction: (formData: FormData) => Promise<ProspectCandidateActionResult>;
  enrichAction: (candidateId: string) => Promise<ProspectCandidateEnrichResult>;
  generateDraftAction: (candidateId: string) => Promise<ProspectOutreachDraftResult>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrichNotice, setEnrichNotice] = useState<string | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isPending, startTransition] = useTransition();

  function buildFormData() {
    const formData = new FormData();
    formData.set("candidate_id", candidate.id);
    formData.set("job_id", jobId);
    return formData;
  }

  function handleApprove() {
    setMessage(null);
    setError(null);
    setEnrichNotice(null);

    startTransition(async () => {
      const result = await approveAction(buildFormData());

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(
        result.schoolId
          ? `${candidate.name} approved and added to the CRM.`
          : `${candidate.name} approved.`
      );
      router.refresh();
    });
  }

  function handleReject() {
    setMessage(null);
    setError(null);
    setEnrichNotice(null);

    startTransition(async () => {
      const result = await rejectAction(buildFormData());

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(`${candidate.name} rejected.`);
      router.refresh();
    });
  }

  function handleEnrich() {
    setMessage(null);
    setError(null);
    setEnrichNotice(null);

    if (!llmEnrichmentEnabled) {
      setEnrichNotice(llmEnrichmentDisabledReason);
      return;
    }

    setIsEnriching(true);

    startTransition(async () => {
      try {
        const result = await enrichAction(candidate.id);

        if (!result.ok) {
          if (result.disabled) {
            setEnrichNotice(result.error);
            return;
          }

          setError(result.error);
          return;
        }

        setMessage(result.message);
        router.refresh();
      } finally {
        setIsEnriching(false);
      }
    });
  }

  const actionsBusy = isPending || isEnriching;
  const canGenerateOutreachDraft =
    canReview &&
    (candidate.status === "pending_review" || candidate.status === "approved");

  return (
    <tr>
      <td className="px-3 py-3 font-medium text-slate-950">{candidate.name}</td>
      <td className="px-3 py-3 text-slate-700">
        {candidate.location ?? candidate.district ?? "—"}
      </td>
      <td className="px-3 py-3 text-slate-700">
        {candidate.website ? (
          <a
            className="text-sky-700 hover:text-sky-900"
            href={candidate.website}
            rel="noreferrer"
            target="_blank"
          >
            {candidate.website.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-3 text-slate-700">
        <div className="max-w-xs space-y-1">
          <p className="font-medium text-slate-900">{candidate.source_name ?? "—"}</p>
          {candidate.source_url ? (
            <a
              className="text-xs text-sky-700 hover:text-sky-900"
              href={candidate.source_url}
              rel="noreferrer"
              target="_blank"
            >
              View source
            </a>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 text-slate-700">
        <span className="font-medium text-slate-900">
          {formatConfidence(candidate.confidence_score)}
        </span>
      </td>
      <td className="px-3 py-3 text-slate-700">
        <p className="max-w-sm text-sm leading-5">{candidate.rationale ?? "—"}</p>
      </td>
      <td className="px-3 py-3 align-top text-slate-700">
        <ProspectEnrichmentReviewPanel
          candidate={candidate}
          isEnriching={isEnriching}
          llmEnrichmentDisabledReason={llmEnrichmentDisabledReason}
          llmEnrichmentEnabled={llmEnrichmentEnabled}
        />
      </td>
      <td className="px-3 py-3 align-top text-slate-700">
        <ProspectOutreachDraftPanel
          actionsEnabled={actionsEnabled}
          canGenerate={canGenerateOutreachDraft}
          candidateId={candidate.id}
          candidateName={candidate.name}
          generateDraftAction={generateDraftAction}
          outreachDraftDisabledReason={outreachDraftDisabledReason}
          outreachDraftEnabled={outreachDraftEnabled}
        />
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[candidate.status]}`}
        >
          {PROSPECT_CANDIDATE_STATUS_LABELS[candidate.status]}
        </span>
        {candidate.status === "approved" && candidate.promoted_school_id ? (
          <p className="mt-1 text-xs text-slate-500">
            <a
              className="text-sky-700 hover:text-sky-900"
              href={`/schools/${candidate.promoted_school_id}`}
            >
              View school
            </a>
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3 align-top">
        {candidate.status === "pending_review" && canReview ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                disabled={!actionsEnabled || actionsBusy}
                onClick={handleApprove}
                type="button"
              >
                Approve
              </button>
              <button
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                disabled={!actionsEnabled || actionsBusy}
                onClick={handleReject}
                type="button"
              >
                Reject
              </button>
              <button
                className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 disabled:opacity-60"
                disabled={!actionsEnabled || actionsBusy}
                onClick={handleEnrich}
                type="button"
              >
                {isEnriching ? "Enriching…" : "Enrich"}
              </button>
            </div>
            {!actionsEnabled ? (
              <p className="text-xs text-amber-700">
                Connect Supabase to approve or reject candidates.
              </p>
            ) : null}
            {error ? (
              <p className="text-xs text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="text-xs text-emerald-700" role="status">
                {message}
              </p>
            ) : null}
            {enrichNotice ? (
              <p className="text-xs text-slate-600" role="status">
                {enrichNotice}
              </p>
            ) : null}
          </div>
        ) : candidate.enrichment_status === "enriched" ? (
          <span className="text-xs text-slate-500">Review AI output before approving.</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}
