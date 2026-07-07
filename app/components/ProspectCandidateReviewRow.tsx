"use client";

import type {
  ProspectCandidateActionResult
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
  approveAction,
  rejectAction
}: {
  candidate: ProspectCandidate;
  jobId: string;
  canReview: boolean;
  actionsEnabled: boolean;
  approveAction: (formData: FormData) => Promise<ProspectCandidateActionResult>;
  rejectAction: (formData: FormData) => Promise<ProspectCandidateActionResult>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        {formatConfidence(candidate.confidence_score)}
      </td>
      <td className="px-3 py-3 text-slate-700">{candidate.rationale ?? "—"}</td>
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
      <td className="px-3 py-3">
        {candidate.status === "pending_review" && canReview ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                disabled={!actionsEnabled || isPending}
                onClick={handleApprove}
                type="button"
              >
                Approve
              </button>
              <button
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-60"
                disabled={!actionsEnabled || isPending}
                onClick={handleReject}
                type="button"
              >
                Reject
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
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}
