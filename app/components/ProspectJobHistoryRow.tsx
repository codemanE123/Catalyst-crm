"use client";

import type { ProcessProspectGenerationJobResult } from "@/lib/actions/prospectGeneration";
import {
  PROSPECT_JOB_STATUS_LABELS,
  summarizeProspectJobInput,
  type ProspectGenerationJob,
  type ProspectJobStatus
} from "@/lib/prospectGeneration";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const statusStyles: Record<ProspectJobStatus, string> = {
  queued: "bg-slate-100 text-slate-800 ring-slate-200",
  running: "bg-sky-100 text-sky-800 ring-sky-200",
  completed: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  failed: "bg-red-100 text-red-800 ring-red-200"
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}

export default function ProspectJobHistoryRow({
  job,
  canProcess,
  actionsEnabled,
  processAction
}: {
  job: ProspectGenerationJob;
  canProcess: boolean;
  actionsEnabled: boolean;
  processAction: (formData: FormData) => Promise<ProcessProspectGenerationJobResult>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerateCandidates() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("job_id", job.id);
      const result = await processAction(formData);

      if (!result.ok) {
        setError(result.error);
        router.refresh();
        return;
      }

      setMessage(
        result.candidateCount === 1
          ? "Generated 1 candidate."
          : `Generated ${result.candidateCount} candidates.`
      );
      router.refresh();
    });
  }

  return (
    <tr>
      <td className="px-3 py-3 text-slate-700">{formatTimestamp(job.created_at)}</td>
      <td className="px-3 py-3 text-slate-700">
        {summarizeProspectJobInput(job.input)}
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusStyles[job.status]}`}
        >
          {PROSPECT_JOB_STATUS_LABELS[job.status]}
        </span>
        {job.status === "failed" && job.error_message ? (
          <p className="mt-1 max-w-xs text-xs text-red-700">{job.error_message}</p>
        ) : null}
        {error ? (
          <p className="mt-1 max-w-xs text-xs text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-1 max-w-xs text-xs text-emerald-700" role="status">
            {message}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3 text-slate-700">{formatTimestamp(job.completed_at)}</td>
      <td className="px-3 py-3">
        {job.status === "completed" ? (
          <Link
            className="font-medium text-sky-700 hover:text-sky-900"
            href={`/prospects/jobs/${job.id}/review`}
          >
            Open review queue
          </Link>
        ) : job.status === "queued" && canProcess ? (
          <div className="space-y-1">
            <button
              className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              disabled={!actionsEnabled || isPending}
              onClick={handleGenerateCandidates}
              type="button"
            >
              {isPending ? "Generating..." : "Generate candidates"}
            </button>
            {!actionsEnabled ? (
              <p className="text-xs text-amber-700">Connect Supabase to run stub generation.</p>
            ) : null}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}
