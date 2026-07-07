import Link from "next/link";

import {
  PROSPECT_JOB_STATUS_LABELS,
  summarizeProspectJobInput,
  type ProspectGenerationJob,
  type ProspectJobStatus
} from "@/lib/prospectGeneration";

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

export default function ProspectJobHistory({
  jobs,
  source
}: {
  jobs: ProspectGenerationJob[];
  source: "supabase" | "sample";
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Job history</h2>
          <p className="text-sm text-slate-600">
            Track queued, running, completed, and failed prospect generation jobs.
          </p>
        </div>
        {source === "sample" ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            Sample data
          </span>
        ) : null}
      </div>

      {jobs.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">No prospect generation jobs yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Criteria</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Completed</th>
                <th className="px-3 py-2 font-medium">Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="px-3 py-3 text-slate-700">
                    {formatTimestamp(job.created_at)}
                  </td>
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
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {formatTimestamp(job.completed_at)}
                  </td>
                  <td className="px-3 py-3">
                    {job.status === "completed" ? (
                      <Link
                        className="font-medium text-sky-700 hover:text-sky-900"
                        href={`/prospects/jobs/${job.id}/review`}
                      >
                        Open review queue
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
